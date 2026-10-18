const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { once } = require('node:events');
const Content = require('../public/content');
const root = path.resolve(__dirname,'..');
let child, dir, base, admin, user, logs='';
async function request(route, method='GET', body, cookie='') {
  const res=await fetch(base+route,{ method, headers:{ ...(body instanceof FormData ? {} : {'Content-Type':'application/json'}), Cookie:cookie }, body:body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  const text=await res.text(); let data;try{data=JSON.parse(text);}catch(_){data=text;}
  return { status:res.status, data, cookie:res.headers.get('set-cookie')?.split(';')[0] };
}
before(async()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),'thepoint-editorial-'));
  require('./fixtures/database')(dir);
  const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise(r=>server.close(r));
  base='http://127.0.0.1:'+port;
  child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),TP_DATA_DIR:dir,TP_AUTO_BACKUP:'0',TP_SKIP_ENV_FILE:'1',NODE_ENV:'test',SMTP_HOST:'',SMTP_USER:'',SMTP_PASS:'',SMTP_FROM:'',PUBLIC_SITE_URL:'',COOKIE_SECURE:'0',TRUST_PROXY:'0'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  let ready=false;
  for(let i=0;i<100;i++){try{await fetch(base+'/api/sections');ready=true;break;}catch(_){await new Promise(r=>setTimeout(r,100));}}
  assert.ok(ready,logs);
  const a=await request('/api/admin/login','POST',{username:'admin',password:'thepoint2026'});assert.equal(a.status,200);admin=a.cookie;
  const u=await request('/api/auth/register','POST',{email:'editor-test@example.invalid',password:'test-password-123',name:'Test'});assert.equal(u.status,200);user=u.cookie;
});
after(async()=>{
  if(child && child.exitCode===null){const done=once(child,'exit');child.kill();await done;}
  // Only remove the exact temporary directory created by this test.
  if(dir && path.dirname(dir)===os.tmpdir() && path.basename(dir).startsWith('thepoint-editorial-'))fs.rmSync(dir,{recursive:true,force:true});
});
test('article renderer supports formatting and rejects active markup and URL tricks',()=>{
  const html=Content.render('## Hello\n\n**World**\n\n- First\n- Second\n\n![Caption](media/news-1.jpg)','markdown');
  assert.match(html,/<h3>Hello<\/h3>/);assert.match(html,/<strong>World<\/strong>/);assert.match(html,/<ul>/);assert.match(html,/<figure>/);
  const unsafe=Content.render('<script>alert(1)</script>\n\n[go](javascript:alert)\n\n![x](data:image/svg+xml,test)','markdown');
  assert.doesNotMatch(unsafe,/<script|href=|<img/);
  for(const url of ['//evil.test','javascript:alert(1)','https:\\evil.test','uploads/../server.js'])assert.equal(Content.safeUrl(url,true),'');
  assert.equal(Content.render('**Old article**','plain'),'<p>**Old article**</p>');
});
test('saved homes require login, persist per user and hide off-market details',async()=>{
  const properties=(await request('/api/properties')).data.items;const id=properties[0].id;
  assert.equal((await request('/api/my/favorites')).status,401);
  assert.equal((await request('/api/my/favorites/'+id,'PUT')).status,401);
  assert.equal((await request('/api/my/favorites/'+id,'PUT',undefined,user)).status,200);
  assert.equal((await request('/api/my/favorites/'+id,'PUT',undefined,user)).status,200);
  assert.equal((await request('/api/my/favorites','GET',undefined,user)).data.filter(x=>x.id===id).length,1);
  const other=await request('/api/auth/register','POST',{email:'favorites-other@example.invalid',password:'test-password-123',name:'Other'});
  assert.deepEqual((await request('/api/my/favorites','GET',undefined,other.cookie)).data,[]);
  await request('/api/my/favorites/'+id,'DELETE',undefined,other.cookie);
  assert.equal((await request('/api/my/favorites','GET',undefined,user)).data.length,1);
  const status=properties[0].status;
  assert.equal((await request('/api/admin/properties/'+id,'PUT',{status:'\u4e0b\u67b6'},admin)).status,200);
  assert.deepEqual((await request('/api/my/favorites','GET',undefined,user)).data,[{id,unavailable:true}]);
  assert.equal((await request('/api/my/favorites/'+id,'PUT',undefined,user)).status,404);
  await request('/api/admin/properties/'+id,'PUT',{status},admin);
  assert.equal((await request('/api/my/favorites/'+id,'DELETE',undefined,user)).status,200);
  assert.deepEqual((await request('/api/my/favorites','GET',undefined,user)).data,[]);
});

