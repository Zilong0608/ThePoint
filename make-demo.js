/* ============================================================
   THE POINT 一点 · 生成静态演示数据
   用法:在项目根目录运行  node make-demo.js
   会从 data.sqlite 导出当前内容,生成 demo-data.js(供 GitHub Pages 演示用)
   网站内容更新后,重跑一次再 git push 即可刷新演示站
   注意:用户邮箱/电话已自动打码,不会泄露到演示站
   ============================================================ */
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'data.sqlite'), { readOnly: true });
const all = sql => { try { return db.prepare(sql).all(); } catch (e) { return []; } };

/* 打码:邮箱 a***@xx.com,电话保留前 3 位 */
const maskEmail = e => String(e || '').replace(/^(.).*(@.*)$/, '$1***$2');
const maskPhone = p => { p = String(p || ''); return p ? p.slice(0, 3) + '****' : ''; };

/* ---------- 前台数据(与线上可见范围一致) ---------- */
const sections = all("SELECT * FROM sections WHERE visible=1 ORDER BY sort_order,id");
const cats = all("SELECT * FROM categories WHERE visible=1 ORDER BY sort_order,id");
sections.forEach(s => s.categories = cats.filter(c => c.section_id === s.id));

const properties = all("SELECT * FROM properties WHERE status != '下架' ORDER BY id DESC");
const agents = all("SELECT id,name,category,email,phone,wechat,photo,bio,bio_en,sort_order FROM agents WHERE visible=1 ORDER BY sort_order,id");
const news = all("SELECT id,title,title_en,source_note,excerpt,excerpt_en,content,content_en,image,published_at FROM news WHERE visible=1 ORDER BY published_at DESC, id DESC");
const partners = all("SELECT id,name,category,logo,url FROM partners WHERE visible=1 ORDER BY sort_order,id");
const today = new Date().toISOString().slice(0, 10);
const services = all(`SELECT id,name,category,tagline,tagline_en,description,description_en,phone,email,wechat,website,logo,featured
  FROM services WHERE visible=1 AND (expires_at='' OR expires_at IS NULL OR expires_at >= '${today}') ORDER BY featured DESC, sort_order, id`);
const vendors = all(`SELECT v.id,v.name_zh,v.name_en,v.section_id,v.category_id,v.tagline_zh,v.tagline_en,v.intro_zh,v.intro_en,
  v.phone,v.email,v.wechat,v.website,v.logo,v.photos,v.verified,v.featured,v.sort_order,v.created_at
  FROM vendors v JOIN users u ON u.id=v.user_id WHERE v.status='approved' AND u.status='active'
  ORDER BY v.featured DESC, v.verified DESC, v.sort_order, v.id`)
  .map(v => { try { v.photos = JSON.parse(v.photos || '[]'); } catch (e) { v.photos = []; } return v; });
const posts = all(`SELECT p.* FROM posts p LEFT JOIN vendors v ON v.id=p.vendor_id LEFT JOIN users u ON u.id=p.user_id
  WHERE p.status='approved' AND (p.vendor_id IS NULL OR v.status='approved') AND (p.user_id IS NULL OR u.status='active')
  ORDER BY p.featured DESC, p.published_at DESC, p.id DESC`);
const videos = all("SELECT * FROM videos WHERE visible=1 ORDER BY home_top DESC, sort_order, published_at DESC, id DESC");
const schools = all("SELECT * FROM schools WHERE visible=1 ORDER BY sort_order, name");
const suburbs = all("SELECT name FROM suburbs WHERE visible=1 ORDER BY sort_order, name").map(r => r.name);

const meta = {
  cities: [...new Set(properties.map(p => p.city).filter(Boolean))].sort(),
  suburbs: [...new Set(properties.map(p => p.suburb).filter(Boolean))].sort(),
  types: [...new Set(properties.map(p => p.type).filter(Boolean))].sort()
};

/* 主页聚合(与 /api/home 同构) */
const parseImgs = r => { let im = []; try { im = JSON.parse(r.images || '[]'); } catch (e) {} return { ...r, images: im, cover: im[0] || '' }; };
const vBrief = id => { const v = vendors.find(x => x.id === id); return v ? { id: v.id, name_zh: v.name_zh, name_en: v.name_en, logo: v.logo, verified: v.verified } : null; };
const secBy = id => sections.find(s => s.id === id) || null;
const catBy = id => cats.find(c => c.id === id) || null;
const homePost = p => ({ ...parseImgs(p), vendor: p.vendor_id ? vBrief(p.vendor_id) : null, section: p.section_id ? secBy(p.section_id) : null, category: p.category_id ? catBy(p.category_id) : null });
const home = {
  sections,
  featured_posts: posts.filter(p => p.featured).slice(0, 12).map(homePost),
  vendors: vendors.filter(v => v.featured || v.verified).slice(0, 8),
  properties: properties.filter(p => p.status === '在售' && p.featured).slice(0, 3)
    .map(p => ({ ...parseImgs(p), agent: agents.find(a => a.id === p.agent_id) || null })),
  news: news.slice(0, 3)
};

