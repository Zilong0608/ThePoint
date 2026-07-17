/* ============================================================
   THE POINT 一点 · 后端服务
   Express + SQLite(better-sqlite3)+ Multer 图片上传
   启动: npm start  →  http://localhost:3000
   管理后台: http://localhost:3000/admin/  (默认 admin / thepoint2026)
   ============================================================ */
const express = require('express');
const { DatabaseSync } = require('node:sqlite'); // Node 22.13+ 内置,无需编译
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ---------------- 数据库 ---------------- */
const db = new DatabaseSync(path.join(ROOT, 'data.sqlite'));
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT DEFAULT '地产',          -- 地产 / 金融 / 租务 ...
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  wechat TEXT DEFAULT '',
  photo TEXT DEFAULT '',                 -- 图片路径
  bio TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  visible INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,                   -- 标题(如小区/卖点)
  address TEXT DEFAULT '',
  suburb TEXT DEFAULT '',
  city TEXT DEFAULT 'Auckland',
  type TEXT DEFAULT '别墅 / House',
  status TEXT DEFAULT '在售',            -- 在售 / 已售 / 下架
  price_label TEXT DEFAULT '价格待询',   -- 显示用
  price_value INTEGER,                   -- 数值,用于筛选排序,可空
  beds INTEGER, baths INTEGER, garages INTEGER,
  land_area TEXT DEFAULT '', floor_area TEXT DEFAULT '',
  open_home TEXT DEFAULT '',             -- Open Home 说明
  tour_url TEXT DEFAULT '',              -- 3D 看房嵌入链接(Matterport/Kuula 等)
  description TEXT DEFAULT '',
  images TEXT DEFAULT '[]',              -- JSON 数组
  agent_id INTEGER,
  featured INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  source_note TEXT DEFAULT '',           -- 如: 内容来源于网络,一点编辑于…
  excerpt TEXT DEFAULT '',
  content TEXT DEFAULT '',
  image TEXT DEFAULT '',
  published_at TEXT DEFAULT (datetime('now','localtime')),
  visible INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT DEFAULT '',
  logo TEXT DEFAULT '',
  url TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  visible INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT DEFAULT '其他',          -- 建材 / 家具 / Staging / 建筑维修 / 清洁 / 除草园艺 / 地毯 / 搬家 ...
  tagline TEXT DEFAULT '',               -- 一句话介绍
  description TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  wechat TEXT DEFAULT '',
  website TEXT DEFAULT '',
  logo TEXT DEFAULT '',
  featured INTEGER DEFAULT 0,            -- 付费推荐位:排前 + 高亮
  expires_at TEXT DEFAULT '',            -- 年费有效期至(YYYY-MM-DD),留空=不限
  sort_order INTEGER DEFAULT 0,
  visible INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT DEFAULT 'general',           -- general / agent / property / subscribe
  name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  message TEXT DEFAULT '',
  agent_id INTEGER,
  property_id INTEGER,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL
);
/* ============ 平台化新表 ============ */
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  wechat TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  status TEXT DEFAULT 'active',          -- active / banned
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name_zh TEXT NOT NULL,
  name_en TEXT DEFAULT '',
  tagline_zh TEXT DEFAULT '',
  tagline_en TEXT DEFAULT '',
  icon TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  visible INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL,
  slug TEXT DEFAULT '',
  name_zh TEXT NOT NULL,
  name_en TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  visible INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  name_zh TEXT DEFAULT '',
  name_en TEXT DEFAULT '',
  section_id INTEGER,
  category_id INTEGER,
  tagline_zh TEXT DEFAULT '',
  tagline_en TEXT DEFAULT '',
  intro_zh TEXT DEFAULT '',
  intro_en TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  wechat TEXT DEFAULT '',
  website TEXT DEFAULT '',
  logo TEXT DEFAULT '',
  photos TEXT DEFAULT '[]',
  verified INTEGER DEFAULT 0,            -- 一点认证
  featured INTEGER DEFAULT 0,            -- 官方推荐位
  status TEXT DEFAULT 'pending',         -- pending / approved / rejected / suspended
  apply_message TEXT DEFAULT '',
  review_note TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  approved_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  vendor_id INTEGER,                     -- 空=普通用户发布
  section_id INTEGER,
  category_id INTEGER,
  type TEXT DEFAULT 'market',            -- market/service/update/event/job/seek/article/video
  title_zh TEXT DEFAULT '',
  title_en TEXT DEFAULT '',
  content_zh TEXT DEFAULT '',
  content_en TEXT DEFAULT '',
  images TEXT DEFAULT '[]',
  video_url TEXT DEFAULT '',             -- 外部视频嵌入(YouTube 等)
  price_label TEXT DEFAULT '',
  price_value INTEGER,
  contact_name TEXT DEFAULT '',
  contact_phone TEXT DEFAULT '',
  contact_wechat TEXT DEFAULT '',
  contact_email TEXT DEFAULT '',
  location TEXT DEFAULT '',
  event_time TEXT DEFAULT '',
  extra TEXT DEFAULT '{}',
  status TEXT DEFAULT 'pending',         -- pending / approved / rejected / offline
  featured INTEGER DEFAULT 0,            -- 编辑推荐(主页精选流)
  review_note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  published_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                    -- user / admin
  ref_id INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT DEFAULT 'system',            -- vendor_review / post_review / enquiry / system
  title_zh TEXT DEFAULT '',
  title_en TEXT DEFAULT '',
  body_zh TEXT DEFAULT '',
  body_en TEXT DEFAULT '',
  link TEXT DEFAULT '',
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS admin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin TEXT NOT NULL,                   -- 操作人
  action TEXT NOT NULL,                  -- ban / unban / delete_user / reset_password / offline_posts / ...
  target_type TEXT DEFAULT '',           -- user / vendor / post
  target_id INTEGER,
  target_label TEXT DEFAULT '',          -- 对象描述(邮箱/名称/标题)
  detail TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
/* ============ 视频 / 学校 / 订阅 / 地区 ============ */
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  title_en TEXT DEFAULT '',
  video_id TEXT DEFAULT '',              -- YouTube 视频 ID(可直接粘贴完整链接,自动提取)
  category TEXT DEFAULT '',              -- 视频分类(如 房源视频 / 一点镜头 / 文化)
  cover TEXT DEFAULT '',                 -- 封面图,留空自动用 YouTube 缩略图
  home_play INTEGER DEFAULT 0,           -- 首页展示
  home_top INTEGER DEFAULT 0,            -- 首页置顶
  news_play INTEGER DEFAULT 0,           -- 资讯页展示(一点镜头)
  news_top INTEGER DEFAULT 0,            -- 资讯页置顶
  sort_order INTEGER DEFAULT 0,
  visible INTEGER DEFAULT 1,
  published_at TEXT DEFAULT (datetime('now','localtime')),
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS schools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_en TEXT DEFAULT '',
  type TEXT DEFAULT '',                  -- 小学 / 初中 / 中学 / 私立 / 教会 ...
  suburb TEXT DEFAULT '',
  address TEXT DEFAULT '',
  rating TEXT DEFAULT '',                -- Decile / Equity Index / 自定评级
  website TEXT DEFAULT '',
  image TEXT DEFAULT '',
  description TEXT DEFAULT '',
  description_en TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  visible INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT DEFAULT '',
  source TEXT DEFAULT 'site',            -- 订阅来源
  status TEXT DEFAULT 'active',          -- active / unsubscribed
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS suburbs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,             -- 如 Albany / Newmarket
  sort_order INTEGER DEFAULT 0,
  visible INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status, section_id, published_at);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires);
