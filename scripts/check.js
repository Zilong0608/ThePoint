'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function sources(directory){
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    if(entry.isSymbolicLink()||entry.name==='vendor')return [];
    const target=path.join(directory,entry.name);
    return entry.isDirectory()?sources(target):entry.name.endsWith('.js')?[target]:[];
  });
}
const files=[path.join(root,'server.js'),...['src','public','scripts','tests'].flatMap(folder=>sources(path.join(root,folder)))];
for(const file of files){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8',windowsHide:true});
  if(result.error||result.status!==0){console.error(path.relative(root,file),result.error||result.stderr);process.exit(1);}
}
console.log(`Syntax check passed: ${files.length} JavaScript files.`);
