/* ============================================================
   THE POINT 一点 · 静态演示模式(GitHub Pages 用)
   - 仅在 *.github.io 或 ?demo=1 或 file:// 下激活,正式服务器上完全不生效
   - 激活后所有 /api/... 请求改读 demo-data.js 里的静态快照
   - 后台免登录进入只读模式;一切提交/修改操作被拦截并提示
   - 更新演示数据:在项目根目录运行  node make-demo.js
   ============================================================ */
(function () {
  'use strict';
  var isDemo = /\.github\.io$/.test(location.hostname)
    || /[?&]demo=1/.test(location.search)
    || location.protocol === 'file:';
  if (!isDemo) return;

  /* 同步加载数据文件(与 demo.js 同目录) */
  var base = '';
  try { base = document.currentScript.src.replace(/demo\.js.*$/, ''); } catch (e) {}
  document.write('<script src="' + base + 'demo-data.js"><\/script>');

  window.IS_DEMO = true;

  /* 演示角标 */
  document.addEventListener('DOMContentLoaded', function () {
    var tag = document.createElement('div');
    tag.textContent = '演示版 DEMO · 仅供浏览';
    tag.style.cssText = 'position:fixed;bottom:14px;left:14px;z-index:9999;background:#26241F;color:#EFE9DA;font-size:12px;letter-spacing:.1em;padding:7px 14px;opacity:.85;pointer-events:none;font-family:sans-serif';
    document.body.appendChild(tag);
  });

  /* ---------- 工具 ---------- */
  function ok(data) { return Promise.resolve(data); }
  function fail(msg) { return Promise.reject(new Error(msg)); }
  var DEMO_MSG = '演示模式:仅供浏览,不能提交或修改';

  function D() { return window.DEMO_DATA || {}; }
  function q2o(qs) {
    var o = {};
    new URLSearchParams(qs || '').forEach(function (v, k) { o[k] = v; });
    return o;
  }
  function paginate(list, q, defLimit) {
    var page = Math.max(1, Number(q.page) || 1);
    var limit = Math.min(48, Number(q.limit) || defLimit || 12);
    return { total: list.length, page: page, limit: limit, items: list.slice((page - 1) * limit, page * limit) };
  }
  function kw(s) { return String(s || '').toLowerCase(); }
  function has(row, fields, needle) {
    needle = kw(needle);
    return fields.some(function (f) { return kw(row[f]).indexOf(needle) >= 0; });
  }

  /* ---------- 数据加工(与后端同逻辑的精简版) ---------- */
  function agentOf(id) {
    if (!id) return null;
    return (D().agents || []).find(function (a) { return a.id === id; }) || null;
  }
  function parseProp(r) {
    var images = [];
    try { images = JSON.parse(r.images || '[]'); } catch (e) {}
    return Object.assign({}, r, { images: images, cover: images[0] || '', agent: agentOf(r.agent_id) });
  }
  function secById(id) { return (D().sections || []).find(function (s) { return s.id === id; }) || null; }
  function catById(id) {
    var out = null;
    (D().sections || []).forEach(function (s) {
      (s.categories || []).forEach(function (c) { if (c.id === id) out = c; });
    });
    return out;
  }
  function vendorBrief(id) {
    var v = (D().vendors || []).find(function (x) { return x.id === id; });
    return v ? { id: v.id, name_zh: v.name_zh, name_en: v.name_en, logo: v.logo, verified: v.verified } : null;
  }
  function parsePost(r) {
    var images = [];
    try { images = JSON.parse(r.images || '[]'); } catch (e) {}
    return Object.assign({}, r, {
      images: images, cover: images[0] || '',
      vendor: r.vendor_id ? vendorBrief(r.vendor_id) : null,
      section: r.section_id ? secById(r.section_id) : null,
      category: r.category_id ? catById(r.category_id) : null
    });
  }
  function parseVideo(r) {
    var cover = r.cover || (r.video_id ? 'https://i.ytimg.com/vi/' + r.video_id + '/hqdefault.jpg' : '');
    return Object.assign({}, r, { cover: cover });
  }

  /* ---------- 路由 ---------- */
  window.DEMO_API = function (url, opts) {
    var method = (opts && opts.method) || 'GET';
    var path = url.split('?')[0];
    var q = q2o(url.split('?')[1]);
    var d = D();

    /* 写操作:后台登录/登出放行,其余一律拦截 */
    if (method !== 'GET') {
      if (path === '/api/admin/login') return ok({ ok: 1, username: '演示模式' });
      if (path === '/api/admin/logout' || path === '/api/auth/logout') return ok({ ok: 1 });
      return fail(DEMO_MSG);
    }

    var m;
    /* ----- 前台 ----- */
    if (path === '/api/home') return ok(d.home);
    if (path === '/api/sections') return ok(d.sections);
    if (path === '/api/meta') return ok(d.meta);
    if (path === '/api/suburbs') return ok(d.suburbs || []);
    if (path === '/api/videos') {
      var vids = (d.videos || []).map(parseVideo);
      if (q.category) vids = vids.filter(function (v) { return v.category === q.category; });
      var pv = paginate(vids, q, 12);
      pv.categories = (d.videos || []).map(function (v) { return v.category; })
        .filter(function (c, i, a) { return c && a.indexOf(c) === i; });
      return ok(pv);
    }
    if (path === '/api/schools') {
      var sch = d.schools || [];
      if (q.suburb) sch = sch.filter(function (s) { return s.suburb === q.suburb; });
      if (q.type) sch = sch.filter(function (s) { return s.type === q.type; });
      var uniq = function (arr) { return arr.filter(function (x, i, a) { return x && a.indexOf(x) === i; }); };
      return ok({
        types: uniq((d.schools || []).map(function (s) { return s.type; })),
        suburbs: uniq((d.schools || []).map(function (s) { return s.suburb; })),
        items: sch
      });
    }
    if (path === '/api/properties') {
      var ps = (d.properties || []).slice();
      ['city', 'suburb', 'type', 'status'].forEach(function (f) {
        if (q[f]) ps = ps.filter(function (r) { return r[f] === q[f]; });
      });
      if (q.agent_id) ps = ps.filter(function (r) { return r.agent_id === Number(q.agent_id); });
      if (q.open_home === '1') ps = ps.filter(function (r) { return r.open_home; });
      [['beds_min', 'beds', 1], ['beds_max', 'beds', -1], ['baths_min', 'baths', 1], ['baths_max', 'baths', -1], ['price_min', 'price_value', 1], ['price_max', 'price_value', -1]].forEach(function (c) {
        if (q[c[0]] && !isNaN(Number(q[c[0]]))) {
          ps = ps.filter(function (r) {
            if (r[c[1]] == null) return false;
            return c[2] === 1 ? r[c[1]] >= Number(q[c[0]]) : r[c[1]] <= Number(q[c[0]]);
          });
        }
      });
      if (q.q) ps = ps.filter(function (r) { return has(r, ['title', 'address', 'suburb', 'city', 'description'], q.q); });
      if (q.sort === 'price_desc') ps.sort(function (a, b) { return (b.price_value || -1) - (a.price_value || -1); });
      else if (q.sort === 'price_asc') ps.sort(function (a, b) { return (a.price_value || 1e15) - (b.price_value || 1e15); });
      else if (q.sort === 'featured') ps.sort(function (a, b) { return b.featured - a.featured || b.id - a.id; });
      else ps.sort(function (a, b) { return b.id - a.id; });
      var pp = paginate(ps, q, 12);
      pp.items = pp.items.map(parseProp);
      return ok(pp);
    }
    if ((m = path.match(/^\/api\/properties\/(\d+)$/))) {
      var pr = (d.properties || []).find(function (r) { return r.id === Number(m[1]); });
      return pr ? ok(parseProp(pr)) : fail('房源不存在');
    }
    if (path === '/api/agents') return ok(d.agents || []);
    if ((m = path.match(/^\/api\/agents\/(\d+)$/))) {
      var ag = (d.agents || []).find(function (a) { return a.id === Number(m[1]); });
      if (!ag) return fail('专家不存在');
      var aps = (d.properties || []).filter(function (r) { return r.agent_id === ag.id; }).map(parseProp);
      return ok(Object.assign({}, ag, { properties: aps }));
    }
    if (path === '/api/news') {
      var ns = (d.news || []).slice();
      return ok(paginate(ns, q, 10));
    }
    if ((m = path.match(/^\/api\/news\/(\d+)$/))) {
      var nw = (d.news || []).find(function (r) { return r.id === Number(m[1]); });
      return nw ? ok(nw) : fail('文章不存在');
    }
    if (path === '/api/partners') return ok(d.partners || []);
    if (path === '/api/services') {
      var svs = (d.services || []).slice();
      if (q.category) svs = svs.filter(function (s) { return s.category === q.category; });
      return ok({
        categories: (d.services || []).map(function (s) { return s.category; })
          .filter(function (c, i, a) { return c && a.indexOf(c) === i; }),
        items: svs
      });
    }
    if (path === '/api/posts') {
      var po = (d.posts || []).slice();
      if (q.section) po = po.filter(function (r) { var s = secById(r.section_id); return s && s.slug === q.section; });
      if (q.category_id) po = po.filter(function (r) { return r.category_id === Number(q.category_id); });
      if (q.type) po = po.filter(function (r) { return r.type === q.type; });
      if (q.vendor_id) po = po.filter(function (r) { return r.vendor_id === Number(q.vendor_id); });
      if (q.featured === '1') po = po.filter(function (r) { return r.featured; });
      if (q.q) po = po.filter(function (r) { return has(r, ['title_zh', 'title_en', 'content_zh', 'content_en', 'location'], q.q); });
      po.sort(function (a, b) { return b.featured - a.featured || (b.published_at > a.published_at ? 1 : -1); });
      var ppo = paginate(po, q, 12);
      ppo.items = ppo.items.map(parsePost);
      return ok(ppo);
    }
    if ((m = path.match(/^\/api\/posts\/(\d+)$/))) {
      var pst = (d.posts || []).find(function (r) { return r.id === Number(m[1]); });
      return pst ? ok(parsePost(pst)) : fail('内容不存在或未通过审核');
    }
    if (path === '/api/vendors') {
      var vd = (d.vendors || []).slice();
      if (q.section) vd = vd.filter(function (r) { var s = secById(r.section_id); return s && s.slug === q.section; });
      if (q.category_id) vd = vd.filter(function (r) { return r.category_id === Number(q.category_id); });
      if (q.featured === '1') vd = vd.filter(function (r) { return r.featured; });
      if (q.q) vd = vd.filter(function (r) { return has(r, ['name_zh', 'name_en', 'tagline_zh', 'intro_zh'], q.q); });
      return ok(vd);
    }
    if ((m = path.match(/^\/api\/vendors\/(\d+)$/))) {
      var vv = (d.vendors || []).find(function (r) { return r.id === Number(m[1]); });
      if (!vv) return fail('入驻方不存在');
      var vposts = (d.posts || []).filter(function (r) { return r.vendor_id === vv.id; }).map(parsePost);
      return ok(Object.assign({}, vv, { posts: vposts }));
    }
    if (path === '/api/search') {
      var needle = q.q || '';
      if (!needle) return ok({ q: '', properties: [], vendors: [], posts: [], news: [] });
      return ok({
        q: needle,
        properties: (d.properties || []).filter(function (r) { return has(r, ['title', 'title_en', 'address', 'suburb', 'city', 'description'], needle); }).slice(0, 8).map(parseProp),
        vendors: (d.vendors || []).filter(function (r) { return has(r, ['name_zh', 'name_en', 'tagline_zh', 'tagline_en', 'intro_zh', 'intro_en'], needle); }).slice(0, 8),
        posts: (d.posts || []).filter(function (r) { return has(r, ['title_zh', 'title_en', 'content_zh', 'content_en', 'location'], needle); }).slice(0, 12).map(parsePost),
        news: (d.news || []).filter(function (r) { return has(r, ['title', 'title_en', 'excerpt', 'content'], needle); }).slice(0, 6)
      });
    }
    /* 登录态相关:演示模式一律视为未登录 */
    if (path === '/api/auth/me') return fail('请先登录');
    if (path === '/api/my/notifications') return ok([]);
    if (path === '/api/my/posts' || path === '/api/my/enquiries') return ok([]);
    if (path === '/api/vendor/me') return fail('尚未申请入驻');

    /* ----- 后台(只读) ----- */
    if (path === '/api/admin/me') return ok({ username: '演示模式(只读)' });
    if (path === '/api/admin/stats') return ok((d.admin || {}).stats || {});
    if (path === '/api/admin/settings') return ok({});
    if (path === '/api/admin/logs') return ok((d.admin || {}).logs || []);
    if (path === '/api/admin/enquiries') return ok((d.admin || {}).enquiries || []);
    if (path === '/api/admin/subscribers') return ok((d.admin || {}).subscribers || []);
    if (path === '/api/admin/users') return ok((d.admin || {}).users || []);
    if ((m = path.match(/^\/api\/admin\/users\/(\d+)$/))) {
      var au = ((d.admin || {}).users || []).find(function (u) { return u.id === Number(m[1]); });
      return au ? ok(Object.assign({ vendor: null, posts: [], enquiry_count: 0, active_sessions: 0 }, au)) : fail('用户不存在');
    }
    if (path === '/api/admin/vendors') return ok((d.admin || {}).vendors || []);
    if (path === '/api/admin/posts') {
      var apo = ((d.admin || {}).posts || []).map(parsePost);
      if (q.status) apo = apo.filter(function (r) { return r.status === q.status; });
      if (q.type) apo = apo.filter(function (r) { return r.type === q.type; });
      if (q.section_id) apo = apo.filter(function (r) { return r.section_id === Number(q.section_id); });
      return ok(apo);
    }
    if ((m = path.match(/^\/api\/admin\/(properties|agents|news|partners|services|sections|categories|videos|schools|suburbs)$/))) {
      var t = (d.adminTables || {})[m[1]] || [];
      if (m[1] === 'properties') t = t.map(parseProp);
      if (m[1] === 'videos') t = t.map(parseVideo);
      return ok(t);
    }
    return fail('演示模式:该接口不可用');
  };
})();
