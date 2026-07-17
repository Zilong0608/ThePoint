/* ============================================================
   THE POINT 一点 · i18n + 全站导航/登录态统一渲染
   - 中/EN 切换(localStorage: tp_lang)
   - 导航与页脚从 /api/sections 动态生成(单一来源)
   - 头部登录态(登录/注册 ↔ 我的一点)
   - 页脚低调「我要上一点」入口
   暴露全局 TP:{ lang, t, L, sections(), user(), esc, setLang }
   ============================================================ */
(function () {
  'use strict';

  const LANG_KEY = 'tp_lang';
  let lang = localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'zh';

  /* ---------- UI 词典 ---------- */
  const DICT = {
    home: ['首页', 'Home'],
    login: ['登录 / 注册', 'Sign in'],
    me: ['我的一点', 'My Point'],
    logout: ['退出登录', 'Sign out'],
    join: ['我要上一点', 'List on The Point'],
    contact: ['预约洽谈', 'Enquire'],
    all: ['全部', 'All'],
    featured: ['一点精选', 'Editor’s Picks'],
    verified: ['一点认证', 'Verified'],
    vendors: ['优选入驻方', 'Featured Providers'],
    posts: ['最新发布', 'Latest'],
    loadMore: ['加载更多', 'Load more'],
    publish: ['发布', 'Publish'],
    price: ['价格', 'Price'],
    location: ['地点', 'Location'],
    contactInfo: ['联系方式', 'Contact'],
    viewHome: ['查看主页', 'View profile'],
    send: ['发送', 'Send'],
    empty: ['暂无内容', 'Nothing here yet'],
    pending: ['待审核', 'In review'],
    approved: ['已发布', 'Published'],
    rejected: ['未通过', 'Declined'],
    offline: ['已下架', 'Offline'],
    status_market: ['二手闲置', 'Marketplace'],
    status_service: ['服务', 'Service'],
    status_update: ['动态', 'Update'],
    status_event: ['活动', 'Event'],
    status_job: ['招聘', 'Job'],
    status_seek: ['求职', 'Seeking'],
    status_article: ['文章', 'Article'],
    status_video: ['视频', 'Video'],
    privacy: ['隐私声明', 'Privacy'],
    disclaimer: ['免责声明', 'Disclaimer'],
    adminEntry: ['管理入口', 'Admin'],
    estate: ['一点房产', 'Estate'],
    experts: ['一点专家', 'Experts'],
    journal: ['一点资讯', 'Journal'],
    partners: ['一点伙伴', 'Partners'],
    services: ['一点服务', 'Services'],
    slogan: ['落地新西兰,一点全通', 'One Point, All Connected'],
    myPosts: ['我的发布', 'My posts'],
    newPost: ['发布新内容', 'New post'],
    search: ['搜索', 'Search'],
    searchSite: ['全站搜索', 'Search The Point'],
    searchPh: ['搜索房源、入驻方、二手、活动、资讯…', 'Search homes, providers, marketplace, events…'],
    notifications: ['通知', 'Notifications'],
    markAllRead: ['全部已读', 'Mark all read'],
    enquiries: ['收到的留言', 'Enquiries'],
    loginToView: ['登录后查看联系方式', 'Sign in to view contact details'],
    loginFree: ['免费注册,即刻查看', 'Free to join — view instantly'],
    noResults: ['未找到相关内容,换个关键词试试。', 'No results — try another keyword.'],
    results_properties: ['房源', 'Properties'],
    results_vendors: ['入驻方', 'Providers'],
    results_posts: ['信息', 'Posts'],
    results_news: ['资讯', 'Stories'],
    leaveMsg: ['给 TA 留言', 'Leave a message'],
    loading: ['加载中…', 'Loading…']
  };
  const t = k => (DICT[k] || [k, k])[lang === 'en' ? 1 : 0];

  /* 内容字段双语:L(obj,'title') → title_zh / title_en,带回退 */
  function L(obj, field) {
    if (!obj) return '';
    const zh = obj[field + '_zh'] != null ? obj[field + '_zh'] : obj[field];
    const en = obj[field + '_en'];
    const v = lang === 'en' ? (en || zh) : (zh || en);
    return v == null ? '' : v;
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- 数据缓存 ---------- */
  /* 板块列表:每次页面加载都取最新(不再用 sessionStorage 缓存,避免新板块被旧缓存挡住) */
  let _sections = null;
  async function sections() {
    if (_sections) return _sections;
    try {
      sessionStorage.removeItem('tp_sections'); // 清理历史缓存
      const res = await fetch('/api/sections');
      _sections = await res.json();
    } catch (e) { _sections = _sections || []; }
    return _sections;
  }

  let _user;
  async function user() {
    if (_user !== undefined) return _user;
    try {
      const res = await fetch('/api/auth/me');
      _user = res.ok ? await res.json() : null;
    } catch (e) { _user = null; }
    return _user;
  }

  function sectionUrl(s) {
    if (s.slug === 'property') return 'properties.html';
    if (s.slug === 'news') return 'news.html';
    return 'section.html?s=' + encodeURIComponent(s.slug);
  }
  const sname = s => lang === 'en' ? (s.name_en || s.name_zh) : s.name_zh;

  /* ---------- 导航重建 ---------- */
  async function buildNav() {
    const secs = await sections();
    const u = await user();
    const here = location.pathname.split('/').pop() || 'index.html';
    const curSlug = new URLSearchParams(location.search).get('s');

    const nav = document.querySelector('.site-header .nav');
    if (nav) {
      const items = [];
      items.push(`<a ${here === 'index.html' ? 'class="active"' : ''} href="index.html">${t('home')}</a>`);
      secs.forEach(s => {
        const url = sectionUrl(s);
        const on = (s.slug === 'property' && here === 'properties.html') || (s.slug === 'news' && here === 'news.html') || (here === 'section.html' && curSlug === s.slug);
        items.push(`<a ${on ? 'class="active"' : ''} href="${url}">${esc(sname(s))}</a>`);
      });
      items.push(u
        ? `<a class="btn btn--ghost nav-cta" href="me.html">${t('me')}</a>`
        : `<a class="btn btn--ghost nav-cta" href="account.html">${t('login')}</a>`);
      items.push(`<a href="search.html" class="nav-ico" title="${t('search')}" aria-label="${t('search')}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/></svg></a>`);
      if (u) {
        const n = u.unread_notifications || 0;
        items.push(`<a href="me.html#notifications" class="nav-ico nav-bell" title="${t('notifications')}" aria-label="${t('notifications')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>
          ${n ? `<i class="ndot">${n > 9 ? '9+' : n}</i>` : ''}</a>`);
      }
      items.push(`<a href="#" id="lang-toggle" class="lang-toggle" title="中 / English">${lang === 'zh' ? 'EN' : '中'}</a>`);
      nav.innerHTML = items.join('');
      nav.classList.add('nav--portal');
    }

    const drawer = document.querySelector('.mobile-nav');
    if (drawer) {
      const close = '<button class="close" aria-label="关闭">&times;</button>';
      const items = [`<a href="index.html">${t('home')}</a>`];
      secs.forEach(s => items.push(`<a href="${sectionUrl(s)}">${esc(sname(s))}</a>`));
      items.push(`<a href="search.html">${t('search')}</a>`);
      items.push(u ? `<a href="me.html">${t('me')}${u.unread_notifications ? ` <i class="ndot" style="position:static;display:inline-flex">${u.unread_notifications}</i>` : ''}</a>` : `<a href="account.html">${t('login')}</a>`);
      items.push(`<a href="#" id="lang-toggle-m">${lang === 'zh' ? 'English' : '中文'}</a>`);
      drawer.innerHTML = close + items.join('');
      /* 重新绑定抽屉开关(script.js 绑定的引用已被替换) */
      const burger = document.querySelector('.burger');
      if (burger) {
        drawer.querySelector('.close').addEventListener('click', () => drawer.classList.remove('open'));
        drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', () => drawer.classList.remove('open')));
      }
      const lm = drawer.querySelector('#lang-toggle-m');
      if (lm) lm.addEventListener('click', e => { e.preventDefault(); setLang(lang === 'zh' ? 'en' : 'zh'); });
    }

    const lt = document.getElementById('lang-toggle');
    if (lt) lt.addEventListener('click', e => { e.preventDefault(); setLang(lang === 'zh' ? 'en' : 'zh'); });

    /* 页脚:导览重建 + 低调「我要上一点」 */
    const fnav = document.querySelector('.footer-grid > div:nth-child(2)');
    if (fnav && fnav.querySelector('h4')) {
      fnav.innerHTML = `<h4>${lang === 'en' ? 'Explore' : '导览'}</h4>` +
        `<a href="index.html">${t('home')}</a>` +
        secs.map(s => `<a href="${sectionUrl(s)}">${esc(sname(s))}</a>`).join('');
    }
    const fb = document.querySelector('.footer-bottom span:last-child');
    if (fb && !fb.querySelector('a[href="join.html"]')) {
      fb.insertAdjacentHTML('afterbegin', `<a href="join.html">${t('join')}</a> · `);
    }

    /* EN 模式:页脚全英文 */
    if (lang === 'en') {
      const H = { '导览': 'Explore', '一点': 'The Point', '联系': 'Contact', '服务': 'Services' };
      document.querySelectorAll('.footer-grid h4').forEach(h => { if (H[h.textContent.trim()]) h.textContent = H[h.textContent.trim()]; });
      const A = {
        'experts.html': 'Experts', 'news.html': 'Journal', 'partners.html': 'Partners',
        'services.html': 'Services', 'join.html': t('join'), 'privacy.html': t('privacy'),
        'disclaimer.html': t('disclaimer'), '/admin/': t('adminEntry')
      };
      document.querySelectorAll('.site-footer a').forEach(a => {
        const href = a.getAttribute('href');
        if (A[href]) a.textContent = A[href];
      });
      const fbrand = document.querySelector('.footer-brand p');
      if (fbrand) fbrand.textContent = 'The Point — One Point, All Connected.';
      const cright = document.querySelector('.footer-bottom span:first-child');
      if (cright) cright.textContent = '© 2026 THE POINT. All rights reserved.';
    }
  }

  function setLang(l) {
    localStorage.setItem(LANG_KEY, l === 'en' ? 'en' : 'zh');
    location.reload();
  }

  /* data-i18n 属性替换(新页面静态文案) */
  function applyDataI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  }

  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';

  window.TP = { get lang() { return lang; }, t, L, sections, user, esc, setLang, sectionUrl, sname };

  document.addEventListener('DOMContentLoaded', () => {
    applyDataI18n();
    buildNav();
  });
})();