`);

/* ---------------- 轻量迁移(老库自动补新字段) ---------------- */
{
  const addCol = (table, col, def) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  };
  addCol('properties', 'tour_url', "TEXT DEFAULT ''");
  /* 双语字段 */
  addCol('properties', 'title_en', "TEXT DEFAULT ''");
  addCol('properties', 'description_en', "TEXT DEFAULT ''");
  addCol('news', 'title_en', "TEXT DEFAULT ''");
  addCol('news', 'excerpt_en', "TEXT DEFAULT ''");
  addCol('news', 'content_en', "TEXT DEFAULT ''");
  addCol('agents', 'bio_en', "TEXT DEFAULT ''");
  addCol('services', 'tagline_en', "TEXT DEFAULT ''");
  addCol('services', 'description_en', "TEXT DEFAULT ''");
  addCol('enquiries', 'vendor_id', 'INTEGER');
}

/* ---------------- 密码工具 ---------------- */
function hashPassword(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(pw, salt, hash) {
  const test = crypto.scryptSync(pw, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(test), Buffer.from(hash));
}

/* ---------------- 种子数据(仅首次运行) ---------------- */
function seed() {
  if (db.prepare('SELECT COUNT(*) c FROM admins').get().c === 0) {
    const { salt, hash } = hashPassword('thepoint2026');
    db.prepare('INSERT INTO admins (username,password_hash,salt) VALUES (?,?,?)').run('admin', hash, salt);
    console.log('已创建默认管理员: admin / thepoint2026 (请尽快在后台修改密码)');
  }
  if (db.prepare('SELECT COUNT(*) c FROM agents').get().c === 0) {
    const insA = db.prepare('INSERT INTO agents (name,category,email,phone,photo,bio,sort_order) VALUES (?,?,?,?,?,?,?)');
    insA.run('Celia Wang', '地产', 'celia.wang@marsrealty.co.nz', '027 363 9990', 'media/agent-celia.jpg', '深耕奥克兰高端住宅市场多年,以专业与审慎陪伴每一位客户。', 1);
    insA.run('Rod Macfarlane', '地产', 'rodmac006@gmail.com', '021 755 588', 'media/agent-rod.jpg', '', 2);
    insA.run('Asli Can', '地产', 'asli@marsrealty.co.nz', '027 366 7776', 'media/agent-asli.jpg', '', 3);
    insA.run('Nik Butler', '地产', '', '022 460 5080', 'media/agent-nik.jpg', '', 4);
    insA.run('金融顾问(姓名待补充)', '金融', '', '021 796 865', 'media/agent-finance.jpg', '', 5);
    insA.run('Ben Zhao', '租务', '', '027 466 2399', 'media/agent-ben.jpg', '', 6);
  }
  if (db.prepare('SELECT COUNT(*) c FROM properties').get().c === 0) {
    const insP = db.prepare(`INSERT INTO properties
      (title,address,suburb,city,type,status,price_label,price_value,beds,baths,garages,land_area,floor_area,description,images,agent_id,featured)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    insP.run('Albany 精品公寓', '104, 22 Library Lane, Albany', 'Albany', 'Auckland', '公寓 / Apartment', '在售', '价格待询', null,
      1, 1, 1, '', '', '位于 Albany 核心地段的精品公寓,近商圈、学校与公共交通,自住投资皆宜。', JSON.stringify(['media/prop-albany-1.jpg']), 1, 1);
    insP.run('Albany 双拼地块', '20 & 22 Waihou Crescent, Albany', 'Albany', 'Auckland', '地产 / Land', '在售', '价格待询', null,
      null, null, null, '192m²', '', '双临街地块,发展潜力可观,详情欢迎垂询一点专家。', JSON.stringify(['media/prop-albany-2.jpg']), 2, 0);
    insP.run('Dairy Flat 庄园别墅', '65 Lascelles Drive, Dairy Flat', 'Dairy Flat', 'Auckland', '别墅 / House', '在售', '价格待询', null,
      4, 3, 3, '3.5ha', '', '约 3.5 公顷私家庄园,四房三卫,静谧从容,尽享乡野与城市的平衡。', JSON.stringify(['media/prop-dairyflat.jpg']), 1, 1);
  }
  if (db.prepare('SELECT COUNT(*) c FROM news').get().c === 0) {
    const insN = db.prepare('INSERT INTO news (title,source_note,excerpt,content,image,published_at) VALUES (?,?,?,?,?,?)');
    insN.run('【异域房市】无惧房市动荡,新加坡房产巨头豪砸近 $30 亿在澳买地',
      '内容来源于网络,一点编辑于 2026-06-19',
      '提示:新闻观点不代表本网立场。销售火爆!已开工建设 — 20 套已售出!北岸豪华公寓 Chelsea Rise,俯瞰海港美景,千帆竞逐。',
      '销售火爆!已开工建设 — 20 套已售出!\n\n北岸豪华公寓 Chelsea Rise,俯瞰海港美景,千帆竞逐;尽享北岸的从容与便利。\n\n(正文内容待编辑,可在管理后台修改。)',
      'media/news-1.jpg', '2026-06-19 00:58');
    insN.run('天价罚单落地!SkyCity 同意支付 2560 万罚款,彻底了结阿德莱德赌场违规风波',
      '内容来源于网络,一点编辑于 2026-06-19',
      '提示:新闻观点不代表本网立场。Kumeu 约 1.17 公顷静谧四房庄园,17 Terry Smyth Drive, Kumeu, Rodney。',
      '(正文内容待编辑,可在管理后台修改。)',
      'media/news-2.jpg', '2026-06-19 00:54');
    insN.run('悉尼房价涨至年薪 16.7 倍,七成 19 岁青年推迟独立,三代同堂成无奈选择',
      '内容来源于网络,一点编辑于 2026-06-19',
      '提示:新闻观点不代表本网立场。未来城市用地,面积超 19 公顷,双临街,27 Young Access Road, Dairy Flat。',
      '(正文内容待编辑,可在管理后台修改。)',
      'media/news-3.jpg', '2026-06-19 00:46');
  }
  if (db.prepare('SELECT COUNT(*) c FROM services').get().c === 0) {
    const insS = db.prepare('INSERT INTO services (name,category,tagline,phone,wechat,featured,sort_order) VALUES (?,?,?,?,?,?,?)');
    insS.run('示例搬家公司', '搬家', '本地/跨城搬家,钢琴与贵重物品专业搬运。', '021 000 0001', 'movingnz', 1, 1);
    insS.run('示例园艺除草', '除草园艺', '定期除草、树篱修剪、庭院维护。', '021 000 0002', '', 0, 2);
    insS.run('示例清洁服务', '清洁', '开荒保洁、退租清洁、地毯清洗。', '021 000 0003', '', 0, 3);
  }
  if (db.prepare('SELECT COUNT(*) c FROM sections').get().c === 0) {
    const insSec = db.prepare('INSERT INTO sections (slug,name_zh,name_en,tagline_zh,tagline_en,sort_order) VALUES (?,?,?,?,?,?)');
    const insCat = db.prepare('INSERT INTO categories (section_id,name_zh,name_en,sort_order) VALUES (?,?,?,?)');
    const SECS = [
      ['property', '置业', 'Property', '自营房源,买卖租赁一站式', 'Homes, done properly',
        ['买房|Buy', '卖房|Sell', '租赁|Rent', '新盘|New Builds', '置业专家|Experts']],
      ['advisory', '顾问', 'Advisory', '税务移民法律,专家把关', 'Trusted professional advice',
        ['税务|Tax', '会计|Accounting', '律师|Legal', '移民|Immigration', '贷款|Mortgage', '保险|Insurance', '规划师|Planner', '测量师|Surveyor']],
      ['education', '教育', 'Education', '留学到才艺,一路同行', 'From study to talents',
        ['留学|Study Abroad', '私校咨询|Private Schools', '学科私教|Tutoring', '语言|Language', '才艺|Arts', '体育教练|Sports Coaching']],
      ['living', '生活', 'Living', '安家日常,精选服务', 'Everyday services, curated',
        ['家政|Housekeeping', '除草园艺|Gardening', '维修装修|Repair & Reno', '搬家|Moving', '餐饮|Dining', '健康|Health', '美容|Beauty', '宠物|Pets']],
      ['market', '集市', 'Market', '二手闲置与车辆,物尽其用', 'Marketplace & motors',
        ['家具|Furniture', '电器|Appliances', '母婴|Baby & Kids', '二手车买卖|Used Cars', '租车|Car Rental', '维修保养|Service & Repair', '其他|Others']],
      ['local', '同城', 'Local', '活动资讯,同城相聚', 'Events & city news',
        ['活动|Events', '城中资讯|City News']],
      ['news', '资讯', 'Journal', '市场洞察与城中生活', 'Insights & city stories', []],
      ['career', '招聘', 'Jobs', '好工作与好人才,在此相逢', 'Where jobs meet talent',
        ['企业招聘|Hiring', '个人求职|Seeking']],
      ['culture', '文化', 'Culture', '中英双语,深度内容', 'Bilingual stories & videos',
        ['文章|Articles', '视频|Videos']]
    ];
    SECS.forEach((s, i) => {
      const info = insSec.run(s[0], s[1], s[2], s[3], s[4], i + 1);
      s[5].forEach((c, j) => {
        const [zh, en] = c.split('|');
        insCat.run(info.lastInsertRowid, zh, en, j + 1);
      });
    });
    console.log('已创建 8 大板块及初始分类');
  }
  if (db.prepare('SELECT COUNT(*) c FROM partners').get().c === 0) {
    const names = ['Crimson', 'Portal Studio', 'K3 Consulting Accounting Legal', 'Hilton Queenstown Resort & Spa',
      'Cato Bolam', 'open2view.com', 'Archiland 奥克兰建筑设计院', 'AEQ Furniture 美惠优家俱城',
      'Whitlock Williams', 'Pinehill Homes Ltd', 'NZ International Trust & Investment Co. Ltd', 'Mars Realty'];
    const insPa = db.prepare('INSERT INTO partners (name,logo,sort_order) VALUES (?,?,?)');
    names.forEach((n, i) => insPa.run(n, `media/partner-${i + 1}.jpg`, i + 1));
  }
}
seed();

/* ---------------- 奥克兰城区列表(首次运行写入;后台可增删,表单选不到可手输,新地区自动入列) ---------------- */
if (db.prepare('SELECT COUNT(*) c FROM suburbs').get().c === 0) {
  const AKL_SUBURBS = [
    /* 北岸 North Shore */
    'Albany', 'Albany Heights', 'Browns Bay', 'Rothesay Bay', 'Murrays Bay', 'Mairangi Bay', 'Campbells Bay',
    'Castor Bay', 'Milford', 'Takapuna', 'Devonport', 'Belmont', 'Hauraki', 'Northcote', 'Birkenhead', 'Beach Haven',
    'Glenfield', 'Hillcrest', 'Sunnynook', 'Forrest Hill', 'Rosedale', 'Pinehill', 'Unsworth Heights', 'Torbay',
    'Long Bay', 'Okura', 'Greenhithe', 'Schnapper Rock', 'Oteha',
    /* Hibiscus Coast / 北部乡区 */
    'Orewa', 'Silverdale', 'Millwater', 'Red Beach', 'Whangaparaoa', 'Gulf Harbour', 'Dairy Flat', 'Coatesville',
    'Riverhead', 'Kumeu', 'Huapai', 'Warkworth', 'Wainui',
    /* 西区 West */
    'Hobsonville', 'Whenuapai', 'Westgate', 'Massey', 'West Harbour', 'Henderson', 'Te Atatu Peninsula',
    'Te Atatu South', 'New Lynn', 'Titirangi', 'Glen Eden', 'Avondale', 'Blockhouse Bay', 'Green Bay',
    /* 中区 Central */
    'Auckland CBD', 'Ponsonby', 'Herne Bay', 'Grey Lynn', 'Westmere', 'Point Chevalier', 'Freemans Bay',
    'Parnell', 'Newmarket', 'Remuera', 'Epsom', 'Mt Eden', 'Mt Albert', 'Mt Roskill', 'Sandringham',
    'Kingsland', 'Greenlane', 'Ellerslie', 'One Tree Hill', 'Royal Oak', 'Onehunga', 'Hillsborough', 'Lynfield',
    'Three Kings', 'Balmoral', 'St Lukes', 'Waterview', 'Penrose', 'Mt Wellington', 'Stonefields', 'Meadowbank',
    'St Johns', 'Glen Innes', 'Orakei', 'Mission Bay', 'Kohimarama', 'St Heliers', 'Glendowie', 'Panmure',
    /* 东区 East */
    'Howick', 'Pakuranga', 'Half Moon Bay', 'Bucklands Beach', 'Eastern Beach', 'Mellons Bay', 'Cockle Bay',
    'Botany Downs', 'Dannemora', 'East Tamaki', 'Flat Bush', 'Shamrock Park', 'Somerville', 'Whitford', 'Beachlands',
    /* 南区 South */
    'Otahuhu', 'Mangere', 'Mangere Bridge', 'Papatoetoe', 'Manukau', 'Manurewa', 'Takanini', 'Papakura',
    'Drury', 'Pukekohe', 'Karaka', 'Clevedon'
  ];
  const insSub = db.prepare('INSERT OR IGNORE INTO suburbs (name,sort_order) VALUES (?,?)');
  AKL_SUBURBS.forEach((n, i) => insSub.run(n, i + 1));
  console.log(`已写入奥克兰城区列表 ${AKL_SUBURBS.length} 个(后台「地区管理」可增删)`);
}
/* 老库补录:把房源里已有但列表缺失的地区自动补入 */
db.prepare(`INSERT OR IGNORE INTO suburbs (name, sort_order)
  SELECT DISTINCT suburb, 999 FROM properties WHERE suburb != ''`).run();
/* 地区自动补录助手:表单里手输了新地区 → 自动加进列表 */
const ensureSuburb = name => {
  name = String(name || '').trim();
  if (name) db.prepare('INSERT OR IGNORE INTO suburbs (name, sort_order) VALUES (?, 999)').run(name);
};

