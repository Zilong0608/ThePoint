'use strict';
// Test fixtures only. Never loaded by the application or production startup.
const crypto=require('node:crypto');
const {hashPassword}=require('../../src/security/passwords');
module.exports=function seedTestSamples(db){
function seed() {
  if (db.prepare('SELECT COUNT(*) c FROM admins').get().c === 0) {
    const initialPassword=process.env.ADMIN_INITIAL_PASSWORD||'thepoint2026';
    if(process.env.NODE_ENV==='production'&&(!process.env.ADMIN_INITIAL_PASSWORD||initialPassword.length<12))throw new Error('生产环境首次启动必须配置至少 12 位 ADMIN_INITIAL_PASSWORD');
    const { salt, hash } = hashPassword(initialPassword);
    db.prepare('INSERT INTO admins (username,password_hash,salt) VALUES (?,?,?)').run('admin', hash, salt);
    console.log('已创建管理员 admin，请使用配置的初始密码登录并及时修改');
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


};
