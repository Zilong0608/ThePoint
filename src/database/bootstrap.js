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
  /* 「工种服务」第十板块(姑姑要的洗窗 / water blasting / builder,老库一次性补入) */
  if (!db.prepare("SELECT id FROM sections WHERE slug='trades'").get()) {
    const info = db.prepare(`INSERT INTO sections (slug,name_zh,name_en,tagline_zh,tagline_en,sort_order)
      VALUES ('trades','工种服务','Trades','洗窗、清洗、建筑装修,找靠谱师傅','Window cleaning, water blasting, builders',
      (SELECT COALESCE(MAX(sort_order),0)+1 FROM sections))`).run();
    const insCat = db.prepare('INSERT INTO categories (section_id,name_zh,name_en,sort_order) VALUES (?,?,?,?)');
    [['洗窗', 'Window Cleaning'], ['高压清洗', 'Water Blasting'], ['建筑施工', 'Builders'],
     ['水电', 'Plumbing & Electrical'], ['屋顶', 'Roofing'], ['油漆', 'Painting'], ['园艺绿化', 'Landscaping']]
      .forEach((c, i) => insCat.run(info.lastInsertRowid, c[0], c[1], i + 1));
    console.log('板块新增:「工种服务」及 7 个分类');
  }
  /* 板块排序:资讯与集市/同城同组(幂等) */
  const ORDER = { property: 1, advisory: 2, education: 3, living: 4, market: 5, local: 6, news: 7, career: 8, culture: 9, trades: 10 };
  Object.entries(ORDER).forEach(([slug, n]) =>
    db.prepare('UPDATE sections SET sort_order=? WHERE slug=?').run(n, slug));
}

/* ---------- 首批真实内容:MARS 专家、在售房源、合作伙伴 ----------
   配图都在 public/media/ 里随代码一起发布,不依赖持久化磁盘,所以这里只补数据库记录。

   每张表「只在为空时」写入。这一点是刻意的:后台把某条删掉或改过之后,
   下次部署不会再把它塞回来 —— 按条去「有则跳过」会让删除永远删不干净。 */
{
  if (db.prepare('SELECT COUNT(*) c FROM agents').get().c === 0) {
    const AGENTS = [
      /* name, category, email, phone, photo, bio, visible */
      ['Celia Wang', '地产', 'celia.wang@marsrealty.co.nz', '027 363 9990', 'media/agent-celia.jpg', '深耕奥克兰高端住宅市场多年,以专业与审慎陪伴每一位客户。', 1],
      ['Rod Macfarlane', '地产', 'rodmac006@gmail.com', '021 755 588', 'media/agent-rod.jpg', '', 1],
      ['Asli Can', '地产', 'asli@marsrealty.co.nz', '027 366 7776', 'media/agent-asli.jpg', '', 1],
      ['Nik Butler', '地产', '', '022 460 5080', 'media/agent-nik.jpg', '', 1],
      /* 名字还没拿到,先隐藏:正式站上挂一个「姓名待补充」不好看。
         后台「专家管理」补好姓名后把「显示」打开即可。 */
      ['金融顾问(姓名待补充)', '金融', '', '021 796 865', 'media/agent-finance.jpg', '', 0],
      ['Ben Zhao', '租务', '', '027 466 2399', 'media/agent-ben.jpg', '', 1]
    ];
    const insA = db.prepare('INSERT INTO agents (name,category,email,phone,photo,bio,visible,sort_order) VALUES (?,?,?,?,?,?,?,?)');
    AGENTS.forEach((a, i) => insA.run(a[0], a[1], a[2], a[3], a[4], a[5], a[6], i + 1));
    console.log(`已写入 ${AGENTS.length} 位专家(其中「金融顾问」待补姓名,暂设为不显示)`);
  }

  if (db.prepare('SELECT COUNT(*) c FROM partners').get().c === 0) {
    const PARTNERS = [
      ['Crimson', ''], ['Portal Studio', ''], ['K3 Consulting Accounting Legal', ''],
      ['Hilton Queenstown Resort & Spa', ''], ['Cato Bolam', ''], ['open2view.com', ''],
      ['Archiland 奥克兰建筑设计院', ''], ['AEQ Furniture 美惠优家俱城', ''], ['Whitlock Williams', ''],
      ['Pinehill Homes Ltd', ''], ['NZ International Trust & Investment Co. Ltd', ''],
      ['Mars Realty', 'https://www.marsrealty.co.nz/rent']
    ];
    const insP = db.prepare('INSERT INTO partners (name,logo,url,sort_order,visible) VALUES (?,?,?,?,1)');
    PARTNERS.forEach((p, i) => insP.run(p[0], `media/partner-${i + 1}.jpg`, p[1], i + 1));
    console.log(`已写入 ${PARTNERS.length} 家合作伙伴`);
  }

  if (db.prepare('SELECT COUNT(*) c FROM properties').get().c === 0) {
    /* 按姓名找专家,找不到就留空 —— 不能假设专家 id 一定是 1、2 */
    const agentId = name => (db.prepare('SELECT id FROM agents WHERE name=?').get(name) || {}).id || null;
    const PROPS = [
      { title: 'Albany 精品公寓', address: '104, 22 Library Lane, Albany', suburb: 'Albany', type: '公寓 / Apartment',
        price_label: '价格待询', beds: 1, baths: 1, garages: 1, land_area: '',
        description: '位于 Albany 核心地段的精品公寓,近商圈、学校与公共交通,自住投资皆宜。',
        image: 'media/prop-albany-1.jpg', agent: 'Celia Wang', featured: 1, lat: -36.7268837, lng: 174.6964785 },
      { title: 'Albany 双拼地块', address: '20 & 22 Waihou Crescent, Albany', suburb: 'Albany', type: '地产 / Land',
        price_label: '价格待询', beds: null, baths: null, garages: null, land_area: '192m²',
        description: '双临街地块,发展潜力可观,详情欢迎垂询一点专家。',
        image: 'media/prop-albany-2.jpg', agent: 'Rod Macfarlane', featured: 0, lat: -36.71873265, lng: 174.7018754 },
      { title: 'Dairy Flat 庄园别墅', address: '65 Lascelles Drive, Dairy Flat', suburb: 'Dairy Flat', type: '别墅 / House',
        price_label: '价格待询', beds: 4, baths: 3, garages: 3, land_area: '3.5ha',
        description: '约 3.5 公顷私家庄园,四房三卫,静谧从容,尽享乡野与城市的平衡。',
        image: 'media/prop-dairyflat.jpg', agent: 'Celia Wang', featured: 1, lat: -36.648685, lng: 174.647059 }
    ];
    const insProp = db.prepare(`INSERT INTO properties
      (title,address,suburb,city,type,status,listing_kind,rent_period,price_label,beds,baths,garages,land_area,
       description,images,floorplans,agent_id,featured,latitude,longitude)
      VALUES (?,?,?,'Auckland',?,'在售','sale','week',?,?,?,?,?,?,?,'[]',?,?,?,?)`);
    for (const p of PROPS) {
      insProp.run(p.title, p.address, p.suburb, p.type, p.price_label, p.beds, p.baths, p.garages, p.land_area,
        p.description, JSON.stringify([p.image]), agentId(p.agent), p.featured, p.lat, p.lng);
    }
    /* 房源带进来的地区要补进地区列表,否则筛选里挑不到 */
    db.prepare(`INSERT OR IGNORE INTO suburbs (name, sort_order)
      SELECT DISTINCT suburb, 999 FROM properties WHERE suburb != ''`).run();
    console.log(`已写入 ${PROPS.length} 套在售房源`);
  }
}

};