/* ---------------- 板块调整:车辆并入集市(老库一次性迁移) ---------------- */
{
  const auto = db.prepare("SELECT id FROM sections WHERE slug='auto'").get();
  const market = db.prepare("SELECT id FROM sections WHERE slug='market'").get();
  if (auto && market) {
    const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM categories WHERE section_id=?').get(market.id).m;
    db.prepare('UPDATE categories SET section_id=?, sort_order=sort_order+? WHERE section_id=?').run(market.id, maxSort, auto.id);
    db.prepare('UPDATE posts SET section_id=? WHERE section_id=?').run(market.id, auto.id);
    db.prepare('UPDATE vendors SET section_id=? WHERE section_id=?').run(market.id, auto.id);
    db.prepare('DELETE FROM sections WHERE id=?').run(auto.id);
    db.prepare("UPDATE sections SET tagline_zh='二手闲置与车辆,物尽其用', tagline_en='Marketplace & motors' WHERE id=?").run(market.id);
    console.log('板块调整:「车辆」已并入「集市」');
  }
  /* 「机遇」更名为「招聘」(老库一次性) */
  const career = db.prepare("SELECT id FROM sections WHERE slug='career' AND name_zh='机遇'").get();
  if (career) {
    db.prepare("UPDATE sections SET name_zh='招聘', name_en='Jobs', tagline_zh='好工作与好人才,在此相逢', tagline_en='Where jobs meet talent' WHERE id=?").run(career.id);
    db.prepare("UPDATE categories SET name_zh='企业招聘', name_en='Hiring' WHERE section_id=? AND name_zh='招聘'").run(career.id);
    db.prepare("UPDATE categories SET name_zh='个人求职', name_en='Seeking' WHERE section_id=? AND name_zh='求职'").run(career.id);
    console.log('板块更名:「机遇」→「招聘」');
  }
  /* 「资讯」升为第九板块(老库一次性补入) */
  if (!db.prepare("SELECT id FROM sections WHERE slug='news'").get()) {
    db.prepare(`INSERT INTO sections (slug,name_zh,name_en,tagline_zh,tagline_en,sort_order)
      VALUES ('news','资讯','Journal','市场洞察与城中生活','Insights & city stories',
      (SELECT COALESCE(MAX(sort_order),0)+1 FROM sections))`).run();
    console.log('板块新增:「资讯」升为第九域');
  }
  /* 板块排序:资讯与集市/同城同组(幂等) */
  const ORDER = { property: 1, advisory: 2, education: 3, living: 4, market: 5, local: 6, news: 7, career: 8, culture: 9 };
  Object.entries(ORDER).forEach(([slug, n]) =>
    db.prepare('UPDATE sections SET sort_order=? WHERE slug=?').run(n, slug));
  /* 修复已入库示例内容中可能失效的图片链接(一次性,幂等) */
  const IMGFIX = [
    ['photo-1503676260728-1c00da094a0b', 'photo-1481627834876-b7833e8f5570'],
    ['photo-1523050854058-8df90110c9f1', 'photo-1481627834876-b7833e8f5570'],
    ['photo-1581578731548-c64695cc6952', 'photo-1600607687939-ce8a6c25118c'],
    ['photo-1488459716781-31db52582fe9', 'photo-1560518883-ce09059eeffa']
  ];
  IMGFIX.forEach(([a, b]) =>
    db.prepare('UPDATE posts SET images = REPLACE(images, ?, ?) WHERE images LIKE ?').run(a, b, `%${a}%`));
  /* 示例内容补英文正文(幂等,仅当为空时) */
  const DEMO_EN = {
    'Free assessment week for 2026 intakes': 'Book this week for a complimentary school-fit assessment and timeline plan, comparing public and private pathways.',
    'NCEA maths exam bootcamp': 'Four intensive weeks before finals. Groups of four, past-paper focused.',
    'Annual personal tax package': 'Covers IR3 filing, refund review and advice for the year ahead. Online or in person.',
    'End-of-tenancy deep clean': 'Two-bed home done in four hours, carpets and oven included. Free re-clean if inspection fails.',
    '2019 Toyota RAV4 GXL, 42,000 km': 'One owner, full dealership service history. Any third-party inspection welcome.',
    'Three-seater fabric sofa, like new': 'Moving overseas. Pet-free, smoke-free home. Pick-up price negotiable.',
    'Dyson V11 with full heads': 'One year of light use, healthy battery, original box and accessories.',
    'Auckland Chinese Weekend Market · July': 'Food, crafts and family fun. Free entry — vendors welcome to apply for a stall.',
    'Hiring: bilingual customer specialist': 'Fluent Mandarin and English required; retail or service experience preferred. Salary negotiable.',
    'Your first week in NZ: a settling-in checklist': 'IRD number, bank account, SIM card, GP registration, licence conversion — do them in that order and your first week takes care of itself.\n\n(Sample article — edit or remove in the admin console.)'
  };
  Object.entries(DEMO_EN).forEach(([te, ce]) =>
    db.prepare("UPDATE posts SET content_en=? WHERE title_en=? AND (content_en IS NULL OR content_en='')").run(ce, te));
}

/* ---------------- 示例内容(仅全新库:用于前台展示,可在后台删除) ---------------- */
if (db.prepare('SELECT COUNT(*) c FROM users').get().c === 0 && db.prepare('SELECT COUNT(*) c FROM posts').get().c === 0) {
  const secId = slug => (db.prepare('SELECT id FROM sections WHERE slug=?').get(slug) || {}).id;
  const catId = (sid, name) => (db.prepare('SELECT id FROM categories WHERE section_id=? AND name_zh=?').get(sid, name) || {}).id || null;
  const mkUser = (email, name) => {
    const { salt, hash } = hashPassword(crypto.randomBytes(12).toString('hex')); // 随机密码,不可登录,仅承载示例
    return db.prepare('INSERT INTO users (email,password_hash,salt,name) VALUES (?,?,?,?)').run(email, hash, salt, name).lastInsertRowid;
  };
  const mkVendor = (uid, sec, cat, zh, en, tagZh, tagEn, verified, featured) => {
    const sid = secId(sec);
    return db.prepare(`INSERT INTO vendors (user_id,name_zh,name_en,section_id,category_id,tagline_zh,tagline_en,phone,wechat,status,verified,featured,approved_at)
      VALUES (?,?,?,?,?,?,?,?,?,'approved',?,?,datetime('now','localtime'))`)
      .run(uid, zh, en, sid, catId(sid, cat), tagZh, tagEn, '021 000 0000', 'thepoint_demo', verified, featured).lastInsertRowid;
  };
  const mkPost = (uid, vid, sec, cat, type, tZh, tEn, cZh, price, pv, loc, img, featured, extra) => {
    const sid = secId(sec);
    db.prepare(`INSERT INTO posts (user_id,vendor_id,section_id,category_id,type,title_zh,title_en,content_zh,price_label,price_value,location,images,video_url,event_time,contact_wechat,status,featured)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'approved',?)`)
      .run(uid, vid, sid, catId(sid, cat), type, tZh, tEn || '', cZh, price || '', pv ?? null, loc || '',
        JSON.stringify(img ? [img] : []), (extra && extra.video) || '', (extra && extra.time) || '', 'thepoint_demo', featured ? 1 : 0);
  };
  const U = (n, name) => mkUser(`demo${n}@sample.thepoint`, name);
  const IMG = {
    sofa: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=70',
    car: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=1200&q=70',
    edu: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1200&q=70',
    office: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=70',
    clean: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=70',
    market: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1200&q=70',
    work: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=70',
    city: 'https://images.unsplash.com/photo-1507699622108-4be3abd695ad?auto=format&fit=crop&w=1200&q=70'
  };
  /* 示例入驻方 */
  const u1 = U(1, '示例·明途留学'), v1 = mkVendor(u1, 'education', '留学', '明途留学', 'Mingtu Education', '新西兰中小学与大学申请,一站式陪伴', 'School & university admissions, end to end', 1, 1);
  const u2 = U(2, '示例·优阅私教'), v2 = mkVendor(u2, 'education', '学科私教', '优阅私教中心', 'URead Tutoring', 'NCEA / CIE / IB 全科一对一', 'One-on-one tutoring across NCEA / CIE / IB', 1, 0);
  const u3 = U(3, '示例·慧算会计'), v3 = mkVendor(u3, 'advisory', '会计', '慧算会计事务所', 'WiseCount Accounting', '个人报税、公司架构与税务筹划', 'Tax returns, structures & planning', 1, 1);
  const u4 = U(4, '示例·安然律师'), v4 = mkVendor(u4, 'advisory', '律师', '安然律师行', 'Serene Legal', '房产交易与家庭信托', 'Conveyancing & family trusts', 1, 0);
  const u5 = U(5, '示例·洁心家政'), v5 = mkVendor(u5, 'living', '家政', '洁心家政', 'PureHeart Cleaning', '开荒保洁 · 退租清洁 · 定期打理', 'Move-in, end-of-tenancy & regular cleaning', 0, 1);
  const u6 = U(6, '示例·星辉车行'), v6 = mkVendor(u6, 'market', '二手车买卖', '星辉二手车行', 'StarGlow Motors', '精选日系二手车,支持 AA 验车', 'Curated Japanese imports, AA checks welcome', 1, 0);
  /* 示例内容(全部已过审;部分精选上主页) */
  mkPost(u1, v1, 'education', '留学', 'service', '2026 中学申请季 · 免费评估周', 'Free assessment week for 2026 intakes', '本周预约可获免费择校评估与时间规划,含公校与私校路线对比。', '', null, 'Albany', IMG.edu, 1);
  mkPost(u2, v2, 'education', '学科私教', 'service', 'NCEA 数学期末冲刺班开放报名', 'NCEA maths exam bootcamp', '期末前四周密集训练,小班 4 人,历年真题精讲。', '$45/小时', 45, 'Sunnynook', IMG.work, 0);
  mkPost(u3, v3, 'advisory', '会计', 'service', '年度个人报税套餐', 'Annual personal tax package', '含 IR3 申报、退税评估与来年建议,线上线下均可。', '$180 起', 180, 'CBD', IMG.office, 0);
  mkPost(u5, v5, 'living', '家政', 'service', '退租深度清洁,包通过检查', 'End-of-tenancy deep clean', '两室一厅 4 小时完成,含地毯与烤箱,不过检免费返工。', '$260 起', 260, '全奥克兰', IMG.clean, 0);
  mkPost(u6, v6, 'market', '二手车买卖', 'service', '2019 Toyota RAV4 GXL · 4.2 万公里', '2019 Toyota RAV4 GXL, 42,000 km', '一手车主,全程 4S 保养记录,支持任何第三方验车。', '$28,500', 28500, 'East Tamaki', IMG.car, 1);
  const g1 = U(7, '示例用户·安娜');
  mkPost(g1, null, 'market', '家具', 'market', '九成新三人位布艺沙发', 'Three-seater fabric sofa, like new', '搬家忍痛出,无宠物无烟环境,自取价可议。', '$180', 180, 'Milford', IMG.sofa, 1);
  mkPost(g1, null, 'market', '电器', 'market', 'Dyson V11 吸尘器(含全套刷头)', 'Dyson V11 with full heads', '使用一年,电池健康,原盒配件齐全。', '$450', 450, 'Milford', '', 0);
  mkPost(null, null, 'local', '活动', 'event', '奥克兰华人周末市集 · 七月场', 'Auckland Chinese Weekend Market · July', '美食、手作与亲子活动,免费入场;欢迎商家报名摊位。', '免费', null, 'Northcote', IMG.market, 1, { time: '2026-07-19 10:00-15:00' });
  mkPost(null, null, 'career', '企业招聘', 'job', '招聘|双语客服专员(全职)', 'Hiring: bilingual customer specialist', '要求中英流利,有零售或服务业经验者优先,薪资面议。', '', null, 'Albany', '', 0);
  mkPost(null, null, 'culture', '文章', 'article', '落地新西兰第一周:安家清单(双语)', 'Your first week in NZ: a settling-in checklist', 'IRD 号、银行开户、电话卡、GP 注册、驾照转换——按顺序做完,第一周就能安顿下来。\n\n(示例文章,可在后台编辑或删除。)', '', null, '', IMG.city, 1);
  console.log('已写入示例入驻方 6 家与示例内容 10 条(标题含「示例」的账号仅作展示,可在后台删除)');
}

/* ---------------- App ---------------- */
const app = express();
app.use(express.json({ limit: '2mb' }));

/* 阻止直接下载敏感文件 */
app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  if (p.startsWith('/data.sqlite') || p === '/server.js' || p.startsWith('/node_modules') || p === '/package.json' || p === '/package-lock.json' || p.endsWith('.md')) {
    return res.status(404).end();
  }
  next();
});

/* ---------------- 会话(SQLite 持久化,重启不掉线) ---------------- */
const ADMIN_TTL = 1000 * 60 * 60 * 12;      // 管理员 12 小时
const USER_TTL = 1000 * 60 * 60 * 24 * 30;  // 用户记住登录 30 天

function createSession(kind, refId, ttl) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token,kind,ref_id,expires) VALUES (?,?,?,?)')
    .run(token, kind, refId, Date.now() + ttl);
  return token;
}
function getSessionRow(kind, token, ttl) {
  if (!token) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE token=? AND kind=?').get(token, kind);
  if (!row) return null;
  if (row.expires < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    return null;
  }
  db.prepare('UPDATE sessions SET expires=? WHERE token=?').run(Date.now() + ttl, token); // 滑动续期
  return row;
}
const destroySession = token => { if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token); };
db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
setInterval(() => { try { db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()); } catch (e) {} }, 6 * 3600 * 1000).unref();

