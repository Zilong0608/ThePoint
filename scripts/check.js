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
// Moving a frontend file must not leave a page pointing at its old location.
const publicRoot=path.join(root,'public');
const pages=[...fs.readdirSync(publicRoot).filter(name=>name.endsWith('.html')).map(name=>path.join(publicRoot,name)),path.join(publicRoot,'admin','index.html')];
let references=0;
for(const page of pages){
  const html=fs.readFileSync(page,'utf8');
  for(const match of html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)=["']([^"']+)["']/gi)){
    const reference=match[1];
    if(/^(?:[a-z]+:|\/\/|#)/i.test(reference)||! /\.(?:js|css)(?:[?#]|$)/i.test(reference))continue;
    const filename=decodeURIComponent(reference.split(/[?#]/)[0]);
    const target=filename.startsWith('/')?path.join(publicRoot,filename):path.resolve(path.dirname(page),filename);
    const relative=path.relative(publicRoot,target);
    if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(target)||!fs.statSync(target).isFile()){
      console.error(`${path.relative(root,page)}: missing or invalid asset ${reference}`);process.exit(1);
    }
    references++;
  }
}
console.log(`Page asset check passed: ${references} local script and stylesheet references.`);
