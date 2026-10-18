'use strict';
module.exports=function registerPropertyRoutes({app,db,requireAuth,requireUser,geocode,parseProp}){
app.get('/api/map-config', (req,res)=>res.json({
  tile_url:process.env.MAP_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:process.env.MAP_ATTRIBUTION||'© OpenStreetMap contributors'
}));
app.post('/api/admin/geocode',requireAuth,async(req,res)=>{
  try {res.json({items:await geocode(req.body?.query)});}
  catch(error){res.status(error.status||503).json({error:error.status?error.message:'地址定位服务暂时不可用，请稍后重试或在地图上手动选点'});}
});
app.get('/api/properties', (req, res) => {
  const q = req.query;
  const where = ["status != '下架'"];
  const args = [];
  if (q.city) { where.push('city = ?'); args.push(q.city); }
  if (q.suburb) { where.push('suburb = ?'); args.push(q.suburb); }
  if (q.type) { where.push('type = ?'); args.push(q.type); }
  if (q.listing_kind) {
    if (!['sale','rent'].includes(q.listing_kind)) return res.status(400).json({ error:'无效房源用途' });
    where.push('listing_kind = ?'); args.push(q.listing_kind);
  }
  if (q.rent_period) {
    if(q.listing_kind !== 'rent' || !['week','month'].includes(q.rent_period)) return res.status(400).json({error:'请在出租房源中选择有效租金周期'});
    where.push('rent_period = ?'); args.push(q.rent_period);
  }
  if (q.status) { where.push('status = ?'); args.push(q.status); }
  if (q.agent_id) { where.push('agent_id = ?'); args.push(Number(q.agent_id)); }
  if (q.open_home === '1') { where.push("open_home != ''"); }
  for (const [k, col, op] of [['beds_min', 'beds', '>='], ['beds_max', 'beds', '<='], ['baths_min', 'baths', '>='], ['baths_max', 'baths', '<='], ['price_min', 'price_value', '>='], ['price_max', 'price_value', '<=']]) {
    if (q[k] && !isNaN(Number(q[k]))) { where.push(`${col} ${op} ?`); args.push(Number(q[k])); }
  }
  if (q.q) {
    where.push('(title LIKE ? OR address LIKE ? OR suburb LIKE ? OR city LIKE ? OR description LIKE ?)');
    const kw = `%${q.q}%`;
    args.push(kw, kw, kw, kw, kw);
  }
  const sorts = {
    'new': 'updated_at DESC, id DESC',
    'price_desc': 'price_value IS NULL, price_value DESC',
    'price_asc': 'price_value IS NULL, price_value ASC',
    'featured': 'featured DESC, id DESC'
  };
  const order = sorts[q.sort] || sorts['new'];
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.max(1, Math.min(48, Number(q.limit) || 12));
  const total = db.prepare(`SELECT COUNT(*) c FROM properties WHERE ${where.join(' AND ')}`).get(...args).c;
  if(q.view==='map'){
    const located='latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180';
    const mapped=db.prepare(`SELECT COUNT(*) c FROM properties WHERE ${where.join(' AND ')} AND ${located}`).get(...args).c;
    const rows=db.prepare(`SELECT id,title,title_en,address,suburb,city,status,listing_kind,rent_period,price_label,price_value,images,beds,baths,garages,latitude,longitude FROM properties WHERE ${where.join(' AND ')} AND ${located} ORDER BY ${order} LIMIT 1000`).all(...args);
    res.json({total,mapped,unmapped:total-mapped,truncated:mapped>rows.length,items:rows.map(parseProp)});return;
  }
  const rows = db.prepare(`SELECT * FROM properties WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...args, limit, (page - 1) * limit);
  res.json({ total, page, limit, items: rows.map(parseProp) });
});
app.get('/api/properties/:id', (req, res) => {
  const row = db.prepare("SELECT * FROM properties WHERE id=? AND status != '下架'").get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: '房源不存在' });
  res.json(parseProp(row));
});
/* 搜索下拉选项 */
app.get('/api/my/favorites', requireUser, (req,res) => {
  const rows=db.prepare("SELECT f.property_id, p.* FROM property_favorites f LEFT JOIN properties p ON p.id=f.property_id WHERE f.user_id=? ORDER BY f.created_at DESC,f.property_id DESC").all(req.user.id);
  res.json(rows.map(row => !row.id || row.status==='\u4e0b\u67b6' ? {id:row.property_id,unavailable:true} : parseProp(row)));
});
app.put('/api/my/favorites/:id', requireUser, (req,res) => {
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id) || !db.prepare("SELECT id FROM properties WHERE id=? AND status!='\u4e0b\u67b6'").get(id))return res.status(404).json({error:'房源不存在或已下架'});
  db.prepare('INSERT OR IGNORE INTO property_favorites(user_id,property_id) VALUES (?,?)').run(req.user.id,id);
  res.json({ok:true});
});
app.delete('/api/my/favorites/:id', requireUser, (req,res) => {
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id))return res.status(400).json({error:'房源编号无效'});
  db.prepare('DELETE FROM property_favorites WHERE user_id=? AND property_id=?').run(req.user.id,id);
  res.json({ok:true});
});
app.get('/api/meta', (req, res) => {
  const col = c => db.prepare(`SELECT DISTINCT ${c} v FROM properties WHERE ${c} != '' AND status != '下架' ORDER BY v`).all().map(r => r.v);
  res.json({ cities: col('city'), suburbs: col('suburb'), types: col('type') });
});
/* 专家 */
app.get('/api/agents', (req, res) => {
  res.json(db.prepare('SELECT id,name,category,email,phone,wechat,photo,bio FROM agents WHERE visible=1 ORDER BY sort_order,id').all());
});
app.get('/api/agents/:id', (req, res) => {
  const a = db.prepare('SELECT id,name,category,email,phone,wechat,photo,bio FROM agents WHERE id=? AND visible=1').get(Number(req.params.id));
  if (!a) return res.status(404).json({ error: '专家不存在' });
  const props = db.prepare("SELECT * FROM properties WHERE agent_id=? AND status != '下架' ORDER BY id DESC").all(a.id);
  res.json({ ...a, properties: props.map(parseProp) });
});

};