/* ---------------- 站点设置 + 通知 ---------------- */
const getSetting = k => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k); return r ? r.value : ''; };
const setSetting = (k, v) => db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v ?? ''));

/* 站内通知;SMTP 配置后可在此接入邮件(接口已预留) */
function notify(userId, n) {
  if (!userId) return;
  db.prepare('INSERT INTO notifications (user_id,type,title_zh,title_en,body_zh,body_en,link) VALUES (?,?,?,?,?,?,?)')
    .run(userId, n.type || 'system', n.title_zh || '', n.title_en || '', n.body_zh || '', n.body_en || '', n.link || '');
  sendMail(userId, n); // 无 SMTP 配置时为空操作
}
function sendMail(userId, n) {
  /* 邮件通知接口:后台「设置」里配置 SMTP 后,在此接入 nodemailer:
     const host = getSetting('smtp_host'); if (!host) return;
     npm install nodemailer 并按 settings 里 smtp_host/smtp_port/smtp_user/smtp_pass/smtp_from 发送。
     当前未配置 SMTP,仅站内通知。 */
}

/* 管理员操作留痕(谁 / 何时 / 对谁 / 做了什么) */
function alog(req, action, targetType, targetId, targetLabel, detail) {
  try {
    db.prepare('INSERT INTO admin_logs (admin,action,target_type,target_id,target_label,detail) VALUES (?,?,?,?,?,?)')
      .run((req.admin && req.admin.username) || 'admin', action, targetType || '', targetId ?? null,
        String(targetLabel || '').slice(0, 200), String(detail || '').slice(0, 500));
  } catch (e) { console.error('alog:', e.message); }
}
/* 踢下线:删除某用户全部会话 */
const kickUser = userId => db.prepare("DELETE FROM sessions WHERE kind='user' AND ref_id=?").run(userId);

function getToken(req) {
  const c = req.headers.cookie || '';
  const m = c.match(/(?:^|;\s*)tp_sid=([a-f0-9]{48})/);
  return m ? m[1] : null;
}
function requireAuth(req, res, next) {
  const s = getSessionRow('admin', getToken(req), ADMIN_TTL);
  if (!s) return res.status(401).json({ error: '未登录' });
  const adm = db.prepare('SELECT id,username FROM admins WHERE id=?').get(s.ref_id);
  if (!adm) return res.status(401).json({ error: '未登录' });
  req.admin = { username: adm.username };
  next();
}

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const row = db.prepare('SELECT * FROM admins WHERE username=?').get(String(username || ''));
  if (!row || !verifyPassword(String(password || ''), row.salt, row.password_hash)) {
    return res.status(401).json({ error: '账号或密码错误' });
  }
  const token = createSession('admin', row.id, ADMIN_TTL);
  res.setHeader('Set-Cookie', `tp_sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${ADMIN_TTL / 1000}`);
  res.json({ ok: true, username: row.username });
});
app.post('/api/admin/logout', (req, res) => {
  destroySession(getToken(req));
  res.setHeader('Set-Cookie', 'tp_sid=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/admin/me', requireAuth, (req, res) => res.json({ username: req.admin.username }));
app.post('/api/admin/change-password', requireAuth, (req, res) => {
  const { old_password, new_password } = req.body || {};
  const row = db.prepare('SELECT * FROM admins WHERE username=?').get(req.admin.username);
  if (!verifyPassword(String(old_password || ''), row.salt, row.password_hash)) {
    return res.status(400).json({ error: '原密码错误' });
  }
  if (!new_password || String(new_password).length < 6) return res.status(400).json({ error: '新密码至少 6 位' });
  const { salt, hash } = hashPassword(String(new_password));
  db.prepare('UPDATE admins SET password_hash=?, salt=? WHERE id=?').run(hash, salt, row.id);
  res.json({ ok: true });
});

/* ============================================================
   用户账号体系(统一账号:普通用户 / 入驻方)
   ============================================================ */
function getUserToken(req) {
  const c = req.headers.cookie || '';
  const m = c.match(/(?:^|;\s*)tp_uid=([a-f0-9]{48})/);
  return m ? m[1] : null;
}
function currentUser(req) {
  const s = getSessionRow('user', getUserToken(req), USER_TTL);
  if (!s) return null;
  const u = db.prepare('SELECT id,email,name,phone,wechat,avatar,status FROM users WHERE id=?').get(s.ref_id);
  return (u && u.status === 'active') ? u : null;
}
function requireUser(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: '请先登录' });
  req.user = u;
  next();
}
const vendorOf = userId => db.prepare('SELECT * FROM vendors WHERE user_id=?').get(userId) || null;
function publicVendor(v) {
  if (!v) return null;
  let photos = [];
  try { photos = JSON.parse(v.photos || '[]'); } catch (e) {}
  const { user_id, apply_message, review_note, ...rest } = v;
  return { ...rest, photos };
}

