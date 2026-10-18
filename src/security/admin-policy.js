'use strict';
const roles=['admin','editor','reviewer','support'];
function allowed(role,method,url){
  if(role==='admin')return true;
  if(!roles.includes(role))return false;
  if(['/api/admin/me','/api/admin/change-password'].includes(url))return true;
  if(method==='GET'&&url==='/api/admin/stats')return true;
  if(role==='support')return /^\/api\/admin\/(enquiries(?:\/\d+(?:\/(?:read|notes|follow-up))?)?|enquiry-owners)$/.test(url);
  const taxonomy=/^\/api\/admin\/(sections|categories|suburbs|media)(?:\/\d+)?$/;
  if(method==='GET'&&taxonomy.test(url))return true;
  if(role==='editor'&&method==='POST'&&url==='/api/admin/geocode')return true;
  if(role==='editor')return /^\/api\/admin\/(properties|agents|news|videos|schools|partners|services|sections|categories|suburbs|posts|media|drafts)(?:\/\d+)?$/.test(url)||url==='/api/admin/upload'||(method==='GET'&&url==='/api/admin/content-versions');
  return /^\/api\/admin\/(posts|vendors)(?:\/\d+)?$/.test(url)&&['GET','PUT'].includes(method)||method==='PUT'&&/^\/api\/admin\/(post|vendor)-revisions\/\d+\/review$/.test(url);
}
module.exports={roles,allowed};
