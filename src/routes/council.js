'use strict';
const {createCouncilService}=require('../services/council');
const {validateCoverage,intersectsPoint,bounds,intersectsGeometry}=require('../domain/council-geometry');
const officialUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='aucklandcouncil.govt.nz'||u.hostname.endsWith('.aucklandcouncil.govt.nz'))?u.href:null;}catch{return null;}};
module.exports=function({app,db,requireAuth,service=createCouncilService()}){
  db.exec(`CREATE TABLE IF NOT EXISTS council_documents(id INTEGER PRIMARY KEY,title TEXT NOT NULL,title_en TEXT NOT NULL DEFAULT '',url TEXT NOT NULL,kind TEXT NOT NULL,stage TEXT NOT NULL,west REAL NOT NULL,south REAL NOT NULL,east REAL NOT NULL,north REAL NOT NULL,visible INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)`);
  for(const [name,type]of [['geometry',"TEXT NOT NULL DEFAULT ''"],['document_date',"TEXT NOT NULL DEFAULT ''"]])if(!db.prepare('PRAGMA table_info(council_documents)').all().some(c=>c.name===name))db.exec(`ALTER TABLE council_documents ADD COLUMN ${name} ${type}`);
  const clients=new Map();
  const timer=setInterval(()=>{for(const [k,v]of clients)if(v.until<Date.now())clients.delete(k);},60000);timer.unref();
  function limit(req,res,next){
    const id=req.ip||'unknown',now=Date.now();let row=clients.get(id);
    if(!row||row.until<now){if(clients.size>2000)return res.status(429).json({error:'busy'});row={count:0,until:now+60000};clients.set(id,row);}
    if(++row.count>20){res.set('Retry-After','60');return res.status(429).json({error:'rate_limited'});}next();
  }
  const run=fn=>async(req,res)=>{res.set('Cache-Control','no-store');try{await fn(req,res);}catch(e){res.status([400,429,503].includes(e.status)?e.status:503).json({error:e.status===400?'invalid_query':e.status===429?'busy':'source_unavailable'});}};
  app.get('/api/council/config',(req,res)=>res.json({addresses_configured:service.configured,coverage:'Auckland'}));
  app.get('/api/council/documents',limit,(req,res)=>{
    if(req.query.q!==undefined&&(typeof req.query.q!=='string'||req.query.q.length>160))return res.status(400).json({error:'invalid_query'});
    const q=String(req.query.q||'').trim(),like='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
    const items=db.prepare("SELECT id,title,title_en,url,kind,stage,document_date,updated_at FROM council_documents WHERE visible=1 AND (title LIKE ? ESCAPE '\\' OR title_en LIKE ? ESCAPE '\\') ORDER BY updated_at DESC LIMIT 51").all(like,like);
    const references=require('../domain/council-references').filter(d=>(d.title+' '+d.title_en).toLowerCase().includes(q.toLowerCase()));
    res.json({items:items.slice(0,50),truncated:items.length>50,reference_documents:references,scope:'catalogue_not_property_match'});
  });
  app.get('/api/council/addresses',limit,run(async(req,res)=>res.json(await service.addresses(typeof req.query.q==='string'?req.query.q:''))));
  app.get('/api/council/lookup',limit,run(async(req,res)=>{
    if(typeof req.query.lat!=='string'||typeof req.query.lng!=='string'||!req.query.lat.trim()||!req.query.lng.trim()||(req.query.parcel!==undefined&&typeof req.query.parcel!=='string'))return res.status(400).json({error:'invalid_query'});
    if(req.query.auto!==undefined&&!['0','1'].includes(req.query.auto))return res.status(400).json({error:'invalid_query'});
    const result=await service.lookup(Number(req.query.lat),Number(req.query.lng),req.query.parcel,{autoParcel:req.query.auto==='1'});
    const parcelGeometry=result.mode==='parcel'?result.parcels.features.find(f=>String(f.properties?.id)===String(result.parcel_id))?.geometry:null;
    const extent=parcelGeometry?bounds(parcelGeometry):[result.point.longitude,result.point.latitude,result.point.longitude,result.point.latitude];
    result.documents=db.prepare('SELECT * FROM council_documents WHERE visible=1 AND west<=? AND east>=? AND south<=? AND north>=? ORDER BY updated_at DESC').all(extent[2],extent[0],extent[3],extent[1]).filter(d=>{
      if(!d.geometry)return true;
      try{return parcelGeometry?intersectsGeometry(JSON.parse(d.geometry),parcelGeometry):intersectsPoint(JSON.parse(d.geometry),result.point.longitude,result.point.latitude);}catch{d.match_uncertain=true;return true;}
    }).map(d=>({...d,coverage_kind:d.match_uncertain?'unverified_overlap':d.geometry?'reviewed_polygon':'editorial_rectangle'}));
    result.reference_documents=require('../domain/council-references');
    res.json(result);
  }));
  app.get('/api/admin/council-documents',requireAuth,(req,res)=>res.json(db.prepare('SELECT * FROM council_documents ORDER BY id DESC').all()));
  function saveDocument(req,res){
    const b=req.body||{},url=officialUrl(b.url);let coverage;
    try{coverage=validateCoverage(b.geometry);}catch{return res.status(400).json({error:'规划范围必须是已核实的奥克兰范围内闭合多边形，最多5000个坐标'});}
    const box=coverage?.bounds||['west','south','east','north'].map(k=>typeof b[k]==='number'?b[k]:NaN),date=String(b.document_date||'');
    const dateValid=!date||(/^\d{4}-\d{2}(?:-\d{2})?$/.test(date)&&!Number.isNaN(Date.parse(date.length===7?date+'-01':date))&&new Date(date.length===7?date+'-01':date).toISOString().slice(0,date.length)===date);
    if(!url||typeof b.title!=='string'||!b.title.trim()||b.title.length>200||typeof b.title_en!=='string'||b.title_en.length>200||!['master_plan','structure_plan','area_plan','plan_change'].includes(b.kind)||!['draft','consultation','adopted','unknown'].includes(b.stage)||box.some(v=>!Number.isFinite(v))||box[0]<174||box[2]>175.65||box[1]<-37.35||box[3]>-35.8||box[0]>=box[2]||box[1]>=box[3]||!dateValid)return res.status(400).json({error:'请填写官方链接、标题、状态、文件日期及有效的奥克兰适用范围'});
    const values=[b.title.trim(),b.title_en.trim(),url,b.kind,b.stage,...box,b.visible===true?1:0,new Date().toISOString(),coverage?JSON.stringify(coverage.geometry):'',date];
    if(req.params.id){
      const row=db.prepare('SELECT updated_at FROM council_documents WHERE id=?').get(req.params.id);
      if(!row)return res.sendStatus(404);
      if(b.version!==row.updated_at)return res.status(409).json({error:'这份文件已被更新，请重新读取后编辑'});
      values[10]=new Date(Math.max(Date.now(),Date.parse(row.updated_at)+1)).toISOString();
      db.prepare('UPDATE council_documents SET title=?,title_en=?,url=?,kind=?,stage=?,west=?,south=?,east=?,north=?,visible=?,updated_at=?,geometry=?,document_date=? WHERE id=?').run(...values,req.params.id);return res.json({ok:true});
    }
    const r=db.prepare('INSERT INTO council_documents(title,title_en,url,kind,stage,west,south,east,north,visible,updated_at,geometry,document_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...values);res.status(201).json({id:Number(r.lastInsertRowid)});
  }
  app.post('/api/admin/council-documents',requireAuth,saveDocument);
  app.put('/api/admin/council-documents/:id',requireAuth,saveDocument);
  app.delete('/api/admin/council-documents/:id',requireAuth,(req,res)=>{db.prepare('DELETE FROM council_documents WHERE id=?').run(req.params.id);res.json({ok:true});});
};
module.exports.officialUrl=officialUrl;
