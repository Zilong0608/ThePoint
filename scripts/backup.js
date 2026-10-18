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
    else console.log(createBackup());
  }catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={createBackup,verifyBackup,restoreBackup};
