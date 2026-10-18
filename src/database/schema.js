'use strict';
const {due}=require('../domain/publication');

module.exports=function initializeSchema(db){
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
CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires INTEGER NOT NULL,              -- 毫秒时间戳
  used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
/* ============ 广告位 ============ */
CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER,                     -- 广告主(入驻方);留空 = 官方直投
  title_zh TEXT DEFAULT '',
  title_en TEXT DEFAULT '',
  image TEXT DEFAULT '',                 -- 广告图(小窗口素材)
  target_url TEXT DEFAULT '',            -- 落地页:客户自己的网站,或站内页面
  placement TEXT DEFAULT 'home_side',    -- 位置:home_side/home_flow/news_side/section_top/property_side
  start_at TEXT DEFAULT '',              -- 上线日期 YYYY-MM-DD,空 = 即刻
  end_at TEXT DEFAULT '',                -- 下线日期 YYYY-MM-DD,空 = 不限
  status TEXT DEFAULT 'pending',         -- pending / approved / rejected / paused
  sort_order INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,         -- 曝光数
  clicks INTEGER DEFAULT 0,              -- 点击数
  review_note TEXT DEFAULT '',
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
CREATE INDEX IF NOT EXISTS idx_ads_live ON ads(status, placement, sort_order);
`);

/* ---------------- 轻量迁移(老库自动补新字段) ---------------- */
db.exec(`CREATE TABLE IF NOT EXISTS media_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT UNIQUE NOT NULL, original_name TEXT DEFAULT '',
  mime TEXT NOT NULL, size INTEGER NOT NULL, owner_kind TEXT NOT NULL, owner_id INTEGER,
  alt TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS editorial_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, ref_id INTEGER,
  admin_id INTEGER NOT NULL, payload TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS vendor_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, vendor_id INTEGER NOT NULL,
  payload TEXT NOT NULL, base_payload TEXT NOT NULL, status TEXT DEFAULT 'pending',
  review_note TEXT DEFAULT '', reviewed_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')), reviewed_at TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vendor_revisions ON vendor_revisions(vendor_id,status,id);
CREATE TABLE IF NOT EXISTS enquiry_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, enquiry_id INTEGER NOT NULL,
  author TEXT NOT NULL, body TEXT DEFAULT '', detail TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_enquiry_notes ON enquiry_notes(enquiry_id,id);`);
db.exec(`CREATE TABLE IF NOT EXISTS property_favorites (user_id INTEGER NOT NULL, property_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,property_id))`);
db.exec(`CREATE TABLE IF NOT EXISTS content_versions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, ref_id INTEGER NOT NULL,
 payload TEXT NOT NULL, author TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS post_revisions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, payload TEXT NOT NULL,
 base_payload TEXT NOT NULL,status TEXT DEFAULT 'pending',review_note TEXT DEFAULT '',
 created_at TEXT DEFAULT (datetime('now','localtime')),reviewed_at TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_post_revisions ON post_revisions(post_id,status,id);
CREATE INDEX IF NOT EXISTS idx_content_versions ON content_versions(kind,ref_id,id);`);
{
  const addCol = (table, col, def) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  };
  addCol('properties', 'tour_url', "TEXT DEFAULT ''");
  addCol('properties', 'latitude', 'REAL');
  addCol('properties', 'longitude', 'REAL');
  /* 双语字段 */
  addCol('properties', 'title_en', "TEXT DEFAULT ''");
  addCol('properties', 'description_en', "TEXT DEFAULT ''");
  addCol('news', 'title_en', "TEXT DEFAULT ''");
  addCol('news', 'source_note_en', "TEXT DEFAULT ''");
  addCol('news', 'excerpt_en', "TEXT DEFAULT ''");
  addCol('news', 'content_en', "TEXT DEFAULT ''");
  addCol('agents', 'bio_en', "TEXT DEFAULT ''");
  addCol('services', 'tagline_en', "TEXT DEFAULT ''");
  addCol('services', 'description_en', "TEXT DEFAULT ''");
  addCol('enquiries', 'vendor_id', 'INTEGER');
  /* 角色分层:经纪人 / 商家伙伴 / 工种服务 —— 三类主体统一走 vendors */
  addCol('vendors', 'role', "TEXT DEFAULT 'associate'");
  /* 线索来源归因(为 Meta / 广告位回流预留) */
  addCol('enquiries', 'ad_id', 'INTEGER');
  addCol('enquiries', 'source', "TEXT DEFAULT ''");
  addCol('enquiries', 'utm', "TEXT DEFAULT ''");            /* JSON: utm_source/medium/campaign… */
  addCol('enquiries', 'landing', "TEXT DEFAULT ''");        /* 首次落地页 */
  addCol('ads', 'leads', 'INTEGER DEFAULT 0');               /* 该广告带来的线索数 */
  for (const table of ['news', 'posts']) {
    addCol(table, 'content_format', "TEXT DEFAULT 'plain'");
    addCol(table,'scheduled_at',"TEXT DEFAULT ''");
  }
  addCol('properties','listing_kind',"TEXT DEFAULT 'sale'");
  addCol('properties','rent_period',"TEXT DEFAULT 'week'");
  addCol('properties','available_from',"TEXT DEFAULT ''");
  addCol('properties','bond','REAL');
  addCol('properties','floorplans',"TEXT DEFAULT '[]'");
  addCol('properties','updated_at',"TEXT DEFAULT ''");
  addCol('enquiries','viewing_at',"TEXT DEFAULT ''");
  addCol('enquiries','lead_status',"TEXT DEFAULT 'new'");
  addCol('enquiries','assignee_id','INTEGER');
  addCol('enquiries','followup_version','INTEGER DEFAULT 0');
  addCol('enquiries','followup_updated_at',"TEXT DEFAULT ''");
  addCol('admins','role',"TEXT DEFAULT 'admin'");
  addCol('admins','status',"TEXT DEFAULT 'active'");
  db.exec("UPDATE properties SET updated_at=created_at WHERE updated_at='' OR updated_at IS NULL");
}

db.exec(`CREATE VIEW IF NOT EXISTS public_news AS SELECT * FROM news WHERE ${due()};
CREATE VIEW IF NOT EXISTS public_posts AS SELECT * FROM posts WHERE ${due()};`);


};