app.post('/api/auth/register', (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: '邮箱格式不正确' });
  if (!b.password || String(b.password).length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return res.status(400).json({ error: '该邮箱已注册' });
  const { salt, hash } = hashPassword(String(b.password));
  const info = db.prepare('INSERT INTO users (email,password_hash,salt,name,phone) VALUES (?,?,?,?,?)')
    .run(email, hash, salt, String(b.name || '').slice(0, 100), String(b.phone || '').slice(0, 50));
  const token = createSession('user', info.lastInsertRowid, USER_TTL);
  res.setHeader('Set-Cookie', `tp_uid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${USER_TTL / 1000}`);
  notify(info.lastInsertRowid, {
    type: 'system',
    title_zh: '欢迎来到一点', title_en: 'Welcome to The Point',
    body_zh: '您现在可以在「集市」发布二手闲置;商家与顾问可申请入驻,获得专属主页。',
    body_en: 'You can now post in the Marketplace. Businesses and advisors may apply to become a provider.',
    link: 'join.html'
  });
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.post('/api/auth/login', (req, res) => {
  const b = req.body || {};
  const row = db.prepare('SELECT * FROM users WHERE email=?').get(String(b.email || '').trim().toLowerCase());
  if (!row || !verifyPassword(String(b.password || ''), row.salt, row.password_hash)) {
    return res.status(401).json({ error: '邮箱或密码错误' });
  }
  if (row.status !== 'active') return res.status(403).json({ error: '账号已被停用,请联系管理员' });
  const token = createSession('user', row.id, USER_TTL);
  res.setHeader('Set-Cookie', `tp_uid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${USER_TTL / 1000}`);
  res.json({ ok: true, name: row.name, email: row.email });
});
app.post('/api/auth/logout', (req, res) => {
  destroySession(getUserToken(req));
  res.setHeader('Set-Cookie', 'tp_uid=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/auth/me', requireUser, (req, res) => {
  const v = vendorOf(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND is_read=0').get(req.user.id).c;
  res.json({
    ...req.user, unread_notifications: unread,
    vendor: v ? { id: v.id, status: v.status, verified: v.verified, name_zh: v.name_zh, name_en: v.name_en } : null
  });
});
/* ---------- 站内通知 ---------- */
app.get('/api/my/notifications', requireUser, (req, res) => {
  res.json(db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50').all(req.user.id));
});
app.put('/api/my/notifications/read-all', requireUser, (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(req.user.id);
  res.json({ ok: true });
});
app.put('/api/my/notifications/:id/read', requireUser, (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});
app.put('/api/auth/profile', requireUser, (req, res) => {
  const b = req.body || {};
  db.prepare('UPDATE users SET name=?, phone=?, wechat=?, avatar=? WHERE id=?')
    .run(String(b.name ?? req.user.name).slice(0, 100), String(b.phone ?? req.user.phone).slice(0, 50),
      String(b.wechat ?? req.user.wechat).slice(0, 100), String(b.avatar ?? req.user.avatar).slice(0, 300), req.user.id);
  res.json({ ok: true });
});
app.post('/api/auth/change-password', requireUser, (req, res) => {
  const { old_password, new_password } = req.body || {};
  const row = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!verifyPassword(String(old_password || ''), row.salt, row.password_hash)) {
    return res.status(400).json({ error: '原密码错误' });
  }
  if (!new_password || String(new_password).length < 6) return res.status(400).json({ error: '新密码至少 6 位' });
  const { salt, hash } = hashPassword(String(new_password));
  db.prepare('UPDATE users SET password_hash=?, salt=? WHERE id=?').run(hash, salt, row.id);
  res.json({ ok: true });
});

/* ---------------- 图片上传 ---------------- */
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    cb(null, /^image\/(jpe?g|png|webp|gif|svg\+xml|avif)$/.test(file.mimetype));
  }
});
app.post('/api/admin/upload', requireAuth, upload.array('files', 20), (req, res) => {
  res.json({ files: (req.files || []).map(f => 'uploads/' + f.filename) });
});
/* 登录用户上传(发布配图 / 头像 / 入驻资料) */
app.post('/api/user/upload', requireUser, upload.array('files', 6), (req, res) => {
  res.json({ files: (req.files || []).map(f => 'uploads/' + f.filename) });
});

/* ---------------- 公共工具 ---------------- */
function parseProp(row) {
  if (!row) return row;
  let images = [];
  try { images = JSON.parse(row.images || '[]'); } catch (e) {}
  const agent = row.agent_id
    ? db.prepare('SELECT id,name,category,email,phone,wechat,photo FROM agents WHERE id=?').get(row.agent_id)
    : null;
  return { ...row, images, cover: images[0] || '', agent };
}

/* ---------------- 前台 API ---------------- */
/* 房源列表(带筛选/排序/分页) */
app.get('/api/properties', (req, res) => {
  const q = req.query;
  const where = ["status != '下架'"];
  const args = [];
  if (q.city) { where.push('city = ?'); args.push(q.city); }
  if (q.suburb) { where.push('suburb = ?'); args.push(q.suburb); }
  if (q.type) { where.push('type = ?'); args.push(q.type); }
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
    'new': 'id DESC',
    'price_desc': 'price_value IS NULL, price_value DESC',
    'price_asc': 'price_value IS NULL, price_value ASC',
    'featured': 'featured DESC, id DESC'
  };
  const order = sorts[q.sort] || sorts['new'];
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(48, Number(q.limit) || 12);
  const total = db.prepare(`SELECT COUNT(*) c FROM properties WHERE ${where.join(' AND ')}`).get(...args).c;
  const rows = db.prepare(`SELECT * FROM properties WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...args, limit, (page - 1) * limit);
  res.json({ total, page, limit, items: rows.map(parseProp) });
});
app.get('/api/properties/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM properties WHERE id=?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: '房源不存在' });
  res.json(parseProp(row));
});
/* 搜索下拉选项 */
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
/* 资讯 */
app.get('/api/news', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(30, Number(req.query.limit) || 10);
  const total = db.prepare('SELECT COUNT(*) c FROM news WHERE visible=1').get().c;
  const items = db.prepare('SELECT id,title,source_note,excerpt,image,published_at FROM news WHERE visible=1 ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?')
    .all(limit, (page - 1) * limit);
  res.json({ total, page, limit, items });
});
app.get('/api/news/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM news WHERE id=? AND visible=1').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: '文章不存在' });
  res.json(row);
});
/* 伙伴 */
app.get('/api/partners', (req, res) => {
  res.json(db.prepare('SELECT id,name,category,logo,url FROM partners WHERE visible=1 ORDER BY sort_order,id').all());
});
/* 服务名录(过期的自动隐藏;推荐的排前面) */
app.get('/api/services', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const where = ["visible=1", "(expires_at='' OR expires_at IS NULL OR expires_at >= ?)"];
  const args = [today];
  if (req.query.category) { where.push('category = ?'); args.push(req.query.category); }
  const rows = db.prepare(`SELECT id,name,category,tagline,description,phone,email,wechat,website,logo,featured
    FROM services WHERE ${where.join(' AND ')} ORDER BY featured DESC, sort_order, id`).all(...args);
  const cats = db.prepare(`SELECT DISTINCT category FROM services
    WHERE visible=1 AND (expires_at='' OR expires_at IS NULL OR expires_at >= ?) ORDER BY category`).all(today).map(r => r.category);
  res.json({ categories: cats, items: rows });
});
/* 地区列表(奥克兰城区,选择房产/学校/服务位置时用) */
app.get('/api/suburbs', (req, res) => {
  res.json(db.prepare('SELECT name FROM suburbs WHERE visible=1 ORDER BY sort_order, name').all().map(r => r.name));
});
/* 视频(首页 home=1 / 资讯页 news=1 / 按分类) */
function parseVideo(r) {
  const cover = r.cover || (r.video_id ? `https://i.ytimg.com/vi/${r.video_id}/hqdefault.jpg` : '');
  return { ...r, cover, embed_url: r.video_id ? `https://www.youtube.com/embed/${r.video_id}` : '' };
}
app.get('/api/videos', (req, res) => {
  const q = req.query;
  const where = ['visible=1']; const args = [];
  if (q.home === '1') where.push('home_play=1');
  if (q.news === '1') where.push('news_play=1');
  if (q.category) { where.push('category = ?'); args.push(q.category); }
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(48, Number(q.limit) || 12);
  const order = 'home_top DESC, sort_order, published_at DESC, id DESC'; // 置顶最前
  const total = db.prepare(`SELECT COUNT(*) c FROM videos WHERE ${where.join(' AND ')}`).get(...args).c;
  const rows = db.prepare(`SELECT * FROM videos WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...args, limit, (page - 1) * limit);
  const cats = db.prepare("SELECT DISTINCT category FROM videos WHERE visible=1 AND category != '' ORDER BY category").all().map(r => r.category);
  res.json({ total, page, limit, categories: cats, items: rows.map(parseVideo) });
});
/* 学校(按地区/类型筛选) */
app.get('/api/schools', (req, res) => {
  const where = ['visible=1']; const args = [];
  if (req.query.suburb) { where.push('suburb = ?'); args.push(req.query.suburb); }
  if (req.query.type) { where.push('type = ?'); args.push(req.query.type); }
  const rows = db.prepare(`SELECT * FROM schools WHERE ${where.join(' AND ')} ORDER BY sort_order, name`).all(...args);
  const types = db.prepare("SELECT DISTINCT type FROM schools WHERE visible=1 AND type != '' ORDER BY type").all().map(r => r.type);
  const subs = db.prepare("SELECT DISTINCT suburb FROM schools WHERE visible=1 AND suburb != '' ORDER BY suburb").all().map(r => r.suburb);
  res.json({ types, suburbs: subs, items: rows });
});
/* 邮件订阅(简单直接:填邮箱即可;防垃圾:格式校验 + 频率限制 + 去重) */
const subHits = new Map(); // ip -> [时间戳]
app.post('/api/subscribe', (req, res) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const hits = (subHits.get(ip) || []).filter(t => now - t < 3600 * 1000);
  if (hits.length >= 5) return res.status(429).json({ error: '操作过于频繁,请稍后再试' });
  hits.push(now); subHits.set(ip, hits);
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) return res.status(400).json({ error: '邮箱格式不正确' });
  const name = String(b.name || '').replace(/[<>'"();=]/g, '').slice(0, 100);
  try {
    db.prepare("INSERT INTO subscribers (email,name) VALUES (?,?) ON CONFLICT(email) DO UPDATE SET status='active'").run(email, name);
  } catch (e) { return res.status(500).json({ error: '订阅失败,请稍后再试' }); }
  res.json({ ok: true });
});

/* 留言 / 咨询 / 订阅 */
app.post('/api/enquiries', (req, res) => {
  const b = req.body || {};
  if (!b.message && b.type !== 'subscribe') return res.status(400).json({ error: '请填写留言内容' });
  if (b.type === 'subscribe' && !b.email) return res.status(400).json({ error: '请填写邮箱' });
  if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email))) return res.status(400).json({ error: '邮箱格式不正确' });
  const vendorId = b.vendor_id ? Number(b.vendor_id) : null;
  db.prepare('INSERT INTO enquiries (type,name,email,phone,message,agent_id,property_id,vendor_id) VALUES (?,?,?,?,?,?,?,?)')
    .run(String(b.type || 'general'), String(b.name || '').slice(0, 100), String(b.email || '').slice(0, 200),
      String(b.phone || '').slice(0, 50), String(b.message || '').slice(0, 5000),
      b.agent_id ? Number(b.agent_id) : null, b.property_id ? Number(b.property_id) : null, vendorId);
  /* 给入驻方留言 → 站内通知对方 */
  if (vendorId) {
    const v = db.prepare('SELECT user_id,name_zh FROM vendors WHERE id=?').get(vendorId);
    if (v) notify(v.user_id, {
      type: 'enquiry',
      title_zh: '收到一条新留言', title_en: 'New enquiry received',
      body_zh: `${String(b.name || '访客').slice(0, 50)}:${String(b.message || '').slice(0, 120)}`,
      body_en: `${String(b.name || 'Guest').slice(0, 50)}: ${String(b.message || '').slice(0, 120)}`,
      link: 'me.html#enquiries'
    });
  }
  res.json({ ok: true });
});

/* ============================================================
   平台化:板块/分类、入驻方、内容发布与审核
   ============================================================ */

/* ---------- 板块与分类(公开) ---------- */
app.get('/api/sections', (req, res) => {
  const secs = db.prepare('SELECT * FROM sections WHERE visible=1 ORDER BY sort_order,id').all();
  const cats = db.prepare('SELECT * FROM categories WHERE visible=1 ORDER BY sort_order,id').all();
  res.json(secs.map(s => ({ ...s, categories: cats.filter(c => c.section_id === s.id) })));
});

/* ---------- 内容(posts)公共工具 ---------- */
function parsePost(row) {
  if (!row) return row;
  let images = [];
  try { images = JSON.parse(row.images || '[]'); } catch (e) {}
  let vendor = null;
  if (row.vendor_id) {
    const v = db.prepare("SELECT id,name_zh,name_en,logo,verified,status FROM vendors WHERE id=?").get(row.vendor_id);
    if (v && v.status === 'approved') vendor = { id: v.id, name_zh: v.name_zh, name_en: v.name_en, logo: v.logo, verified: v.verified };
  }
  const sec = row.section_id ? db.prepare('SELECT id,slug,name_zh,name_en FROM sections WHERE id=?').get(row.section_id) : null;
  const cat = row.category_id ? db.prepare('SELECT id,name_zh,name_en FROM categories WHERE id=?').get(row.category_id) : null;
  return { ...row, images, cover: images[0] || '', vendor, section: sec, category: cat };
}

/* 联系方式防护:未登录访客不可见,前台显示「登录查看」 */
const CONTACT_POST = ['contact_phone', 'contact_wechat', 'contact_email'];
const CONTACT_VENDOR = ['phone', 'email', 'wechat'];
function lockContacts(obj, viewer, fields) {
  if (viewer || !obj) return obj;
  const out = { ...obj };
  let had = false;
  for (const f of fields) if (out[f]) { had = true; out[f] = ''; }
  if (had) out.contact_locked = 1;
  return out;
}
/* 列表响应精简:正文截断,减小传输体积 */
function slimPost(p) {
  if (!p) return p;
  const cut = s => (s && s.length > 200) ? s.slice(0, 200) + '…' : s;
  const { extra, review_note, ...rest } = p;
  return { ...rest, content_zh: cut(p.content_zh), content_en: cut(p.content_en) };
}

/* ---------- 前台:内容流 ---------- */
app.get('/api/posts', (req, res) => {
  const q = req.query;
  /* 可见性:内容已审核 + 入驻方在驻 + 发布者账号未被封禁(封禁自动下架,解封自动恢复) */
  const where = ["p.status = 'approved'", "(p.vendor_id IS NULL OR v.status = 'approved')", "(p.user_id IS NULL OR u.status = 'active')"];
  const args = [];
  if (q.section) { where.push('s.slug = ?'); args.push(q.section); }
  if (q.category_id) { where.push('p.category_id = ?'); args.push(Number(q.category_id)); }
  if (q.type) { where.push('p.type = ?'); args.push(q.type); }
  if (q.vendor_id) { where.push('p.vendor_id = ?'); args.push(Number(q.vendor_id)); }
  if (q.featured === '1') { where.push('p.featured = 1'); }
  if (q.q) {
    where.push('(p.title_zh LIKE ? OR p.title_en LIKE ? OR p.content_zh LIKE ? OR p.content_en LIKE ? OR p.location LIKE ?)');
    const kw = `%${q.q}%`;
    args.push(kw, kw, kw, kw, kw);
  }
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(48, Number(q.limit) || 12);
  const base = `FROM posts p LEFT JOIN vendors v ON v.id = p.vendor_id LEFT JOIN sections s ON s.id = p.section_id LEFT JOIN users u ON u.id = p.user_id WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) c ${base}`).get(...args).c;
  const rows = db.prepare(`SELECT p.* ${base} ORDER BY p.featured DESC, p.published_at DESC, p.id DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, (page - 1) * limit);
  const viewer = currentUser(req);
  res.json({ total, page, limit, items: rows.map(r => lockContacts(slimPost(parsePost(r)), viewer, CONTACT_POST)) });
});
app.get('/api/posts/:id', (req, res) => {
  const row = db.prepare("SELECT * FROM posts WHERE id=? AND status='approved'").get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: '内容不存在或未通过审核' });
  if (row.user_id) {
    const owner = db.prepare('SELECT status FROM users WHERE id=?').get(row.user_id);
    if (!owner || owner.status !== 'active') return res.status(404).json({ error: '内容不存在或未通过审核' });
  }
  const p = parsePost(row);
  if (row.vendor_id && !p.vendor) return res.status(404).json({ error: '内容不存在或未通过审核' });
  res.json(lockContacts(p, currentUser(req), CONTACT_POST));
});

/* ---------- 前台:入驻方目录与主页 ---------- */
app.get('/api/vendors', (req, res) => {
  const q = req.query;
  const where = ["v.status = 'approved'", "u.status = 'active'"];
  const args = [];
  if (q.section) { where.push('s.slug = ?'); args.push(q.section); }
  if (q.category_id) { where.push('v.category_id = ?'); args.push(Number(q.category_id)); }
  if (q.featured === '1') { where.push('v.featured = 1'); }
  if (q.q) {
    where.push('(v.name_zh LIKE ? OR v.name_en LIKE ? OR v.tagline_zh LIKE ? OR v.intro_zh LIKE ?)');
    const kw = `%${q.q}%`;
    args.push(kw, kw, kw, kw);
  }
  const rows = db.prepare(`SELECT v.* FROM vendors v LEFT JOIN sections s ON s.id = v.section_id LEFT JOIN users u ON u.id = v.user_id
    WHERE ${where.join(' AND ')} ORDER BY v.featured DESC, v.verified DESC, v.sort_order, v.id`).all(...args);
  const viewer = currentUser(req);
  res.json(rows.map(r => lockContacts(publicVendor(r), viewer, CONTACT_VENDOR)));
});
app.get('/api/vendors/:id', (req, res) => {
  const v = db.prepare(`SELECT v.* FROM vendors v JOIN users u ON u.id = v.user_id
    WHERE v.id=? AND v.status='approved' AND u.status='active'`).get(Number(req.params.id));
  if (!v) return res.status(404).json({ error: '入驻方不存在' });
  const posts = db.prepare("SELECT * FROM posts WHERE vendor_id=? AND status='approved' ORDER BY featured DESC, published_at DESC").all(v.id);
  const viewer = currentUser(req);
  res.json({
    ...lockContacts(publicVendor(v), viewer, CONTACT_VENDOR),
    posts: posts.map(p => lockContacts(slimPost(parsePost(p)), viewer, CONTACT_POST))
  });
});

