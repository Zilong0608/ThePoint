'use strict';
const {normalizeProperty}=require('../domain/property');
const {normalizeSchedule}=require('../domain/publication');
module.exports=function registerAdminContentRoutes({app,db,requireAuth,parseProp,parseVideo,ensureSuburb,recordVersion}){
const TABLES = {
  properties: {
    fields: ['title', 'title_en', 'address', 'suburb', 'city', 'latitude', 'longitude', 'type', 'status', 'listing_kind', 'rent_period', 'available_from', 'bond', 'floorplans', 'price_label', 'price_value', 'beds', 'baths', 'garages', 'land_area', 'floor_area', 'open_home', 'tour_url', 'description', 'description_en', 'images', 'agent_id', 'featured'],
    nums: ['latitude', 'longitude', 'price_value', 'bond', 'beds', 'baths', 'garages', 'agent_id', 'featured'],
    required: ['title']
  },
  agents: {
    fields: ['name', 'category', 'email', 'phone', 'wechat', 'photo', 'bio', 'bio_en', 'sort_order', 'visible'],
    nums: ['sort_order', 'visible'],
    required: ['name']
  },
  news: {
    fields: ['title', 'title_en', 'source_note', 'excerpt', 'excerpt_en', 'content', 'content_en', 'content_format', 'image', 'published_at', 'scheduled_at', 'visible'],
    nums: ['visible'],
    required: ['title']
  },
  partners: {
    fields: ['name', 'category', 'logo', 'url', 'sort_order', 'visible'],
    nums: ['sort_order', 'visible'],
    required: ['name']
  },
  services: {
    fields: ['name', 'category', 'tagline', 'tagline_en', 'description', 'description_en', 'phone', 'email', 'wechat', 'website', 'logo', 'featured', 'expires_at', 'sort_order', 'visible'],
    nums: ['featured', 'sort_order', 'visible'],
    required: ['name']
  },
  sections: {
    fields: ['slug', 'name_zh', 'name_en', 'tagline_zh', 'tagline_en', 'icon', 'sort_order', 'visible'],
    nums: ['sort_order', 'visible'],
    required: ['slug', 'name_zh']
  },
  categories: {
    fields: ['section_id', 'slug', 'name_zh', 'name_en', 'sort_order', 'visible'],
    nums: ['section_id', 'sort_order', 'visible'],
    required: ['section_id', 'name_zh']
  },
  videos: {
    fields: ['title', 'title_en', 'video_id', 'category', 'cover', 'home_play', 'home_top', 'news_play', 'news_top', 'sort_order', 'visible', 'published_at'],
    nums: ['home_play', 'home_top', 'news_play', 'news_top', 'sort_order', 'visible'],
    required: ['title']
  },
  schools: {
    fields: ['name', 'name_en', 'type', 'suburb', 'address', 'rating', 'website', 'image', 'description', 'description_en', 'sort_order', 'visible'],
    nums: ['sort_order', 'visible'],
    required: ['name']
  },
  suburbs: {
    fields: ['name', 'sort_order', 'visible'],
    nums: ['sort_order', 'visible'],
    required: ['name']
  }
};
/* YouTube 链接 → 视频 ID(粘贴完整链接也能存对) */
function extractYoutubeId(v) {
  v = String(v || '').trim();
  const m = v.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,20})/);
  return m ? m[1] : v.replace(/[^\w-]/g, '').slice(0, 20);
}
function pickBody(cfg, body) {
  const out = {};
  for (const f of cfg.fields) {
    if (!(f in body)) continue;
    let v = body[f];
    if (f === 'images' || f === 'floorplans') v = JSON.stringify(Array.isArray(v) ? v : []);
    else if (cfg.nums.includes(f)) v = (v === '' || v === null || v === undefined) ? null : Number(v);
    else v = v === null || v === undefined ? '' : String(v);
    out[f] = v;
  }
  return out;
}
/* 保存前的小处理:视频链接提取 ID;手输的新地区自动入列 */
function normalizeAdminData(table, data, previous) {
  if (table === 'properties') normalizeProperty(data, previous);
  if (table === 'news') {
    if('scheduled_at' in data)data.scheduled_at=normalizeSchedule(data.scheduled_at);
    if (data.content_format && !['plain','markdown'].includes(data.content_format)) throw new Error('无效正文格式');
    if ('published_at' in data && !data.published_at.trim()) delete data.published_at;
  }
  if (table === 'videos' && 'video_id' in data) data.video_id = extractYoutubeId(data.video_id);
  if (table === 'videos' && !data.published_at) delete data.published_at; // 留空 → 用默认当前时间/保持原值

  if ((table === 'properties' || table === 'schools') && data.suburb) ensureSuburb(data.suburb);
  return data;
}
for (const [table, cfg] of Object.entries(TABLES)) {
  app.get(`/api/admin/${table}`, requireAuth, (req, res) => {
    const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id DESC`).all();
    res.json(table === 'properties' ? rows.map(parseProp) : table === 'videos' ? rows.map(parseVideo) : rows);
  });
  app.post(`/api/admin/${table}`, requireAuth, (req, res) => {
    const data = normalizeAdminData(table, pickBody(cfg, req.body || {}));
    for (const r of cfg.required) if (!data[r]) return res.status(400).json({ error: `缺少必填字段: ${r}` });
    const keys = Object.keys(data);
    const info = db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
      .run(...keys.map(k => data[k]));
    if(table==='news')recordVersion(table,Number(info.lastInsertRowid),req.admin.username);
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  app.put(`/api/admin/${table}/:id`, requireAuth, (req, res) => {
    const previous = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(Number(req.params.id));
    if (!previous) return res.status(404).json({ error:'记录不存在' });
    const data = normalizeAdminData(table, pickBody(cfg, req.body || {}), previous);
    const keys = Object.keys(data);
    if (!keys.length) return res.status(400).json({ error: '没有可更新的字段' });
    if(table==='news'&&!db.prepare('SELECT id FROM content_versions WHERE kind=? AND ref_id=? LIMIT 1').get(table,previous.id))recordVersion(table,previous.id,req.admin.username);
    const info = db.prepare(`UPDATE ${table} SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`)
      .run(...keys.map(k => data[k]), Number(req.params.id));
    if(table==='news')recordVersion(table,previous.id,req.admin.username);
    res.json({ ok: info.changes > 0 });
  });
  app.delete(`/api/admin/${table}/:id`, requireAuth, (req, res) => {
    if(table==='news'){db.prepare("DELETE FROM content_versions WHERE kind='news' AND ref_id=?").run(Number(req.params.id));db.prepare("DELETE FROM editorial_drafts WHERE kind='news' AND ref_id=?").run(Number(req.params.id));}
    const info = db.prepare(`DELETE FROM ${table} WHERE id=?`).run(Number(req.params.id));
    res.json({ ok: info.changes > 0 });
  });
}

};