test('map search includes every matching location across list pages and hides off-market homes',async()=>{
  const ids=[];
  for(let i=0;i<14;i++){
    const p=await request('/api/admin/properties','POST',{title:'Map fixture '+i,address:i+' Map Test Lane',suburb:'MapAlbany',city:'Auckland',latitude:-36.72+i/10000,longitude:174.7,price_value:1000000+i,beds:3},admin);
    assert.equal(p.status,200);ids.push(p.data.id);
  }
  const missing=await request('/api/admin/properties','POST',{title:'Map fixture missing',suburb:'MapAlbany'},admin);
  const hidden=await request('/api/admin/properties','POST',{title:'Private hidden home',suburb:'MapAlbany',status:'下架',latitude:-36.72,longitude:174.7},admin);
  const rental=await request('/api/admin/properties','POST',{title:'Rental map fixture',suburb:'MapAlbany',listing_kind:'rent',price_value:850,rent_period:'week',latitude:-36.72,longitude:174.7},admin);
  const list=(await request('/api/properties?q=mapalbany&listing_kind=sale')).data;assert.equal(list.items.length,12);assert.equal(list.total,15);
  const map=(await request('/api/properties?q=mapalbany&listing_kind=sale&view=map')).data;
  assert.equal(map.items.length,14);assert.equal(map.mapped,14);assert.equal(map.unmapped,1);assert.equal(map.total,list.total);
  assert.ok(ids.every(id=>map.items.some(p=>p.id===id)));assert.equal(map.items.some(p=>p.id===hidden.data.id),false);assert.equal(map.truncated,false);
  assert.equal((await request('/api/properties?suburb=MapAlbany&listing_kind=rent&rent_period=week&view=map')).data.items[0].id,rental.data.id);
  assert.equal((await request('/api/properties?q=mapalbany&beds_min=4&view=map')).data.total,0);
  await request('/api/admin/properties/'+ids[0],'PUT',{address:'A new address'},admin);
  assert.equal((await request('/api/properties/'+ids[0])).data.latitude,null);
  assert.equal((await request('/api/properties?q=mapalbany&listing_kind=sale&view=map')).data.unmapped,2);
  assert.equal((await request('/api/admin/geocode','POST',{query:'Albany'})).status,401);
  assert.equal((await request('/api/admin/geocode','POST',{query:''},admin)).status,400);
  for(const id of [...ids,missing.data.id,hidden.data.id,rental.data.id])await request('/api/admin/properties/'+id,'DELETE',undefined,admin);
});