/* ---------- 主页聚合 ---------- */
app.get('/api/home', (req, res) => {
  const viewer = currentUser(req);
  const secs = db.prepare('SELECT * FROM sections WHERE visible=1 ORDER BY sort_order,id').all();
  const featuredPosts = db.prepare(`SELECT p.* FROM posts p LEFT JOIN vendors v ON v.id=p.vendor_id LEFT JOIN users u ON u.id=p.user_id
    WHERE p.status='approved' AND p.featured=1 AND (p.vendor_id IS NULL OR v.status='approved') AND (p.user_id IS NULL OR u.status='active')
    ORDER BY p.published_at DESC, p.id DESC LIMIT 12`).all()
    .map(r => lockContacts(slimPost(parsePost(r)), viewer, CONTACT_POST));
  const vendors = db.prepare(`SELECT v.* FROM vendors v JOIN users u ON u.id=v.user_id
    WHERE v.status='approved' AND u.status='active' AND (v.featured=1 OR v.verified=1)
    ORDER BY v.featured DESC, v.verified DESC, v.sort_order, v.id LIMIT 8`).all()
    .map(r => lockContacts(publicVendor(r), viewer, CONTACT_VENDOR));
  const props = db.prepare(`SELECT * FROM properties WHERE status='在售' AND featured=1 ORDER BY id DESC LIMIT 3`).all().map(parseProp);
  const news = db.prepare('SELECT id,title,title_en,source_note,excerpt,excerpt_en,image,published_at FROM news WHERE visible=1 ORDER BY published_at DESC, id DESC LIMIT 3').all();
  res.json({ sections: secs, featured_posts: featuredPosts, vendors, properties: props, news });
});

/* ---------- 全站搜索(双语,跨房源/入驻方/内容/资讯) ---------- */
app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  if (q.length < 1) return res.json({ q, properties: [], vendors: [], posts: [], news: [] });
  const kw = `%${q}%`;
  const viewer = currentUser(req);
  const properties = db.prepare(`SELECT * FROM properties WHERE status != '下架' AND
    (title LIKE ? OR title_en LIKE ? OR address LIKE ? OR suburb LIKE ? OR city LIKE ? OR description LIKE ? OR description_en LIKE ?)
    ORDER BY featured DESC, id DESC LIMIT 8`).all(kw, kw, kw, kw, kw, kw, kw).map(parseProp);
  const vendors = db.prepare(`SELECT v.* FROM vendors v JOIN users u ON u.id=v.user_id
    WHERE v.status='approved' AND u.status='active' AND
    (v.name_zh LIKE ? OR v.name_en LIKE ? OR v.tagline_zh LIKE ? OR v.tagline_en LIKE ? OR v.intro_zh LIKE ? OR v.intro_en LIKE ?)
    ORDER BY v.featured DESC, v.verified DESC, v.id LIMIT 8`).all(kw, kw, kw, kw, kw, kw)
    .map(r => lockContacts(publicVendor(r), viewer, CONTACT_VENDOR));
  const posts = db.prepare(`SELECT p.* FROM posts p LEFT JOIN vendors v ON v.id=p.vendor_id LEFT JOIN users u ON u.id=p.user_id
    WHERE p.status='approved' AND (p.vendor_id IS NULL OR v.status='approved') AND (p.user_id IS NULL OR u.status='active') AND
    (p.title_zh LIKE ? OR p.title_en LIKE ? OR p.content_zh LIKE ? OR p.content_en LIKE ? OR p.location LIKE ?)
    ORDER BY p.featured DESC, p.published_at DESC LIMIT 12`).all(kw, kw, kw, kw, kw)
    .map(r => lockContacts(slimPost(parsePost(r)), viewer, CONTACT_POST));
  const news = db.prepare(`SELECT id,title,title_en,excerpt,excerpt_en,image,published_at FROM news WHERE visible=1 AND
    (title LIKE ? OR title_en LIKE ? OR excerpt LIKE ? OR content LIKE ? OR content_en LIKE ?)
    ORDER BY published_at DESC LIMIT 6`).all(kw, kw, kw, kw, kw);
  res.json({ q, properties, vendors, posts, news });
});

/* ---------- 入驻申请与自助管理 ---------- */
const VENDOR_FIELDS = ['name_zh', 'name_en', 'section_id', 'category_id', 'tagline_zh', 'tagline_en',
  'intro_zh', 'intro_en', 'phone', 'email', 'wechat', 'website', 'logo', 'photos', 'apply_message'];
