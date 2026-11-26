/* ============================================================
   管理后台 中 / EN 切换
   后台的文案是直接写在模板里的(1000 多处),逐句改成 t() 调用既巨大又容易漏。
   这里改用「渲染后翻译」:后台每次用 innerHTML 重绘,MutationObserver 捕捉到之后,
   把文本节点按词典整条替换。只做「整条精确匹配」,不做子串替换 ——
   否则房源标题里出现「状态」两个字也会被改掉。
   语言沿用前台同一个 localStorage 键 tp_lang,两边切换保持一致。
   ============================================================ */
(function (root) {
  'use strict';

  const KEY = 'tp_lang';
  const read = () => { try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'zh'; } catch (e) { return 'zh'; } };
  let lang = read();

  /* 词典:中文原文 → English。只收界面文字,不碰数据内容。 */
  const DICT = {
    /* --- 登录 --- */
    '管理后台': 'Admin', '账号': 'Username', '密码': 'Password', '登 录': 'Sign in', '登录': 'Sign in',
    '主界面': 'Main', '退出登录': 'Sign out', '修改我的密码': 'Change my password', '查看网站 →': 'View site →',

    /* --- 左侧菜单 --- */
    '概览': 'Dashboard', '房源管理': 'Properties', '专家管理': 'Experts', '专家账号': 'Expert accounts',
    '资讯管理': 'Journal', '文章草稿': 'Drafts', '媒体库': 'Media', '视频管理': 'Videos',
    '学校信息': 'Schools', '伙伴管理': 'Partners', '服务名录': 'Services', '用户管理': 'Users',
    '入驻审核': 'Provider review', '内容审核': 'Content review', '广告管理': 'Advertisements',
    '板块管理': 'Sections', '分类管理': 'Categories', '地区管理': 'Suburbs', '订阅邮箱': 'Subscribers',
    '投资者名录': 'Investors', '客户留言': 'Enquiries', '客户跟进': 'Enquiries', '操作日志': 'Audit log',
    'Council 规划文件': 'Council documents', '设置': 'Settings', '后台员工': 'Staff',

    /* --- 通用按钮 --- */
    '取消': 'Cancel', '保存': 'Save', '编辑': 'Edit', '删除': 'Delete', '重试': 'Retry',
    '筛选': 'Filter', '重置': 'Reset', '查找': 'Search', '搜索': 'Search', '查询': 'Query',
    '详情': 'Details', '备注': 'Note', '关闭': 'Close', '通过': 'Approve', '驳回': 'Decline',
    '下架': 'Unpublish', '暂停': 'Pause', '解绑': 'Unlink', '绑定账号': 'Link account',
    '换绑账号': 'Change account', '通过并上线': 'Approve & publish', '恢复投放': 'Resume',
    '恢复有效': 'Reactivate', '标为退订': 'Mark unsubscribed', '标为已读': 'Mark read',
    '+ 新建广告': '+ New advertisement', '+ 官方发布': '+ Official post',
    '← 回专家管理': '← Back to experts', '全部': 'All',

    /* --- 用户管理 --- */
    '重置密码': 'Reset password', '封禁': 'Ban', '解封': 'Unban', '注销': 'Delete account',
    '下架其内容': 'Unpublish their content', '去内容审核管理其内容': 'Manage their content',
    '取消资格': 'Revoke', '编辑资料': 'Edit profile', '保存并重新登录': 'Save & sign in again',
    '保存新密码': 'Save new password',

    /* --- 表头 --- */
    '图片': 'Image', '标题 / 地址': 'Title / Address', '区域': 'Area', '价格': 'Price',
    '状态': 'Status', '负责专家': 'Agent', '照片': 'Photo', '姓名': 'Name', '类别': 'Category',
    '联系方式': 'Contact', '排序': 'Order', '标题': 'Title', '发布时间': 'Published',
    '名称': 'Name', '官网': 'Website', '商户 / 简介': 'Business / Intro', '年费有效期': 'Membership',
    '封面': 'Cover', '标题 / 视频ID': 'Title / Video ID', '分类': 'Category', '置顶': 'Pinned',
    '校名': 'School', '类型': 'Type', '地区': 'Suburb', '评级': 'Decile', '地区名称': 'Suburb',
    '板块': 'Section', '标语': 'Tagline', '所属板块': 'Parent section',

    /* --- 状态标签 --- */
    '待审核': 'Pending', '已入驻': 'Approved', '已驳回': 'Declined', '已暂停': 'Suspended',
    '已发布': 'Published', '投放中': 'Live', '已退订': 'Unsubscribed', '有效': 'Active',
    '显示': 'Visible', '隐藏': 'Hidden', '在售': 'For sale', '已售': 'Sold',
    '在租': 'For rent', '已租': 'Rented', '审核中': 'In review', '有待审修改': 'Pending edits',
    '未绑定账号': 'No account linked', '不在投放期': 'Outside schedule', '官方直投': 'Official',

    /* --- 页面标题 --- */
    '专家账号与资料审核': 'Expert accounts & profile review',
    '数据导出 / 备份': 'Export & backup',

    /* --- 投资者 --- */
    '全部类型': 'All types', '全部预算': 'All budgets', '全部状态': 'All statuses',
    '收租房': 'Rental property', '土地': 'Land', '开发项目': 'Development project',
    '找匹配的投资者': 'Find matching investors', '导出名单 CSV': 'Export CSV',
    '搜姓名 / 邮箱 / 电话': 'Search name / email / phone',

    /* --- 线索入口 --- */
    '预约洽谈': 'Consultation request', '专家留言': 'Message to an expert',
    '房源咨询': 'Property enquiry', '订阅': 'Subscription',
    '商户入驻申请': 'Provider application', '入驻方留言': 'Message to a provider',

    /* --- 客户来意 --- */
    '全部来意': 'All request types',
    '咨询问题': 'Ask a question', '预约看房': 'Request a viewing',
    '索取资料': 'Request an info pack', '要求回电': 'Call-back request',

    /* --- 角色 --- */
    '地产经纪': 'Agent', '商家伙伴': 'Business associate', '工种服务': 'Trade',

    /* --- 常见提示 --- */
    '加载中…': 'Loading…', '暂无记录。': 'No records.', '暂无留言。': 'No enquiries.',
    '暂无广告。': 'No advertisements.', '这个页面没能加载': 'This page failed to load',
    '已保存': 'Saved', '设置已保存': 'Settings saved',

    /* --- 第三轮:各页说明长句 --- */
    "给经纪人绑定登录账号后,他本人就能在个人中心维护自己的资料;改动需在这里审核通过才会更新到网站。": "Link a login to an expert and they can maintain their own profile from My Point. Their edits appear on the site only after you approve them here.",
    "自动保存的私人草稿；修改已发布文章时，线上版本保持不变。草稿最多显示最近 200 条。": "Private auto-saved drafts. Editing a published article leaves the live version untouched. The latest 200 drafts are shown.",
    "还没有草稿。到「资讯管理」或「内容审核」创建文章即可。": "No drafts yet — create an article from Journal or Content review.",
    "复用文章与房源图片；修改图片说明不会改动已插入文章的图注。": "Reuse article and property images. Editing a caption here does not change captions already placed in articles.",
    "封禁 = 立即踢下线 + 无法登录 + 其公开内容与入驻主页自动下架(解封自动恢复);注销 = 连带删除其发布与主页。": "Ban = signed out immediately, cannot log in, and their public content and provider page are hidden (restored on unban). Delete = their posts and provider page are removed too.",
    "入驻申请与资料修改分别审核；已上线主页在资料审核期间继续展示原版本。": "Applications and profile edits are reviewed separately. A live provider page keeps showing its current version while an edit is in review.",
    "用户与入驻方发布的一切公开内容,须审核通过后才在前台展示;也可在此发布官方内容(文化文章 / 视频等)。": "Everything users and providers publish needs approval before it appears on the site. You can also publish official content (articles, videos) here.",
    "入驻方自助投放的广告需审核后上线;官方可直接新建并立即投放。曝光与点击自动统计。": "Ads submitted by providers need approval before going live; official ads publish immediately. Impressions and clicks are counted automatically.",
    "前台订阅表单收集的邮箱。可导出 CSV 用于群发邮件(Excel 可直接打开)。": "Emails collected by the public subscribe form. Export as CSV for mailing (opens directly in Excel).",
    "投资者在前台登记的类型与预算。上新房源时可用「找匹配的投资者」一键筛出该价位的意向客户。": "Investment types and budgets registered on the public site. When a new listing goes up, use “Find matching investors” to pull everyone whose budget covers that price.",
    "输入一套房源的价格,筛出预算涵盖这个价位的人 —— 这就是发匹配通知前要的名单。": "Enter a listing price to find everyone whose budget covers it — this is the list you need before sending a match alert.",
    "还没有投资者登记。前台入口:/investors.html": "No investors registered yet. Public form: /investors.html",
    "跟踪留言和预约，分配现有管理员，保存内部备注与处理记录。状态和备注不会公开给访客。": "Track enquiries and viewings, assign an owner, and keep internal notes. Status and notes are never shown to visitors.",
    "管理员敏感操作留痕:谁、何时、对谁、做了什么(最近 300 条)。": "An audit trail of sensitive admin actions — who, when, on whom, what (latest 300).",
    "核对官方原文、日期和范围后再公开。范围矩形只是检索范围；可导入经核实的多边形，提高范围匹配精度。本站不会凭地区名称推定文件适用。": "Check the official source, date and coverage before publishing. The bounding box is only a search range; import a verified polygon for accurate matching. This site never infers applicability from a suburb name.",
    "多边形必须采用全球经纬度坐标，不能直接使用新西兰平面投影坐标；范围框会由服务器计算。导入数据也必须经过人工核实。": "Polygons must use global latitude/longitude, not NZ projected coordinates; the bounding box is computed server-side. Imported data still needs manual verification.",
    "尚未收录物业范围匹配文件。区域参考资料在前台单独展示。": "No coverage-matched documents yet. Area references are shown separately on the public site.",
    "完整备份包括数据库及 uploads 图片，默认每天自动执行一次。备份仍需另存到其他设备或存储服务。": "A full backup covers the database and uploaded images, and runs once a day by default. Still keep a copy on another device or service.",
    "建议定期下载完整备份并妥存。备份文件即完整数据库,可直接恢复使用。": "Download a full backup regularly and store it safely. The file is a complete database and can be restored directly.",
    "管理员管理账号和系统；编辑维护内容；审核处理内容及商家审核；客服处理客户跟进。停用、改角色或重置密码会立即撤销该账号的登录。": "Administrators manage accounts and the system; Editors maintain content; Reviewers handle content and provider approvals; Support handles enquiry follow-up. Disabling, changing a role or resetting a password signs that account out immediately.",
    "站点 URL(如 https://thepoint.co.nz)": "Site URL (e.g. https://thepoint.co.nz)",
    "站点 URL 用于 sitemap 与分享链接。SMTP 填好并保存后,可点下方「发送测试」验证;开启邮件通知后,审核结果等站内通知会同时发一封邮件(站内通知始终生效)。": "The site URL is used for the sitemap and share links. Once SMTP is saved, use “Send test” below to verify it; with email notifications on, review results are also sent by email (on-site notices always work).",
    "欢迎回来。": "Welcome back.",

    /* --- 第二轮:逐页扫描漏译后补齐 --- */
    "当前:admin": "Signed in: admin",
    "欢迎回来。": "Welcome back.",
    "操作": "Actions",
    "共": "Total",
    "条": "items",
    "时间": "Time",
    "注册用户": "Users",
    "入驻方": "Providers",
    "待审入驻": "Pending providers",
    "平台内容": "Posts",
    "待审内容": "Pending posts",
    "广告位": "Advertisements",
    "待审广告": "Pending ads",
    "投资者": "Investors",
    "在库房源": "Properties",
    "专家": "Experts",
    "资讯文章": "Articles",
    "学校": "Schools",
    "合作伙伴": "Partners",
    "服务商户": "Service providers",
    "未读留言": "Unread enquiries",
    "+ 新增房源": "+ New property",
    "+ 新增专家": "+ New expert",
    "+ 新增文章": "+ New article",
    "+ 新增视频": "+ New video",
    "+ 新增学校": "+ New school",
    "+ 新增伙伴": "+ New partner",
    "+ 新增商户": "+ New business",
    "+ 新增板块": "+ New section",
    "+ 新增分类": "+ New category",
    "+ 新增地区": "+ New suburb",
    "上传图片": "Upload image",
    "复制地址": "Copy URL",
    "保存说明": "Save caption",
    "图片说明 / 搜索关键词": "Caption / keyword",
    "搜索文件名或图片说明": "Search file name or caption",
    "暂无数据,点击右上角新增。": "No records yet — use the button above to add one.",
    "暂无内容。": "No content.",
    "暂无订阅。": "No subscribers.",
    "暂无日志。": "No log entries.",
    "没有符合条件的用户。": "No matching users.",
    "暂无广告。点击右上角「新建广告」投放第一条。": "No advertisements yet — use “New advertisement” above.",
    "正常": "Active",
    "已封禁": "Banned",
    "已下架": "Unpublished",
    "推荐": "Featured",
    "待联系": "To contact",
    "已联系": "Contacted",
    "已预约": "Booked",
    "已结束": "Closed",
    "未分配": "Unassigned",
    "停用": "Disabled",
    "注册时间": "Registered",
    "订阅时间": "Subscribed",
    "邮箱": "Email",
    "称呼": "Name",
    "电话": "Phone",
    "邮箱 / 称呼": "Email / Name",
    "入驻状态": "Provider status",
    "发布(在线)": "Published",
    "最新在前 ↓": "Newest first ↓",
    "搜索邮箱 / 称呼 / 电话…": "Search email / name / phone…",
    "搜索邮箱 / 称呼…": "Search email / name…",
    "全部板块": "All sections",
    "按板块查看": "By section",
    "板块 / 分类": "Section / Category",
    "发布者": "Author",
    "角色": "Role",
    "管理员": "Administrator",
    "审核": "Reviewer",
    "客服": "Support",
    "商户入驻申请": "Provider application",
    "跟进状态": "Follow-up",
    "后台负责人": "Owner",
    "追加内部备注": "Add internal note",
    "保存跟进": "Save follow-up",
    "查看记录": "History",
    "搜索姓名、电话、邮箱、房源或留言": "Search name, phone, email, property or message",
    "全部操作": "All actions",
    "通过内容修改": "Content edit approved",
    "驳回内容修改": "Content edit declined",
    "通过资料修改": "Profile edit approved",
    "驳回资料修改": "Profile edit declined",
    "封禁用户": "Ban user",
    "解封用户": "Unban user",
    "注销用户": "Delete user",
    "一键下架内容": "Unpublish all content",
    "批准入驻": "Approve provider",
    "驳回/取消入驻": "Decline provider",
    "暂停入驻": "Suspend provider",
    "入驻转待审": "Provider back to pending",
    "授予认证": "Grant verified",
    "取消认证": "Remove verified",
    "设推荐位": "Set featured",
    "取消推荐位": "Remove featured",
    "删除入驻方": "Delete provider",
    "内容过审": "Content approved",
    "驳回内容": "Content declined",
    "下架内容": "Content unpublished",
    "内容转待审": "Content back to pending",
    "删除内容": "Content deleted",
    "操作人": "By",
    "对象": "Target",
    "搜索对象 / 详情 / 操作人…": "Search target / detail / operator…",
    "价格,如 820000": "Price, e.g. 820000",
    "共 1 条": "1 item",
    "50 万以下": "Under $500k",
    "50 – 75 万": "$500k – $750k",
    "75 – 100 万": "$750k – $1M",
    "100 – 150 万": "$1M – $1.5M",
    "150 – 200 万": "$1.5M – $2M",
    "200 万以上": "$2M+",
    "导出全部邮箱 (CSV)": "Export all emails (CSV)",
    "运行与备份": "Operations & backup",
    "立即完整备份": "Back up now",
    "下载完整数据库备份 (.sqlite)": "Download full database backup (.sqlite)",
    "修改密码": "Change password",
    "原密码": "Current password",
    "新密码(至少 6 位)": "New password (min 6)",
    "站点与邮件通知": "Site & email notifications",
    "SMTP 服务器": "SMTP host",
    "SMTP 端口": "SMTP port",
    "SMTP 账号": "SMTP username",
    "SMTP 密码（留空保留已保存密码）": "SMTP password (leave blank to keep)",
    "发件人(From)": "From address",
    "审核通知是否同时发邮件": "Also send review notices by email",
    "否 —— 仅站内通知": "No — on-site only",
    "是 —— 站内通知 + 邮件": "Yes — on-site + email",
    "发送测试邮件(先保存设置,再测)": "Send a test email (save settings first)",
    "发送测试": "Send test",
    "保存设置": "Save settings",
    "收件邮箱,如 you@example.com": "Recipient, e.g. you@example.com",
    "重置密码（留空不变）": "Reset password (blank = unchanged)",
    "保存员工设置": "Save staff settings",
    "新增后台账号": "Add admin account",
    "初始密码（至少 10 位）": "Initial password (min 10)",
    "创建账号": "Create account",
    "管理员密码、站点信息、邮件通知与数据备份。": "Admin password, site details, email notifications and backups.",
    "官方规划文件管理": "Council document management",
    "查看前台物业查询": "View public property research",
    "添加规划文件": "Add council document",
    "中文标题": "Title (ZH)",
    "英文标题": "Title (EN)",
    "官方安全网页或文件链接": "Official page or file link",
    "文件类型": "Document type",
    "总体规划": "Unitary plan",
    "结构规划": "Structure plan",
    "地区规划": "Area plan",
    "规划变更": "Plan change",
    "核实的文件状态": "Verified status",
    "待核实": "Unverified",
    "草案": "Draft",
    "征询中": "Consultation",
    "原文件日期（可只填年月）": "Document date (year-month is fine)",
    "西边界经度": "West longitude",
    "南边界纬度": "South latitude",
    "东边界经度": "East longitude",
    "北边界纬度": "North latitude",
    "核实的范围多边形（可选）": "Verified coverage polygon (optional)",
    "导入范围文件": "Import coverage file",
    "已核对原文与适用范围，公开显示": "Verified against source and published",
    "保存文件": "Save document",
    "取消编辑": "Cancel edit",
    "已收录的文件": "Published documents",
    "房源 CSV": "Properties CSV",
    "专家 CSV": "Experts CSV",
    "资讯 CSV": "Journal CSV",
    "视频 CSV": "Videos CSV",
    "学校 CSV": "Schools CSV",
    "用户 CSV": "Users CSV",
    "内容 CSV": "Posts CSV",
    "入驻方 CSV": "Providers CSV",
    "订阅邮箱 CSV": "Subscribers CSV",
    "留言 CSV": "Enquiries CSV",
    "置业": "Property",
    "顾问": "Advisory",
    "教育": "Education",
    "生活": "Living",
    "集市": "Market",
    "同城": "Local",
    "招聘": "Jobs",
    "文化": "Culture",
    "地产": "Real estate",
    "租务": "Leasing",
    "金融": "Finance",
    "二手": "Marketplace",
    "服务": "Service",
    "动态": "Update",
    "活动": "Event",
    "求职": "Job seeking",
    "文章": "Article",
    "视频": "Video",
    "出售": "For sale",
    "价格待询": "Price on application"
  };

  /* 属性也要翻(输入框占位符、按钮 title) */
  const ATTRS = ['placeholder', 'title', 'aria-label'];

  /* &nbsp;( )与多余空白归一后再查词,否则「登&nbsp;录」这类匹配不上 */
  const norm = s => String(s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const lookup = s => DICT[norm(s)];

  function translateNode(scope) {
    if (lang !== 'en' || !scope) return;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        /* 不翻 script/style 里的东西 */
        const p = n.parentNode;
        if (!p || p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE' || p.nodeName === 'TEXTAREA') return NodeFilter.FILTER_REJECT;
        return n.nodeValue && lookup(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    const hits = [];
    let n;
    while ((n = walker.nextNode())) hits.push(n);
    for (const node of hits) {
      const raw = node.nodeValue, t = raw.trim();
      /* 保留原来的前后空白,只换中间那段文字 */
      node.nodeValue = raw.replace(t, lookup(t));
    }
    const els = scope.querySelectorAll ? scope.querySelectorAll('[' + ATTRS.join('],[') + ']') : [];
    for (const el of els) {
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v && lookup(v)) el.setAttribute(a, lookup(v));
      }
    }
  }

  /* 后台靠 innerHTML 重绘,监听整个 body 即可覆盖所有渲染 */
  let observer = null;
  function startObserving() {
    if (observer) return;
    observer = new MutationObserver(muts => {
      if (lang !== 'en') return;
      for (const m of muts) for (const node of m.addedNodes) {
        if (node.nodeType === 1) translateNode(node);
        else if (node.nodeType === 3 && node.nodeValue && lookup(node.nodeValue)) {
          node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), lookup(node.nodeValue));
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function apply() {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    if (lang === 'en') { translateNode(document.body); startObserving(); }
    const btn = document.getElementById('admin-lang');
    if (btn) btn.textContent = lang === 'en' ? '中文' : 'EN';
  }

  function setLang(next) {
    lang = next === 'en' ? 'en' : 'zh';
    try { localStorage.setItem(KEY, lang); } catch (e) {}
    /* 整页刷新最干净:后台到处是已渲染好的中文,反向翻译回中文容易出错 */
    location.reload();
  }

  /* 在侧栏底部插一个切换按钮 */
  function mountToggle() {
    if (document.getElementById('admin-lang')) return;
    const host = document.querySelector('aside .foot') || document.querySelector('#menu');
    if (!host) return;
    const a = document.createElement('a');
    a.id = 'admin-lang';
    a.href = '#';
    a.style.cssText = 'display:block;cursor:pointer';
    a.textContent = lang === 'en' ? '中文' : 'EN';
    a.addEventListener('click', e => { e.preventDefault(); setLang(lang === 'en' ? 'zh' : 'en'); });
    host.appendChild(a);
  }

  function init() { mountToggle(); apply(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  root.TPAdminI18n = { get lang() { return lang; }, setLang, DICT, translate: translateNode };
})(window);
