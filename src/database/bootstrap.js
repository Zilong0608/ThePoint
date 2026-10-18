'use strict';
const {hashPassword}=require('../security/passwords');

module.exports=function initializeBaseline(db){
function seed() {
  if (db.prepare('SELECT COUNT(*) c FROM admins').get().c === 0) {
    const initialPassword=process.env.ADMIN_INITIAL_PASSWORD||'thepoint2026';
    if(process.env.NODE_ENV==='production'&&(!process.env.ADMIN_INITIAL_PASSWORD||initialPassword.length<12))throw new Error('生产环境首次启动必须配置至少 12 位 ADMIN_INITIAL_PASSWORD');
    const { salt, hash } = hashPassword(initialPassword);
    db.prepare('INSERT INTO admins (username,password_hash,salt) VALUES (?,?,?)').run('admin', hash, salt);
    console.log('已创建管理员 admin，请使用配置的初始密码登录并及时修改');
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
    console.log('已创建 9 大板块及初始分类');
  }
}
seed();
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
}

};