function pickVendorBody(b) {
  const out = {};
  for (const f of VENDOR_FIELDS) {
    if (!(f in b)) continue;
    let v = b[f];
    if (f === 'photos') v = JSON.stringify(Array.isArray(v) ? v : []);
    else if (f === 'section_id' || f === 'category_id') v = v ? Number(v) : null;
    else v = String(v ?? '').slice(0, 5000);
    out[f] = v;
  }
  return out;
}
app.post('/api/vendor/apply', requireUser, (req, res) => {
  const data = pickVendorBody(req.body || {});
  if (!data.name_zh) return res.status(400).json({ error: '请填写名称' });
  if (!data.section_id) return res.status(400).json({ error: '请选择所属板块' });
  const existing = vendorOf(req.user.id);
  if (existing && (existing.status === 'approved' || existing.status === 'pending')) {
    return res.status(400).json({ error: existing.status === 'approved' ? '您已是入驻方' : '申请审核中,请耐心等待' });
  }
  if (existing) { // rejected / suspended → 重新提交
    const keys = Object.keys(data);
    db.prepare(`UPDATE vendors SET ${keys.map(k => `${k}=?`).join(',')}, status='pending', review_note='' WHERE id=?`)
      .run(...keys.map(k => data[k]), existing.id);
    return res.json({ ok: true, id: existing.id, resubmitted: true });
  }
  const keys = Object.keys(data);
  const info = db.prepare(`INSERT INTO vendors (user_id,${keys.join(',')}) VALUES (?,${keys.map(() => '?').join(',')})`)
    .run(req.user.id, ...keys.map(k => data[k]));
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.get('/api/vendor/me', requireUser, (req, res) => {
  const v = vendorOf(req.user.id);
  if (!v) return res.status(404).json({ error: '尚未申请入驻' });
  let photos = [];
  try { photos = JSON.parse(v.photos || '[]'); } catch (e) {}
  res.json({ ...v, photos });
});
app.put('/api/vendor/me', requireUser, (req, res) => {
  const v = vendorOf(req.user.id);
  if (!v) return res.status(404).json({ error: '尚未申请入驻' });
  const data = pickVendorBody(req.body || {});
  delete data.apply_message;
  const keys = Object.keys(data);
  if (!keys.length) return res.status(400).json({ error: '没有可更新的字段' });
  /* 公开资料修改须重新审核,保调性 */
  db.prepare(`UPDATE vendors SET ${keys.map(k => `${k}=?`).join(',')}, status='pending' WHERE id=?`)
    .run(...keys.map(k => data[k]), v.id);
  res.json({ ok: true, review: true });
});

/* ---------- 我的发布(用户/入驻方) ---------- */
const POST_FIELDS = ['section_id', 'category_id', 'type', 'title_zh', 'title_en', 'content_zh', 'content_en',
  'images', 'video_url', 'price_label', 'price_value', 'contact_name', 'contact_phone', 'contact_wechat',
  'contact_email', 'location', 'event_time'];
function pickPostBody(b) {
  const out = {};
  for (const f of POST_FIELDS) {
    if (!(f in b)) continue;
    let v = b[f];
    if (f === 'images') v = JSON.stringify(Array.isArray(v) ? v : []);
    else if (['section_id', 'category_id', 'price_value'].includes(f)) v = (v === '' || v == null) ? null : Number(v);
    else v = String(v ?? '').slice(0, 20000);
    out[f] = v;
  }
  return out;
}
const USER_POST_TYPES = ['market'];                                    // 普通用户:二手闲置
const VENDOR_POST_TYPES = ['market', 'service', 'update', 'event', 'job']; // 入驻方:服务/动态/活动/招聘
function allowedTypes(userId) {
  const v = vendorOf(userId);
  return (v && v.status === 'approved') ? VENDOR_POST_TYPES : USER_POST_TYPES;
}
app.get('/api/my/posts', requireUser, (req, res) => {
  const rows = db.prepare('SELECT * FROM posts WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  res.json(rows.map(parsePost));
});
app.post('/api/my/posts', requireUser, (req, res) => {
  const data = pickPostBody(req.body || {});
  if (!data.title_zh && !data.title_en) return res.status(400).json({ error: '请填写标题' });
  if (!data.section_id || !db.prepare('SELECT id FROM sections WHERE id=? AND visible=1').get(data.section_id)) {
    return res.status(400).json({ error: '请选择板块' });
  }
  data.type = data.type || 'market';
  if (!allowedTypes(req.user.id).includes(data.type)) {
    return res.status(403).json({ error: '当前身份不能发布该类型内容(可申请成为入驻方)' });
  }
  const v = vendorOf(req.user.id);
  const vendorId = (v && v.status === 'approved' && data.type !== 'market') ? v.id : null;
  const keys = Object.keys(data);
  const info = db.prepare(`INSERT INTO posts (user_id,vendor_id,${keys.join(',')}) VALUES (?,?,${keys.map(() => '?').join(',')})`)
    .run(req.user.id, vendorId, ...keys.map(k => data[k]));
  res.json({ ok: true, id: info.lastInsertRowid, status: 'pending' });
});
app.put('/api/my/posts/:id', requireUser, (req, res) => {
  const row = db.prepare('SELECT * FROM posts WHERE id=? AND user_id=?').get(Number(req.params.id), req.user.id);
  if (!row) return res.status(404).json({ error: '内容不存在' });
  const data = pickPostBody(req.body || {});
  delete data.type; // 类型不可改
  const keys = Object.keys(data);
  if (!keys.length) return res.status(400).json({ error: '没有可更新的字段' });
  /* 编辑后重新进入审核 */
  db.prepare(`UPDATE posts SET ${keys.map(k => `${k}=?`).join(',')}, status='pending' WHERE id=?`)
    .run(...keys.map(k => data[k]), row.id);
  res.json({ ok: true, status: 'pending' });
});
app.delete('/api/my/posts/:id', requireUser, (req, res) => {
  const info = db.prepare('DELETE FROM posts WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id);
  res.json({ ok: info.changes > 0 });
});
/* 入驻方查看收到的留言 */
app.get('/api/my/enquiries', requireUser, (req, res) => {
  const v = vendorOf(req.user.id);
  if (!v) return res.json([]);
  res.json(db.prepare('SELECT id,name,email,phone,message,created_at FROM enquiries WHERE vendor_id=? ORDER BY id DESC LIMIT 100').all(v.id));
});

/* ---------------- 管理后台 API(需登录) ---------------- */
const TABLES = {
  properties: {
    fields: ['title', 'title_en', 'address', 'suburb', 'city', 'type', 'status', 'price_label', 'price_value', 'beds', 'baths', 'garages', 'land_area', 'floor_area', 'open_home', 'tour_url', 'description', 'description_en', 'images', 'agent_id', 'featured'],
    nums: ['price_value', 'beds', 'baths', 'garages', 'agent_id', 'featured'],
    required: ['title']
  },
  agents: {
    fields: ['name', 'category', 'email', 'phone', 'wechat', 'photo', 'bio', 'bio_en', 'sort_order', 'visible'],
    nums: ['sort_order', 'visible'],
    required: ['name']
  },
  news: {
    fields: ['title', 'title_en', 'source_note', 'excerpt', 'excerpt_en', 'content', 'content_en', 'image', 'published_at', 'visible'],
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
    if (f === 'images') v = JSON.stringify(Array.isArray(v) ? v : []);
    else if (cfg.nums.includes(f)) v = (v === '' || v === null || v === undefined) ? null : Number(v);
    else v = v === null || v === undefined ? '' : String(v);
    out[f] = v;
  }
  return out;
}
/* 保存前的小处理:视频链接提取 ID;手输的新地区自动入列 */
function normalizeAdminData(table, data) {
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
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  app.put(`/api/admin/${table}/:id`, requireAuth, (req, res) => {
    const data = normalizeAdminData(table, pickBody(cfg, req.body || {}));
    const keys = Object.keys(data);
    if (!keys.length) return res.status(400).json({ error: '没有可更新的字段' });
    const info = db.prepare(`UPDATE ${table} SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`)
      .run(...keys.map(k => data[k]), Number(req.params.id));
    res.json({ ok: info.changes > 0 });
  });
  app.delete(`/api/admin/${table}/:id`, requireAuth, (req, res) => {
    const info = db.prepare(`DELETE FROM ${table} WHERE id=?`).run(Number(req.params.id));
    res.json({ ok: info.changes > 0 });
  });
}
/* ---------- 订阅邮箱管理 ---------- */
app.get('/api/admin/subscribers', requireAuth, (req, res) => {
  const where = []; const args = [];
  if (req.query.q) { where.push('(email LIKE ? OR name LIKE ?)'); const kw = `%${String(req.query.q).slice(0, 80)}%`; args.push(kw, kw); }
  if (req.query.status) { where.push('status = ?'); args.push(req.query.status); }
  res.json(db.prepare(`SELECT * FROM subscribers ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 2000`).all(...args));
});
app.delete('/api/admin/subscribers/:id', requireAuth, (req, res) => {
  res.json({ ok: db.prepare('DELETE FROM subscribers WHERE id=?').run(Number(req.params.id)).changes > 0 });
});

/* ---------- 数据导出 / 备份 ---------- */
const EXPORT_TABLES = ['properties', 'agents', 'news', 'partners', 'services', 'enquiries', 'users', 'sections',
  'categories', 'vendors', 'posts', 'videos', 'schools', 'subscribers', 'suburbs', 'admin_logs'];
const HIDE_COLS = ['password_hash', 'salt']; // 导出时不含密码字段
function toCSV(rows) {
  if (!rows.length) return '﻿';
  const cols = Object.keys(rows[0]).filter(c => !HIDE_COLS.includes(c));
  const cell = v => { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  return '﻿' + cols.join(',') + '\n' + rows.map(r => cols.map(c => cell(r[c])).join(',')).join('\n');
}
app.get('/api/admin/export/csv/:table', requireAuth, (req, res) => {
  const t = req.params.table;
  if (!EXPORT_TABLES.includes(t)) return res.status(400).json({ error: '不支持导出该表' });
  const rows = db.prepare(`SELECT * FROM ${t} ORDER BY id`).all();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="thepoint-${t}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(toCSV(rows));
  alog(req, 'export_csv', 'table', null, t, `导出 ${rows.length} 条`);
});
app.get('/api/admin/export/db', requireAuth, (req, res) => {
  const tmp = path.join(ROOT, `.backup-${Date.now()}.sqlite`);
  try {
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`); // 完整一致性备份(含 WAL 中未落盘数据)
    res.download(tmp, `thepoint-backup-${new Date().toISOString().slice(0, 10)}.sqlite`, () => { try { fs.unlinkSync(tmp); } catch (e) {} });
    alog(req, 'export_db', 'db', null, 'data.sqlite', '下载完整数据库备份');
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) {}
    res.status(500).json({ error: '备份失败: ' + e.message });
  }
});

/* 留言管理 */
app.get('/api/admin/enquiries', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT e.*, a.name AS agent_name, p.title AS property_title, v.name_zh AS vendor_name
    FROM enquiries e
    LEFT JOIN agents a ON a.id = e.agent_id
    LEFT JOIN properties p ON p.id = e.property_id
    LEFT JOIN vendors v ON v.id = e.vendor_id
    ORDER BY e.id DESC`).all();
  res.json(rows);
});
app.put('/api/admin/enquiries/:id/read', requireAuth, (req, res) => {
  db.prepare('UPDATE enquiries SET is_read=1 WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});
app.delete('/api/admin/enquiries/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM enquiries WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});
/* ---------- 用户管理(搜索筛选 / 封禁踢下线 / 重置密码 / 详情 / 级联注销) ---------- */
app.get('/api/admin/users', requireAuth, (req, res) => {
  const q = req.query;
  const where = []; const args = [];
  if (q.q) {
    where.push('(u.email LIKE ? OR u.name LIKE ? OR u.phone LIKE ?)');
    const kw = `%${String(q.q).slice(0, 80)}%`;
    args.push(kw, kw, kw);
  }
  if (q.status) { where.push('u.status = ?'); args.push(q.status); }
  if (q.from) { where.push('u.created_at >= ?'); args.push(String(q.from) + ' 00:00:00'); }
  if (q.to) { where.push('u.created_at <= ?'); args.push(String(q.to) + ' 23:59:59'); }
  const order = q.sort === 'old' ? 'u.id ASC' : 'u.id DESC';
  const rows = db.prepare(`
    SELECT u.id,u.email,u.name,u.phone,u.wechat,u.status,u.created_at,
           v.id AS vendor_id, v.status AS vendor_status, v.name_zh AS vendor_name,
           (SELECT COUNT(*) FROM posts WHERE user_id=u.id) AS post_count,
           (SELECT COUNT(*) FROM posts WHERE user_id=u.id AND status='approved') AS live_count
    FROM users u LEFT JOIN vendors v ON v.user_id = u.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${order} LIMIT 500`).all(...args);
  res.json(rows);
});
/* 用户详情:资料 + 入驻状态 + 全部发布记录 */
app.get('/api/admin/users/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT id,email,name,phone,wechat,status,created_at FROM users WHERE id=?').get(id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const v = db.prepare('SELECT * FROM vendors WHERE user_id=?').get(id) || null;
  const posts = db.prepare('SELECT * FROM posts WHERE user_id=? ORDER BY id DESC').all(id).map(parsePost);
  const enquiries = v ? db.prepare('SELECT COUNT(*) c FROM enquiries WHERE vendor_id=?').get(v.id).c : 0;
  const sessionsN = db.prepare("SELECT COUNT(*) c FROM sessions WHERE kind='user' AND ref_id=? AND expires > ?").get(id, Date.now()).c;
  res.json({ ...u, vendor: v, posts, enquiry_count: enquiries, active_sessions: sessionsN });
});
/* 封禁 / 解封:封禁立即踢下线,公开内容自动下架(可见性联动),解封自动恢复 */
app.put('/api/admin/users/:id', requireAuth, (req, res) => {
  const status = req.body && req.body.status;
  if (!['active', 'banned'].includes(status)) return res.status(400).json({ error: '无效状态' });
  const id = Number(req.params.id);
  const u = db.prepare('SELECT email,status FROM users WHERE id=?').get(id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  db.prepare('UPDATE users SET status=? WHERE id=?').run(status, id);
  if (status === 'banned') {
    kickUser(id); // 立即踢下线
    alog(req, 'ban', 'user', id, u.email, '封禁账号:已踢下线,其公开内容与入驻主页自动下架');
  } else {
    alog(req, 'unban', 'user', id, u.email, '解封账号:公开内容与主页自动恢复');
  }
  res.json({ ok: true });
});
/* 重置密码:不传 new_password 则自动生成并返回(仅显示一次) */
app.put('/api/admin/users/:id/reset-password', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT email FROM users WHERE id=?').get(id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  let pw = String((req.body && req.body.new_password) || '').trim();
  if (pw && pw.length < 6) return res.status(400).json({ error: '新密码至少 6 位' });
  if (!pw) pw = crypto.randomBytes(5).toString('base64url').slice(0, 8) + '@1';
  const { salt, hash } = hashPassword(pw);
  db.prepare('UPDATE users SET password_hash=?, salt=? WHERE id=?').run(hash, salt, id);
  kickUser(id); // 重置后旧会话全部失效
  alog(req, 'reset_password', 'user', id, u.email, '重置密码并踢下线');
  res.json({ ok: true, password: pw });
});
/* 一键下架某用户全部内容 */
app.post('/api/admin/users/:id/offline-posts', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT email FROM users WHERE id=?').get(id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const info = db.prepare("UPDATE posts SET status='offline' WHERE user_id=? AND status IN ('approved','pending')").run(id);
  alog(req, 'offline_posts', 'user', id, u.email, `一键下架其全部内容,共 ${info.changes} 条`);
  res.json({ ok: true, count: info.changes });
});
/* 注销账号:级联删除发布 / 入驻主页 / 会话 / 通知 */
app.delete('/api/admin/users/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT email FROM users WHERE id=?').get(id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const nPosts = db.prepare('DELETE FROM posts WHERE user_id=?').run(id).changes;
  const nVendor = db.prepare('DELETE FROM vendors WHERE user_id=?').run(id).changes;
  db.prepare('DELETE FROM notifications WHERE user_id=?').run(id);
  kickUser(id);
  const info = db.prepare('DELETE FROM users WHERE id=?').run(id);
  alog(req, 'delete_user', 'user', id, u.email, `注销账号:删除发布 ${nPosts} 条、入驻主页 ${nVendor} 个`);
  res.json({ ok: info.changes > 0, posts_deleted: nPosts, vendor_deleted: nVendor });
});

/* ---------- 入驻审核与管理 ---------- */
app.get('/api/admin/vendors', requireAuth, (req, res) => {
  const where = []; const args = [];
  if (req.query.status) { where.push('v.status = ?'); args.push(req.query.status); }
  const rows = db.prepare(`
    SELECT v.*, u.email AS user_email, u.name AS user_name,
           s.name_zh AS section_name, c.name_zh AS category_name
    FROM vendors v
    LEFT JOIN users u ON u.id = v.user_id
    LEFT JOIN sections s ON s.id = v.section_id
    LEFT JOIN categories c ON c.id = v.category_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY v.status='pending' DESC, v.id DESC`).all(...args);
  res.json(rows.map(r => { let ph = []; try { ph = JSON.parse(r.photos || '[]'); } catch (e) {} return { ...r, photos: ph }; }));
});
app.put('/api/admin/vendors/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const allowed = ['status', 'verified', 'featured', 'review_note', 'sort_order',
    'name_zh', 'name_en', 'section_id', 'category_id', 'tagline_zh', 'tagline_en',
    'intro_zh', 'intro_en', 'phone', 'email', 'wechat', 'website', 'logo', 'photos'];
  const data = {};
  for (const f of allowed) {
    if (!(f in b)) continue;
    let v = b[f];
    if (f === 'photos') v = JSON.stringify(Array.isArray(v) ? v : []);
    else if (['verified', 'featured', 'sort_order', 'section_id', 'category_id'].includes(f)) v = (v === '' || v == null) ? null : Number(v);
    else v = String(v ?? '');
    data[f] = v;
  }
  if (data.status && !['pending', 'approved', 'rejected', 'suspended'].includes(data.status)) {
    return res.status(400).json({ error: '无效状态' });
  }
  const keys = Object.keys(data);
  if (!keys.length) return res.status(400).json({ error: '没有可更新的字段' });
  const old = db.prepare('SELECT * FROM vendors WHERE id=?').get(Number(req.params.id));
  if (!old) return res.status(404).json({ error: '入驻方不存在' });
  if (data.status === 'approved') {
    db.prepare("UPDATE vendors SET approved_at = CASE WHEN approved_at='' THEN datetime('now','localtime') ELSE approved_at END WHERE id=?")
      .run(Number(req.params.id));
  }
  const info = db.prepare(`UPDATE vendors SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`)
    .run(...keys.map(k => data[k]), Number(req.params.id));
  /* 审核结果站内通知 */
  if (data.status && data.status !== old.status) {
    const N = {
      approved: ['入驻审核通过', 'Provider application approved', '恭喜!您的入驻申请已通过,主页已上线,可在个人中心发布服务、动态与活动。', 'Congratulations — your provider profile is now live. Publish services, updates and events from My Point.', 'me.html'],
      rejected: ['入驻申请未通过', 'Provider application declined', (data.review_note ? '原因:' + data.review_note + '。' : '') + '您可修改资料后重新提交。', (data.review_note ? 'Reason: ' + data.review_note + '. ' : '') + 'You may revise and reapply.', 'join.html'],
      suspended: ['入驻资格已暂停', 'Provider profile suspended', '您的主页与发布已暂停展示,如有疑问请联系一点。', 'Your profile and posts are temporarily hidden. Contact us for details.', 'me.html']
    }[data.status];
    if (N) notify(old.user_id, { type: 'vendor_review', title_zh: N[0], title_en: N[1], body_zh: N[2], body_en: N[3], link: N[4] });
  }
  if (data.verified === 1 && !old.verified) {
    notify(old.user_id, {
      type: 'vendor_review', title_zh: '获得「一点认证」', title_en: 'You are now Verified',
      body_zh: '官方已为您授予「✓ 一点认证」标识,它将展示在您的主页与所有发布上。',
      body_en: 'The Point has granted you the Verified badge, shown on your profile and posts.',
      link: 'me.html'
    });
  }
  /* 敏感操作留痕 */
  if (data.status && data.status !== old.status) {
    const A = { approved: 'vendor_approve', rejected: 'vendor_reject', suspended: 'vendor_suspend', pending: 'vendor_pending' };
    alog(req, A[data.status] || 'vendor_status', 'vendor', old.id, old.name_zh, data.review_note ? `原因:${data.review_note}` : '');
  }
  if ('verified' in data && data.verified !== old.verified) alog(req, data.verified ? 'vendor_verify' : 'vendor_unverify', 'vendor', old.id, old.name_zh, '');
  if ('featured' in data && data.featured !== old.featured) alog(req, data.featured ? 'vendor_feature' : 'vendor_unfeature', 'vendor', old.id, old.name_zh, '');
  res.json({ ok: info.changes > 0 });
});
app.delete('/api/admin/vendors/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT name_zh FROM vendors WHERE id=?').get(id);
  const n = db.prepare('DELETE FROM posts WHERE vendor_id=?').run(id).changes;
  const info = db.prepare('DELETE FROM vendors WHERE id=?').run(id);
  if (old) alog(req, 'delete_vendor', 'vendor', id, old.name_zh, `删除入驻方及其发布 ${n} 条`);
  res.json({ ok: info.changes > 0 });
});

/* ---------- 内容审核与官方发布 ---------- */
app.get('/api/admin/posts', requireAuth, (req, res) => {
  const where = []; const args = [];
  if (req.query.status) { where.push('p.status = ?'); args.push(req.query.status); }
  if (req.query.type) { where.push('p.type = ?'); args.push(req.query.type); }
  if (req.query.section_id) { where.push('p.section_id = ?'); args.push(Number(req.query.section_id)); }
  const rows = db.prepare(`
    SELECT p.*, u.email AS user_email, u.name AS user_name, v.name_zh AS vendor_name
    FROM posts p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN vendors v ON v.id = p.vendor_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.status='pending' DESC, p.id DESC LIMIT 500`).all(...args);
  res.json(rows.map(parsePost));
});
app.post('/api/admin/posts', requireAuth, (req, res) => {
  /* 官方发布(文化文章/视频等),默认直接过审 */
  const data = pickPostBody(req.body || {});
  if (!data.title_zh && !data.title_en) return res.status(400).json({ error: '请填写标题' });
  data.type = data.type || 'article';
  const status = req.body.status === 'pending' ? 'pending' : 'approved';
  const featured = req.body.featured ? 1 : 0;
  const keys = Object.keys(data);
  const info = db.prepare(`INSERT INTO posts (status,featured,${keys.join(',')}) VALUES (?,?,${keys.map(() => '?').join(',')})`)
    .run(status, featured, ...keys.map(k => data[k]));
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.put('/api/admin/posts/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const data = pickPostBody(b);
  if ('status' in b) {
    if (!['pending', 'approved', 'rejected', 'offline'].includes(b.status)) return res.status(400).json({ error: '无效状态' });
    data.status = b.status;
  }
  if ('featured' in b) data.featured = b.featured ? 1 : 0;
  if ('review_note' in b) data.review_note = String(b.review_note || '');
  if ('published_at' in b) data.published_at = String(b.published_at || '');
  const keys = Object.keys(data);
  if (!keys.length) return res.status(400).json({ error: '没有可更新的字段' });
  const old = db.prepare('SELECT * FROM posts WHERE id=?').get(Number(req.params.id));
  if (!old) return res.status(404).json({ error: '内容不存在' });
  const info = db.prepare(`UPDATE posts SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`)
    .run(...keys.map(k => data[k]), Number(req.params.id));
  /* 审核结果站内通知(官方内容 user_id 为空,自动跳过) */
  if (data.status && data.status !== old.status && old.user_id) {
    const t = old.title_zh || old.title_en || '';
    const N = {
      approved: [`「${t}」已发布`, `“${old.title_en || t}” is live`, '您的内容已通过审核,现已在前台展示。', 'Your post passed review and is now public.', `post.html?id=${old.id}`],
      rejected: [`「${t}」未通过审核`, `“${old.title_en || t}” was declined`, (data.review_note ? '原因:' + data.review_note + '。' : '') + '可在个人中心修改后重新提交。', (data.review_note ? 'Reason: ' + data.review_note + '. ' : '') + 'Edit and resubmit from My Point.', 'me.html'],
      offline: [`「${t}」已下架`, `“${old.title_en || t}” taken offline`, '该内容已被官方下架,如有疑问请联系一点。', 'This post has been taken offline by The Point.', 'me.html']
    }[data.status];
    if (N) notify(old.user_id, { type: 'post_review', title_zh: N[0], title_en: N[1], body_zh: N[2], body_en: N[3], link: N[4] });
  }
  if (data.status && data.status !== old.status) {
    const A = { approved: 'post_approve', rejected: 'post_reject', offline: 'post_offline', pending: 'post_pending' };
    alog(req, A[data.status] || 'post_status', 'post', old.id, old.title_zh || old.title_en, data.review_note ? `原因:${data.review_note}` : '');
  }
  res.json({ ok: info.changes > 0 });
});
app.delete('/api/admin/posts/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT title_zh,title_en FROM posts WHERE id=?').get(id);
  const info = db.prepare('DELETE FROM posts WHERE id=?').run(id);
  if (old) alog(req, 'delete_post', 'post', id, old.title_zh || old.title_en, '');
  res.json({ ok: info.changes > 0 });
});

/* ---------- 操作日志查询 ---------- */
app.get('/api/admin/logs', requireAuth, (req, res) => {
  const where = []; const args = [];
  if (req.query.q) {
    where.push('(target_label LIKE ? OR detail LIKE ? OR admin LIKE ?)');
    const kw = `%${String(req.query.q).slice(0, 80)}%`;
    args.push(kw, kw, kw);
  }
  if (req.query.action) { where.push('action = ?'); args.push(req.query.action); }
  const rows = db.prepare(`SELECT * FROM admin_logs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 300`).all(...args);
  res.json(rows);
});

/* ---------- 站点设置(SMTP 邮件通知配置等) ---------- */
const SETTING_KEYS = ['site_url', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'notify_email_enabled'];
app.get('/api/admin/settings', requireAuth, (req, res) => {
  const out = {};
  SETTING_KEYS.forEach(k => out[k] = getSetting(k));
  res.json(out);
});
app.put('/api/admin/settings', requireAuth, (req, res) => {
  const b = req.body || {};
  SETTING_KEYS.forEach(k => { if (k in b) setSetting(k, String(b[k] ?? '').slice(0, 500)); });
  res.json({ ok: true });
});

/* 后台统计 */
app.get('/api/admin/stats', requireAuth, (req, res) => {
  const c = t => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  res.json({
    properties: c('properties'), agents: c('agents'), news: c('news'), partners: c('partners'),
    services: c('services'), enquiries: c('enquiries'),
    videos: c('videos'), schools: c('schools'),
    subscribers: db.prepare("SELECT COUNT(*) c FROM subscribers WHERE status='active'").get().c,
    users: c('users'), vendors: c('vendors'), posts: c('posts'),
    unread: db.prepare('SELECT COUNT(*) c FROM enquiries WHERE is_read=0').get().c,
    vendors_pending: db.prepare("SELECT COUNT(*) c FROM vendors WHERE status='pending'").get().c,
    posts_pending: db.prepare("SELECT COUNT(*) c FROM posts WHERE status='pending'").get().c
  });
});

/* ---------------- SEO: sitemap.xml / robots.txt ---------------- */
function siteBase(req) {
  return (getSetting('site_url') || `http://${req.headers.host || 'localhost:' + PORT}`).replace(/\/$/, '');
}
app.get('/sitemap.xml', (req, res) => {
  const base = siteBase(req);
  const urls = [];
  const add = (loc, priority) => urls.push(`<url><loc>${base}/${loc}</loc><priority>${priority}</priority></url>`);
  add('', '1.0');
  ['properties.html', 'experts.html', 'news.html', 'partners.html', 'services.html', 'join.html'].forEach(p => add(p, '0.8'));
  db.prepare('SELECT slug FROM sections WHERE visible=1').all().forEach(s =>
    add(s.slug === 'property' ? 'properties.html' : `section.html?s=${s.slug}`, '0.8'));
  db.prepare("SELECT id FROM properties WHERE status != '下架'").all().forEach(r => add(`property.html?id=${r.id}`, '0.7'));
  db.prepare(`SELECT p.id FROM posts p LEFT JOIN vendors v ON v.id=p.vendor_id
    WHERE p.status='approved' AND (p.vendor_id IS NULL OR v.status='approved')`).all().forEach(r => add(`post.html?id=${r.id}`, '0.6'));
  db.prepare("SELECT id FROM vendors WHERE status='approved'").all().forEach(r => add(`vendor.html?id=${r.id}`, '0.7'));
  db.prepare('SELECT id FROM news WHERE visible=1').all().forEach(r => add(`article.html?id=${r.id}`, '0.6'));
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
});
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nSitemap: ${siteBase(req)}/sitemap.xml\n`);
});

/* ---------------- 静态文件(带缓存策略) ---------------- */
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.use(express.static(ROOT, {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (/\.(css|js|svg|jpe?g|png|webp|gif|avif|woff2?)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800'); // 静态资源 7 天
    } else {
      res.setHeader('Cache-Control', 'no-cache'); // HTML 协商缓存,发版即生效
    }
  }
}));

/* 404:HTML 请求给美化页,API 给 JSON */
app.use((req, res) => {
  if ((req.headers.accept || '').includes('text/html')) {
    return res.status(404).sendFile(path.join(ROOT, '404.html'));
  }
  res.status(404).json({ error: 'Not Found' });
});

app.listen(PORT, () => {
  console.log(`THE POINT 一点 已启动: http://localhost:${PORT}`);
  console.log(`管理后台: http://localhost:${PORT}/admin/`);
});