/* ---------- 后台数据(只读展示;用户信息打码) ---------- */
const c = t => { try { return db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c; } catch (e) { return 0; } };
const stats = {
  properties: c('properties'), agents: c('agents'), news: c('news'), partners: c('partners'),
  services: c('services'), enquiries: c('enquiries'), videos: c('videos'), schools: c('schools'),
  subscribers: c('subscribers'), users: c('users'), vendors: c('vendors'), posts: c('posts'),
  unread: all("SELECT COUNT(*) c FROM enquiries WHERE is_read=0").map(r => r.c)[0] || 0,
  vendors_pending: all("SELECT COUNT(*) c FROM vendors WHERE status='pending'").map(r => r.c)[0] || 0,
  posts_pending: all("SELECT COUNT(*) c FROM posts WHERE status='pending'").map(r => r.c)[0] || 0
};
const adminUsers = all(`SELECT u.id,u.email,u.name,u.phone,u.wechat,u.status,u.created_at,
  v.id AS vendor_id, v.status AS vendor_status, v.name_zh AS vendor_name,
  (SELECT COUNT(*) FROM posts WHERE user_id=u.id) AS post_count,
  (SELECT COUNT(*) FROM posts WHERE user_id=u.id AND status='approved') AS live_count
  FROM users u LEFT JOIN vendors v ON v.user_id=u.id ORDER BY u.id DESC LIMIT 200`)
  .map(u => ({ ...u, email: maskEmail(u.email), phone: maskPhone(u.phone), wechat: '' }));
const adminVendors = all(`SELECT v.*, u.email AS user_email, u.name AS user_name, s.name_zh AS section_name, c.name_zh AS category_name
  FROM vendors v LEFT JOIN users u ON u.id=v.user_id LEFT JOIN sections s ON s.id=v.section_id LEFT JOIN categories c ON c.id=v.category_id
  ORDER BY v.status='pending' DESC, v.id DESC`)
  .map(v => { try { v.photos = JSON.parse(v.photos || '[]'); } catch (e) { v.photos = []; } return { ...v, user_email: maskEmail(v.user_email) }; });
const adminPosts = all(`SELECT p.*, u.email AS user_email, u.name AS user_name, v.name_zh AS vendor_name
  FROM posts p LEFT JOIN users u ON u.id=p.user_id LEFT JOIN vendors v ON v.id=p.vendor_id ORDER BY p.id DESC LIMIT 300`)
  .map(p => ({ ...p, user_email: maskEmail(p.user_email) }));
const adminEnquiries = all(`SELECT e.*, a.name AS agent_name, p.title AS property_title, v.name_zh AS vendor_name
  FROM enquiries e LEFT JOIN agents a ON a.id=e.agent_id LEFT JOIN properties p ON p.id=e.property_id LEFT JOIN vendors v ON v.id=e.vendor_id
  ORDER BY e.id DESC LIMIT 100`)
  .map(e => ({ ...e, email: maskEmail(e.email), phone: maskPhone(e.phone) }));
const adminSubscribers = all('SELECT * FROM subscribers ORDER BY id DESC LIMIT 200')
  .map(s => ({ ...s, email: maskEmail(s.email) }));
const adminLogs = all('SELECT * FROM admin_logs ORDER BY id DESC LIMIT 100');
const adminTables = {
  properties: all('SELECT * FROM properties ORDER BY id DESC'),
  agents: all('SELECT * FROM agents ORDER BY id DESC'),
  news: all('SELECT * FROM news ORDER BY id DESC'),
  partners: all('SELECT * FROM partners ORDER BY id DESC'),
  services: all('SELECT * FROM services ORDER BY id DESC'),
  sections: all('SELECT * FROM sections ORDER BY id DESC'),
  categories: all('SELECT * FROM categories ORDER BY id DESC'),
  videos: all('SELECT * FROM videos ORDER BY id DESC'),
  schools: all('SELECT * FROM schools ORDER BY id DESC'),
  suburbs: all('SELECT * FROM suburbs ORDER BY id DESC')
};

const DATA = {
  generated_at: new Date().toISOString(),
  sections, properties, agents, news, partners, services, vendors, posts, videos, schools, suburbs, meta, home,
  admin: { stats, users: adminUsers, vendors: adminVendors, posts: adminPosts, enquiries: adminEnquiries, subscribers: adminSubscribers, logs: adminLogs },
  adminTables
};

const out = 'window.DEMO_DATA = ' + JSON.stringify(DATA) + ';\n';
fs.writeFileSync(path.join(__dirname, 'demo-data.js'), out);
console.log(`demo-data.js 已生成(${(out.length / 1024).toFixed(0)} KB)。`);
console.log('提交到 GitHub 后,演示站内容即会更新。');
