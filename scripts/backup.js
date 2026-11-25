'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {DATA_DIR,PROJECT_ROOT}=require('../src/config/paths');
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function listFiles(directory,prefix=''){
  if(!fs.existsSync(directory))return [];
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    if(entry.isSymbolicLink())throw new Error('备份不跟随符号链接：'+entry.name);
    const relative=path.join(prefix,entry.name),target=path.join(directory,entry.name);
    return entry.isDirectory()?listFiles(target,relative):entry.isFile()?[{relative,target}]:[];
  });
}
/* 备份目录名形如 thepoint-2026-10-18T05-51-56-203Z-ca48df */
const BACKUP_NAME=/^thepoint-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-[0-9a-f]{6}$/;
function backupsDir(dataDir){
  return path.resolve(process.env.TP_BACKUP_DIR
    ? path.resolve(PROJECT_ROOT,process.env.TP_BACKUP_DIR)
    : path.join(path.resolve(dataDir||DATA_DIR),'backups'));
}
function dirSize(directory){
  if(!fs.existsSync(directory))return 0;
  let total=0;
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    if(entry.isSymbolicLink())continue;
    const target=path.join(directory,entry.name);
    total+=entry.isDirectory()?dirSize(target):fs.statSync(target).size;
  }
  return total;
}
function diskSpace(directory){
  try{const s=fs.statfsSync(directory);return {free:s.bavail*s.bsize,total:s.blocks*s.bsize};}
  catch(e){return null;}   /* 某些文件系统拿不到,拿不到就不拦 */
}
/* 本次备份大致要占多少、盘上还剩多少、已有备份占了多少 */
function spaceReport(dataDir){
  const dir=path.resolve(dataDir||DATA_DIR);
  const database=path.join(dir,'data.sqlite');
  return {
    need:(fs.existsSync(database)?fs.statSync(database).size:0)+dirSize(path.join(dir,'uploads')),
    backups:dirSize(backupsDir(dataDir)),
    disk:diskSpace(dir)
  };
}
/* 清理旧备份。规则:
     · 最近 days 天 —— 每天只留最新一份(一天内重启多次产生的重复快照会被收掉)
     · 更早的     —— 每月只留最新一份,最多留 months 个月
     · 兜底       —— 无论多旧,永远至少保留最近 minKeep 份
   只处理「名字符合规则且含 manifest.json」的目录,其它东西(例如 legacy/)一律不碰。 */