test('drafts are private and editing a published article does not change the public version',async()=>{
  const before=await request('/api/news/1');assert.equal(before.status,200);
  assert.equal((await request('/api/admin/drafts')).status,401);
  const d=await request('/api/admin/drafts','POST',{kind:'news',ref_id:1,payload:{title:'Private draft',content:'Not published',content_format:'markdown'}},admin);
  assert.equal(d.status,200);assert.ok(d.data.id);
  const update=await request('/api/admin/drafts/'+d.data.id,'PUT',{kind:'news',ref_id:1,payload:{title:'Updated draft'}},admin);assert.equal(update.status,200);
  assert.equal((await request('/api/news/1')).data.title,before.data.title);
  const list=await request('/api/admin/drafts','GET',undefined,admin);assert.equal(list.data[0].payload.title,'Updated draft');
  assert.equal((await request('/api/admin/drafts/'+d.data.id,'DELETE',undefined,admin)).data.ok,true);
});
test('formatted news can be saved hidden, then published with its formatting intact',async()=>{
  const result=await request('/api/admin/news','POST',{title:'Editorial test',content:'## Heading\n\n**Body**',content_format:'markdown',visible:0,published_at:''},admin);
  assert.equal(result.status,200);const id=result.data.id;
  assert.equal((await request('/api/news/'+id)).status,404);
  assert.equal((await request('/api/admin/news/'+id,'PUT',{visible:1},admin)).status,200);
  const live=await request('/api/news/'+id);assert.equal(live.data.content_format,'markdown');assert.ok(live.data.published_at);
});
test('official post creation respects status and publication date',async()=>{
  const p=await request('/api/admin/posts','POST',{title_zh:'Offline test',type:'article',status:'offline',published_at:'2026-01-02 10:00',content_format:'markdown'},admin);
  assert.equal(p.status,200);assert.equal((await request('/api/posts/'+p.data.id)).status,404);
  const list=await request('/api/admin/posts','GET',undefined,admin);const item=list.data.find(x=>x.id===p.data.id);
  assert.equal(item.status,'offline');assert.equal(item.published_at,'2026-01-02 10:00');
});
test('normal users cannot bypass marketplace/category restrictions on create or edit',async()=>{
  const sections=(await request('/api/sections')).data;
  const market=sections.find(x=>x.slug==='market'), other=sections.find(x=>x.slug==='education');
  const payload={title_zh:'Item',type:'market',section_id:other.id};
  assert.equal((await request('/api/my/posts','POST',payload,user)).status,400);
  assert.equal((await request('/api/my/posts','POST',{...payload,section_id:market.id,category_id:other.categories[0].id},user)).status,400);
  const valid=await request('/api/my/posts','POST',{...payload,section_id:market.id},user);assert.equal(valid.status,200);
  assert.equal((await request('/api/my/posts/'+valid.data.id,'PUT',{section_id:other.id},user)).status,400);
});
test('uploads verify bytes, normalize extension and register reusable media',async()=>{
  const bad=new FormData();bad.append('files',new Blob(['<script>bad</script>'],{type:'image/png'}),'fake.png');
  assert.equal((await request('/api/admin/upload','POST',bad,admin)).status,400);
  const fd=new FormData();fd.append('files',new Blob([fs.readFileSync(path.join(root,'public','media','news-1.jpg'))],{type:'image/jpeg'}),'photo.html');
  const upload=await request('/api/admin/upload','POST',fd,admin);assert.equal(upload.status,200);assert.match(upload.data.files[0],/^uploads\/[a-f0-9]+\.jpg$/);
  assert.equal((await request('/'+upload.data.files[0])).status,200);
  const media=await request('/api/admin/media?q=photo','GET',undefined,admin);assert.equal(media.data.length,1);
  assert.equal((await request('/api/admin/media/'+media.data[0].id,'PUT',{alt:'Saved caption'},admin)).status,200);
  assert.equal((await request('/api/admin/media?q=Saved','GET',undefined,admin)).data[0].alt,'Saved caption');
});
test('static allowlist hides source, documents and dependencies while serving editor assets',async()=>{
  for(const route of ['/server.js','/make-demo.js','/package.json','/README.md','/tests/editorial.test.js','/data.sqlite'])assert.equal((await request(route)).status,404,route);
  for(const route of ['/','/admin/','/admin/content-tools.js','/admin/content-tools.css','/content.js','/article.html?id=1','/post.html?id=1'])assert.equal((await request(route)).status,200,route);
});
test('rental properties retain photo order, floor plans and rental fields',async()=>{
  const body={title:'Rental test',listing_kind:'rent',status:'在租',price_label:'$850',price_value:850,rent_period:'week',available_from:'2027-02-01',bond:3400,images:['media/news-2.jpg','media/news-1.jpg'],floorplans:['media/prop-albany-1.jpg']};
  const created=await request('/api/admin/properties','POST',body,admin);assert.equal(created.status,200);
  const detail=await request('/api/properties/'+created.data.id);assert.equal(detail.data.cover,'media/news-2.jpg');assert.deepEqual(detail.data.floorplans,body.floorplans);assert.equal(detail.data.bond,3400);assert.ok(detail.data.updated_at);
  assert.equal((await request('/api/properties?listing_kind=rent&rent_period=week')).data.items.some(p=>p.id===created.data.id),true);
  assert.equal((await request('/api/properties?listing_kind=rent&rent_period=month')).data.items.some(p=>p.id===created.data.id),false);
  assert.equal((await request('/api/properties?listing_kind=sale')).data.items.some(p=>p.id===created.data.id),false);
  assert.equal((await request('/api/admin/properties/'+created.data.id,'PUT',{images:[...body.images].reverse()},admin)).status,200);
  assert.equal((await request('/api/properties/'+created.data.id)).data.cover,'media/news-1.jpg');
  assert.equal((await request('/api/admin/properties/'+created.data.id,'PUT',{listing_kind:'sale'},admin)).status,200);
  const sale=(await request('/api/properties/'+created.data.id)).data;assert.equal(sale.status,'在售');assert.equal(sale.bond,null);assert.equal(sale.available_from,'');
});
test('invalid property money, dates and image URLs are rejected',async()=>{
  for(const extra of [{price_value:-1},{listing_kind:'bad'},{listing_kind:'rent',available_from:'2027-02-30'},{floorplans:['javascript:alert(1)']},{images:['uploads/../server.js']}]){
    const result=await request('/api/admin/properties','POST',{title:'Invalid',...extra},admin);assert.equal(result.status,400,JSON.stringify(extra));
  }
});
test('viewing requests store New Zealand local time and derive the property agent',async()=>{
  const future=new Date(Date.now()+3*86400000).toISOString().slice(0,10)+'T14:30';
  const prop=(await request('/api/properties/1')).data;
  const requestBody={type:'viewing',property_id:1,agent_id:99999,name:'Viewing customer',email:'viewing@example.invalid',viewing_at:future};
  const result=await request('/api/enquiries','POST',requestBody);assert.equal(result.status,200);
  const enquiries=(await request('/api/admin/enquiries','GET',undefined,admin)).data;
  const viewing=enquiries.find(x=>x.type==='viewing');assert.equal(viewing.viewing_at,future);assert.equal(viewing.agent_id,prop.agent_id);
  assert.equal((await request('/api/enquiries','POST',{...requestBody,viewing_at:'2020-01-01T14:30'})).status,400);
  assert.equal((await request('/api/enquiries','POST',{...requestBody,viewing_at:'2027-02-30T14:30'})).status,400);
  assert.equal((await request('/api/enquiries','POST',{...requestBody,email:'',phone:''})).status,400);
});
test('off-market property details and viewing requests are blocked',async()=>{
  const created=await request('/api/admin/properties','POST',{title:'Off market',status:'下架'},admin);
  assert.equal(created.status,200);assert.equal((await request('/api/properties/'+created.data.id)).status,404);
  const payload={type:'viewing',property_id:created.data.id,name:'Visitor',phone:'021 000 0000',viewing_at:'2027-01-01T12:00'};
  assert.equal((await request('/api/enquiries','POST',payload)).status,400);
  await request('/api/admin/properties/'+created.data.id,'PUT',{status:'已售'},admin);
  assert.equal((await request('/api/enquiries','POST',payload)).status,400);
});
let vendorSequence=0;
async function vendorFixture(){
  const account=await request('/api/auth/register','POST',{email:`revision-${++vendorSequence}@example.invalid`,password:'test-password-123',name:'Vendor test'});
  const section=(await request('/api/sections')).data.find(s=>s.slug==='advisory');
  const application=await request('/api/vendor/apply','POST',{name_zh:'Original vendor',section_id:section.id,category_id:section.categories[0].id,tagline_zh:'Original tagline'},account.cookie);
  assert.equal(application.status,200);
  assert.equal((await request('/api/admin/vendors/'+application.data.id,'PUT',{status:'approved'},admin)).status,200);
  return {cookie:account.cookie,id:application.data.id};
}
test('customer follow-up records status, assignment and append-only private notes',async()=>{
  const row=(await request('/api/admin/enquiries','GET',undefined,admin)).data[0];
  const owner=(await request('/api/admin/enquiry-owners','GET',undefined,admin)).data[0];
  assert.equal((await request('/api/admin/enquiries/'+row.id+'/notes')).status,401);
  const first=await request('/api/admin/enquiries/'+row.id+'/follow-up','PUT',{version:row.followup_version,lead_status:'contacted',assignee_id:owner.id,note:'First private note'},admin);
  assert.equal(first.status,200);
  const second=await request('/api/admin/enquiries/'+row.id+'/follow-up','PUT',{version:first.data.version,lead_status:'scheduled',assignee_id:owner.id,note:'Second private note'},admin);
  assert.equal(second.status,200);
  const notes=(await request('/api/admin/enquiries/'+row.id+'/notes','GET',undefined,admin)).data;
  assert.equal(notes.length,2);assert.equal(notes[1].body,'First private note');assert.equal(notes[0].body,'Second private note');assert.equal(notes[0].author,'admin');
  const filtered=(await request('/api/admin/enquiries?status=scheduled','GET',undefined,admin)).data;
  assert.equal(filtered.find(x=>x.id===row.id).assignee_name,owner.username);
  const stale=await request('/api/admin/enquiries/'+row.id+'/follow-up','PUT',{version:row.followup_version,lead_status:'closed',note:'Must not be stored'},admin);
  assert.equal(stale.status,409);assert.equal((await request('/api/admin/enquiries/'+row.id+'/notes','GET',undefined,admin)).data.length,2);
  assert.equal((await request('/api/admin/enquiries/'+row.id+'/follow-up','PUT',{version:second.data.version,lead_status:'wrong'},admin)).status,400);
});
test('approved vendor changes stay private until the exact revision is approved',async()=>{
  const vendor=await vendorFixture();
  const revision=await request('/api/vendor/me','PUT',{name_zh:'Revised vendor',tagline_zh:'New tagline'},vendor.cookie);assert.equal(revision.status,200);assert.equal(revision.data.live_preserved,true);
  const live=(await request('/api/vendors/'+vendor.id)).data;assert.equal(live.name_zh,'Original vendor');assert.equal(live.revision,undefined);assert.equal(live.pending_revision,undefined);
  const me=(await request('/api/vendor/me','GET',undefined,vendor.cookie)).data;assert.equal(me.status,'approved');assert.equal(me.revision.payload.name_zh,'Revised vendor');
  const pending=(await request('/api/admin/vendors?status=pending','GET',undefined,admin)).data;assert.equal(pending.find(v=>v.id===vendor.id).pending_revision.id,revision.data.revision_id);
  assert.equal((await request('/api/admin/vendor-revisions/'+revision.data.revision_id+'/review','PUT',{action:'approve'},vendor.cookie)).status,401);
  assert.equal((await request('/api/admin/vendor-revisions/'+revision.data.revision_id+'/review','PUT',{action:'approve'},admin)).status,200);
  assert.equal((await request('/api/vendors/'+vendor.id)).data.name_zh,'Revised vendor');
  assert.equal((await request('/api/admin/vendor-revisions/'+revision.data.revision_id+'/review','PUT',{action:'approve'},admin)).status,409);
});
test('rejection and superseded revisions do not change the live vendor',async()=>{
  const vendor=await vendorFixture();
  const first=await request('/api/vendor/me','PUT',{tagline_zh:'First draft'},vendor.cookie);
  const second=await request('/api/vendor/me','PUT',{tagline_zh:'Second draft'},vendor.cookie);
  assert.notEqual(first.data.revision_id,second.data.revision_id);
  assert.equal((await request('/api/admin/vendor-revisions/'+first.data.revision_id+'/review','PUT',{action:'approve'},admin)).status,409);
  assert.equal((await request('/api/admin/vendor-revisions/'+second.data.revision_id+'/review','PUT',{action:'reject',note:''},admin)).status,400);
  assert.equal((await request('/api/admin/vendor-revisions/'+second.data.revision_id+'/review','PUT',{action:'reject',note:'Please verify your details'},admin)).status,200);
  assert.equal((await request('/api/vendors/'+vendor.id)).data.tagline_zh,'Original tagline');
  const me=(await request('/api/vendor/me','GET',undefined,vendor.cookie)).data;assert.equal(me.status,'approved');assert.equal(me.revision.status,'rejected');assert.equal(me.revision.review_note,'Please verify your details');
  const next=await request('/api/vendor/me','PUT',{tagline_zh:'Third draft'},vendor.cookie);assert.equal(next.status,200);assert.ok(next.data.revision_id);
});
test('revision approval protects admin edits and suspended profiles',async()=>{
  const vendor=await vendorFixture();
  const change=await request('/api/vendor/me','PUT',{tagline_zh:'Pending change'},vendor.cookie);
  await request('/api/admin/vendors/'+vendor.id,'PUT',{tagline_zh:'Admin correction'},admin);
  assert.equal((await request('/api/admin/vendor-revisions/'+change.data.revision_id+'/review','PUT',{action:'approve'},admin)).status,409);
  assert.equal((await request('/api/vendors/'+vendor.id)).data.tagline_zh,'Admin correction');
  await request('/api/admin/vendors/'+vendor.id,'PUT',{status:'suspended'},admin);
  assert.equal((await request('/api/admin/vendor-revisions/'+change.data.revision_id+'/review','PUT',{action:'approve'},admin)).status,409);
  assert.equal((await request('/api/vendor/me','PUT',{tagline_zh:'Bypass suspension'},vendor.cookie)).status,403);
  assert.equal((await request('/api/vendors/'+vendor.id)).status,404);
});
test('approving a revision preserves unrelated admin changes',async()=>{
  const vendor=await vendorFixture();
  const change=await request('/api/vendor/me','PUT',{tagline_zh:'Vendor update'},vendor.cookie);
  await request('/api/admin/vendors/'+vendor.id,'PUT',{phone:'021 123 4567',verified:1},admin);
  assert.equal((await request('/api/admin/vendor-revisions/'+change.data.revision_id+'/review','PUT',{action:'approve'},admin)).status,200);
  const me=(await request('/api/vendor/me','GET',undefined,vendor.cookie)).data;assert.equal(me.phone,'021 123 4567');assert.equal(me.verified,1);assert.equal(me.tagline_zh,'Vendor update');
});
test('reverting pending fields to the live values withdraws the revision',async()=>{
  const vendor=await vendorFixture();
  const change=await request('/api/vendor/me','PUT',{tagline_zh:'Temporary update'},vendor.cookie);
  const reverted=await request('/api/vendor/me','PUT',{tagline_zh:'Original tagline'},vendor.cookie);
  assert.equal(reverted.data.unchanged,true);assert.equal((await request('/api/vendor/me','GET',undefined,vendor.cookie)).data.revision.status,'withdrawn');
  assert.equal((await request('/api/admin/vendor-revisions/'+change.data.revision_id+'/review','PUT',{action:'approve'},admin)).status,409);
});
test('scheduled content is hidden across public APIs and server-rendered pages until due',async()=>{
  const future=new Date(Date.now()+86400000).toISOString(),past=new Date(Date.now()-60000).toISOString();
  const n=await request('/api/admin/news','POST',{title:'Schedule unique news',content:'Scheduled body',visible:1,scheduled_at:future},admin);assert.equal(n.status,200);
  const p=await request('/api/admin/posts','POST',{title_zh:'Schedule unique post',content_zh:'Scheduled post',type:'article',status:'approved',scheduled_at:future},admin);assert.equal(p.status,200);
  for(const route of ['/api/news/'+n.data.id,'/article.html?id='+n.data.id,'/api/posts/'+p.data.id,'/post.html?id='+p.data.id])assert.equal((await request(route)).status,404,route);
  const search=(await request('/api/search?q=Schedule%20unique')).data;assert.equal(search.news.length,0);assert.equal(search.posts.length,0);
  assert.doesNotMatch((await request('/sitemap.xml')).data,new RegExp('article.html\\?id='+n.data.id+'<'));
  await request('/api/admin/news/'+n.data.id,'PUT',{scheduled_at:past},admin);await request('/api/admin/posts/'+p.data.id,'PUT',{scheduled_at:past},admin);
  assert.equal((await request('/api/news/'+n.data.id)).status,200);assert.equal((await request('/api/posts/'+p.data.id)).status,200);
  const html=(await request('/article.html?id='+n.data.id)).data;assert.match(html,/<h1[^>]*>Schedule unique news<\/h1>/);assert.match(html,/rel="canonical"/);assert.match(html,/application\/ld\+json/);
});
test('content history preserves old snapshots and does not publish them on read',async()=>{
  const n=await request('/api/admin/news','POST',{title:'History original',content:'Original body',visible:1},admin);
  await request('/api/admin/news/'+n.data.id,'PUT',{title:'History revised',content:'Revised body'},admin);
  const history=(await request('/api/admin/content-versions?kind=news&id='+n.data.id,'GET',undefined,admin)).data;
  assert.equal(history.versions.length,2);assert.equal(history.versions[1].payload.content,'Original body');assert.equal(history.current.content,'Revised body');
  assert.equal((await request('/api/admin/content-versions?kind=news&id='+n.data.id)).status,401);
  assert.equal((await request('/api/news/'+n.data.id)).data.title,'History revised');
});
test('published user post updates retain the original until reviewed',async()=>{
  const section=(await request('/api/sections')).data.find(s=>s.slug==='market');
  const p=await request('/api/my/posts','POST',{title_zh:'Original item',content_zh:'Original description',section_id:section.id,type:'market'},user);assert.equal(p.status,200);
  await request('/api/admin/posts/'+p.data.id,'PUT',{status:'approved'},admin);
  const rev=await request('/api/my/posts/'+p.data.id,'PUT',{title_zh:'Updated item'},user);assert.equal(rev.data.live_preserved,true);
  assert.equal((await request('/api/posts/'+p.data.id)).data.title_zh,'Original item');
  const pending=(await request('/api/admin/posts?status=pending','GET',undefined,admin)).data.find(x=>x.id===p.data.id);assert.equal(pending.pending_revision.id,rev.data.revision_id);
  assert.equal((await request('/api/admin/post-revisions/'+rev.data.revision_id+'/review','PUT',{action:'reject',note:'Need clearer description'},admin)).status,200);
  assert.equal((await request('/api/posts/'+p.data.id)).data.title_zh,'Original item');
  const next=await request('/api/my/posts/'+p.data.id,'PUT',{title_zh:'Final item',content_zh:'Clear description'},user);
  assert.equal((await request('/api/admin/post-revisions/'+next.data.revision_id+'/review','PUT',{action:'approve'},admin)).status,200);
  assert.equal((await request('/api/posts/'+p.data.id)).data.title_zh,'Final item');
  assert.equal((await request('/api/admin/post-revisions/'+next.data.revision_id+'/review','PUT',{action:'approve'},admin)).status,409);
});
test('full backup is verifiable and restores safely to an empty directory',async()=>{
  const {createBackup,verifyBackup,restoreBackup}=require('../scripts/backup');
  const backup=createBackup({dataDir:dir,output:path.join(dir,'test-backups')});const manifest=verifyBackup(backup.directory);
  assert.ok(manifest.files.some(f=>f.path==='data.sqlite'));assert.ok(manifest.files.some(f=>f.path.startsWith('uploads/')));
  const target=path.join(dir,'restored');restoreBackup(backup.directory,target);assert.ok(fs.existsSync(path.join(target,'data.sqlite')));
  assert.throws(()=>restoreBackup(backup.directory,target),/必须为空/);
  const changed=manifest.files.find(f=>f.path.startsWith('uploads/'));fs.appendFileSync(path.join(backup.directory,changed.path),'tampered');assert.throws(()=>verifyBackup(backup.directory),/校验失败/);
});
test('backend roles restrict private data, settings and review operations',async()=>{
  for(const role of ['editor','reviewer','support']){
    const username='test_'+role;
    assert.equal((await request('/api/admin/staff','POST',{username,password:'staff-password-123',role},admin)).status,200);
    const session=await request('/api/admin/login','POST',{username,password:'staff-password-123'});assert.equal(session.data.role,role);
    assert.equal((await request('/api/admin/settings','GET',undefined,session.cookie)).status,403);
    assert.equal((await request('/api/admin/staff','GET',undefined,session.cookie)).status,403);
    assert.equal((await request('/api/admin/enquiries','GET',undefined,session.cookie)).status,role==='support'?200:403);
    assert.equal((await request('/api/admin/news','GET',undefined,session.cookie)).status,role==='editor'?200:403);
    assert.equal((await request('/api/admin/geocode','POST',{query:''},session.cookie)).status,role==='editor'?400:403);
    if(role==='support')assert.equal((await request('/api/admin/posts','GET',undefined,session.cookie)).status,403);
  }
});
test('forgotten password flow delivers a one-time link, expires it and invalidates old sessions',async()=>{
  const disabled=await request('/api/auth/forgot','POST',{email:'editor-test@example.invalid'});assert.equal(disabled.data.delivery_available,false);
  const messages=[];const sockets=new Set();
  const smtp=net.createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.write('220 local test SMTP\r\n');let buffer='',dataMode=false,message='';
    socket.on('data',chunk=>{buffer+=chunk.toString();let index;while((index=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+2);if(dataMode){if(line==='.'){messages.push(message);message='';dataMode=false;socket.write('250 stored\r\n');}else message+=line+'\r\n';}else if(/^EHLO|^HELO/.test(line))socket.write('250-localhost\r\n250 SIZE 1000000\r\n');else if(/^DATA/.test(line)){dataMode=true;socket.write('354 send message\r\n');}else if(/^QUIT/.test(line)){socket.end('221 bye\r\n');}else socket.write('250 ok\r\n');}});
  });
  smtp.listen(0,'127.0.0.1');await once(smtp,'listening');
  try{
    await request('/api/admin/settings','PUT',{smtp_host:'127.0.0.1',smtp_port:String(smtp.address().port),smtp_from:'test@example.invalid',site_url:base},admin);
    const known=await request('/api/auth/forgot','POST',{email:'editor-test@example.invalid'});
    const unknown=await request('/api/auth/forgot','POST',{email:'not-registered@example.invalid'});assert.deepEqual(known.data,unknown.data);
    for(let i=0;i<80&&!messages.length;i++)await new Promise(r=>setTimeout(r,50));assert.equal(messages.length,1);
    const text=messages[0].replace(/=\r?\n/g,'').replace(/=3D/g,'=');const token=text.match(/token=([a-f0-9]{64})/)[1];
    assert.equal((await request('/api/auth/reset-check?token='+token)).data.valid,true);
    assert.equal((await request('/api/auth/reset','POST',{token,new_password:'replacement-password-123'})).status,200);
    assert.equal((await request('/api/auth/me','GET',undefined,user)).status,401);
    assert.equal((await request('/api/auth/reset-check?token='+token)).data.valid,false);
    assert.equal((await request('/api/auth/reset','POST',{token,new_password:'another-password-123'})).status,400);
    assert.equal((await request('/api/auth/login','POST',{email:'editor-test@example.invalid',password:'test-password-123'})).status,401);
    assert.equal((await request('/api/auth/login','POST',{email:'editor-test@example.invalid',password:'replacement-password-123'})).status,200);
    const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(path.join(dir,'data.sqlite'));
    try{assert.ok(db.prepare('SELECT token FROM password_resets LIMIT 1').get().token.startsWith('sha256:'));const userId=db.prepare("SELECT id FROM users WHERE email='editor-test@example.invalid'").get().id;db.prepare('INSERT INTO password_resets (token,user_id,expires) VALUES (?,?,?)').run('expired-test-token',userId,Date.now()-1000);}finally{db.close();}
    assert.equal((await request('/api/auth/reset-check?token=expired-test-token')).data.valid,false);
  }finally{
    await request('/api/admin/settings','PUT',{smtp_host:''},admin);for(const socket of sockets)socket.destroy();await new Promise(r=>smtp.close(r));
  }
});