function pruneBackups(options={}){
  const dir=backupsDir(options.dataDir);
  const keepDays=options.days??7,keepMonths=options.months??12,minKeep=options.minKeep??3;
  if(!fs.existsSync(dir))return {kept:0,removed:[],freed:0};
  const items=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(!entry.isDirectory()||entry.isSymbolicLink())continue;
    const m=BACKUP_NAME.exec(entry.name);
    if(!m)continue;
    const full=path.join(dir,entry.name);
    if(!fs.existsSync(path.join(full,'manifest.json')))continue;
    items.push({name:entry.name,full,
      at:Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z`),
      day:`${m[1]}-${m[2]}-${m[3]}`,month:`${m[1]}-${m[2]}`});
  }
  items.sort((a,b)=>b.at-a.at);                               /* 新 → 旧 */
  const keep=new Set();
  const cutoff=Date.now()-keepDays*86400000;
  const seenDay=new Set(),seenMonth=new Set();
  for(const item of items){
    if(item.at>=cutoff){
      if(!seenDay.has(item.day)){seenDay.add(item.day);keep.add(item.name);}
    }else if(!seenMonth.has(item.month)&&seenMonth.size<keepMonths){
      seenMonth.add(item.month);keep.add(item.name);
    }
  }
  /* 兜底是「总数不足 minKeep 份时按新到旧补齐」,不是无条件多留几份 ——
     否则同一天重启多次产生的重复快照会被兜底规则保下来,正好抵消掉按天收敛的效果 */
  for(const item of items){if(keep.size>=minKeep)break;keep.add(item.name);}
  const removed=[];let freed=0;
  for(const item of items){
    if(keep.has(item.name))continue;
    const size=dirSize(item.full);
    fs.rmSync(item.full,{recursive:true,force:true});
    removed.push(item.name);freed+=size;
  }
  return {kept:keep.size,removed,freed};
}

function createBackup(options={}){
  const dataDir=path.resolve(options.dataDir||DATA_DIR);
  const output=path.resolve(options.output||(process.env.TP_BACKUP_DIR?path.resolve(PROJECT_ROOT,process.env.TP_BACKUP_DIR):path.join(dataDir,'backups')));
  const name='thepoint-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex');
  const destination=path.join(output,name);fs.mkdirSync(destination,{recursive:true});
  const db=new DatabaseSync(path.join(dataDir,'data.sqlite'),{readOnly:true});
  try{db.exec(`VACUUM INTO '${path.join(destination,'data.sqlite').replace(/'/g,"''")}'`);}finally{db.close();}
  const files=[{relative:'data.sqlite',target:path.join(destination,'data.sqlite')}];
  for(const file of listFiles(path.join(dataDir,'uploads'))){
    const relative=path.join('uploads',file.relative),target=path.join(destination,relative);
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file.target,target);files.push({relative,target});
  }
  const manifest={format:'thepoint-backup-v1',created_at:new Date().toISOString(),files:files.map(f=>({path:f.relative.replace(/\\/g,'/'),size:fs.statSync(f.target).size,sha256:digest(f.target)}))};
  fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
  return {directory:destination,created_at:manifest.created_at,files:files.length};
}
function verifyBackup(directory){
  directory=path.resolve(directory);const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
  if(manifest.format!=='thepoint-backup-v1'||!Array.isArray(manifest.files)||!manifest.files.some(f=>f.path==='data.sqlite'))throw new Error('无效备份清单');
  for(const file of manifest.files){
    if(typeof file.path!=='string'||file.path.includes('..')||path.isAbsolute(file.path)||file.path.includes('\\')||!(/^(data\.sqlite|uploads\/.+)$/.test(file.path)))throw new Error('备份路径无效');
    const target=path.resolve(directory,file.path);
    let component=directory;for(const part of file.path.split('/')){component=path.join(component,part);if(fs.lstatSync(component).isSymbolicLink())throw new Error('备份包含符号链接');}
    if(!target.startsWith(directory+path.sep)||fs.lstatSync(target).isSymbolicLink()||fs.statSync(target).size!==file.size||digest(target)!==file.sha256)throw new Error('备份校验失败：'+file.path);
  }
  const db=new DatabaseSync(path.join(directory,'data.sqlite'),{readOnly:true});
  try{if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('数据库完整性检查失败');}finally{db.close();}
  return manifest;
}
function restoreBackup(directory,target){
  const manifest=verifyBackup(directory);target=path.resolve(target);
  if(fs.existsSync(target)&&fs.readdirSync(target).length)throw new Error('恢复目录必须为空，请先停止服务并选择一个新的数据目录');
  fs.mkdirSync(target,{recursive:true});
  for(const file of manifest.files){const dest=path.join(target,file.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(directory,file.path),dest,fs.constants.COPYFILE_EXCL);}
  return {directory:target,files:manifest.files.length};
}
if(require.main===module){
  try{
    const [command,source,target]=process.argv.slice(2);
    if(command==='verify')console.log(JSON.stringify(verifyBackup(source),null,2));
    else if(command==='restore'){if(!source||!target)throw new Error('用法：node scripts/backup.js restore <备份目录> <新的空数据目录>');console.log(restoreBackup(source,target));}
    else if(command==='prune')console.log(JSON.stringify(pruneBackups(),null,2));
    else if(command==='space')console.log(JSON.stringify(spaceReport(),null,2));
    else console.log(createBackup());
  }catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={createBackup,verifyBackup,restoreBackup,pruneBackups,spaceReport,diskSpace,dirSize,backupsDir};
