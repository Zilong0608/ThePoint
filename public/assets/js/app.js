/* ============================================================
   THE POINT 一点 · 前台数据层
   从 /api/* 加载真实数据并渲染页面
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 工具 ---------- */
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const param = k => new URLSearchParams(location.search).get(k);
  const hasChinese = value => /[\u3400-\u9fff]/.test(String(value || ''));
  const isChineseOriginal = (record, field) => TP.lang==='en' && !String(record[field+'_en'] || '').trim() && hasChinese(record[field+'_zh'] ?? record[field]);
  const uiError = (error, english) => TP.lang==='en' && hasChinese(error.message) ? english : error.message;

  async function api(url, opts) {
    let res;
    try { res = await fetch(url, opts); }
    catch (e) {
      /* 请求没到服务器。浏览器只会说 "Failed to fetch",换成访客看得懂的话 */
      throw new Error(TP.lang === 'en'
        ? 'Cannot reach the server. Please check your connection and try again.'
        : '连不上服务器,请检查网络后重试。');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
    return data;
  }
  const post = (url, body) => api(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });

  function reveal(el) {
    $$('.reveal', el).forEach(n => n.classList.add('in'));
  }

  /* ---------- 图标 ---------- */
  const ICON = {
    bed: '<svg viewBox="0 0 24 24"><path d="M3 12V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5M3 12h18M3 12v6M21 12v6M6 12V9h5v3"/></svg>',
    bath: '<svg viewBox="0 0 24 24"><path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3zM7 12V6a2 2 0 0 1 4 0"/></svg>',
    car: '<svg viewBox="0 0 24 24"><path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13M5 13h14v4H5zM7 17v2M17 17v2"/></svg>',
    area: '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V9l9-6 9 6v10a2 2 0 0 1-2 2h-4M9 21v-6h6v6"/></svg>',
    mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 6l9 7 9-7"/></svg>',
    tel: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L20 13l2 5v2a1 1 0 0 1-1 1A17 17 0 0 1 4 5a1 1 0 0 1 1-1z"/></svg>'
  };

  function specsHTML(p) {
    const s = [];
    if (p.beds) s.push(`<span>${ICON.bed}${esc(p.beds)}</span>`);
    if (p.baths) s.push(`<span>${ICON.bath}${esc(p.baths)}</span>`);
    if (p.garages) s.push(`<span>${ICON.car}${esc(p.garages)}</span>`);
    if (p.land_area) s.push(`<span>${ICON.area}${esc(p.land_area)}</span>`);
    else if (p.floor_area) s.push(`<span>${ICON.area}${esc(p.floor_area)}</span>`);
    return s.join('');
  }

  function propertyPrice(p) {
    const label=priceL(p.price_label || (p.price_value != null ? 'NZ$'+Number(p.price_value).toLocaleString('en-NZ') : '价格待询'));
    if(p.listing_kind!=='rent' || !/\d/.test(label) || /\/\s*(?:周|月|week|month)|per\s+(?:week|month)|p[wm]/i.test(label))return label;
    return label+(TP.lang==='en' ? (p.rent_period==='month'?' / month':' / week') : (p.rent_period==='month'?' / 月':' / 周'));
  }
  let favoriteIds = new Set();
  let favoriteReady;
  function favoriteButton(id) {
    const saved=favoriteIds.has(Number(id)), en=TP.lang==='en';
    return `<button type="button" class="favorite-button" data-favorite="${Number(id)}" aria-pressed="${saved}" onclick="event.stopPropagation()">${saved?'♥':'♡'} ${en?(saved?'Saved':'Save'):(saved?'已收藏':'收藏房源')}</button>`;
  }
  function paintFavorites() {
    $$('[data-favorite]').forEach(b=>{
      const saved=favoriteIds.has(Number(b.dataset.favorite)),en=TP.lang==='en';
      b.setAttribute('aria-pressed',String(saved));
      const label=`${saved?'♥':'♡'} ${en?(saved?'Saved':'Save'):(saved?'已收藏':'收藏房源')}`;if(b.textContent!==label)b.textContent=label;
    });
  }
  function loadFavorites() {
    if(!favoriteReady)favoriteReady=TP.user().then(u=>u?api('/api/my/favorites'):[]).then(rows=>{favoriteIds=new Set(rows.map(p=>p.id));paintFavorites();return rows;}).catch(()=>[]);
    return favoriteReady;
  }
  document.addEventListener('click',async e=>{
    const b=e.target.closest('[data-favorite]');if(!b)return;
    e.preventDefault();e.stopPropagation();b.disabled=true;
    try {
      const u=await TP.user();
      if(!u){location.href='account.html?back='+encodeURIComponent(location.pathname.split('/').pop()+location.search);return;}
      await loadFavorites();const id=Number(b.dataset.favorite),saved=favoriteIds.has(id);
      await api('/api/my/favorites/'+id,{method:saved?'DELETE':'PUT'});
      saved?favoriteIds.delete(id):favoriteIds.add(id);favoriteReady=null;paintFavorites();
      if(saved && b.closest('[data-favorite-item]'))b.closest('[data-favorite-item]').remove();
    }catch(err){alert(err.message);}finally{b.disabled=false;}
  },true);
  const favoriteObserver=new MutationObserver(()=>{
    if(document.querySelector('[data-favorite]')){loadFavorites();paintFavorites();}
  });
  document.addEventListener('DOMContentLoaded',()=>favoriteObserver.observe(document.body,{childList:true,subtree:true}));
  /* 卡片标题:优先房源名称(同一城区的几套房不能顶着一模一样的标题)。
     英文站若没填英文标题,退回城区 —— 否则中文标题会漏到英文页上。
     后台「房源管理 · 英文标题」填好之后,这里自然就用英文名了。 */
  function cardTitle(p) {
    return TP.lang === 'en' ? (p.title_en || p.suburb || p.title || '') : (p.title || p.suburb || '');
  }
  function propCard(p, i) {
    const status={ '已售': ['已售','Sold'], '已租':['已租','Let'], '在租':['出租','For rent'] }[p.status];
    const badge = status ? status[TP.lang==='en'?1:0] : (p.open_home ? 'Open Home' : (TP.lang==='en'?'For sale':'出售'));
    return `<article class="lcard reveal in d${i % 3}" data-property-id="${p.id}" onclick="location.href='property.html?id=${p.id}'" style="cursor:pointer">
      <div class="ltop"><span>${esc(badge)}</span><b>${esc(propertyPrice(p))}</b></div>
      <div class="lphoto" style="background-image:url('${esc(p.cover || 'media/logo.svg')}')"></div>
      <div class="lbody">${favoriteButton(p.id)}${typeof p.latitude==='number'&&typeof p.longitude==='number'?`<button type="button" class="map-location-button" data-map-focus="${p.id}" onclick="event.stopPropagation()">${TP.lang==='en'?'Show on map':'地图定位'}</button>`:''}
        <div class="lrow"><h3>${esc(cardTitle(p))}</h3><div class="lspecs">${specsHTML(p)}</div></div>
        <p class="laddr">${esc(p.address || p.title)}</p>
      </div>
    </article>`;
  }

  /* ---------- 表单通用提交 (form[data-api]) ---------- */
  /* ---------- 来源归因 ----------
     从 Meta / Google 广告点进来的人,落地时把来源记进 sessionStorage;
     这次会话里提交的任何留言都带上,后台就能看出「这条线索是哪个广告带来的」。
     用「首次触达」而非「末次」—— 用户在站内点来点去不会把来源冲掉。 */
  const ATTR_KEY = 'tp_attr';
  function captureAttribution() {
    try {
      if (sessionStorage.getItem(ATTR_KEY)) return;   /* 已记过,首次触达优先 */
      const q = new URLSearchParams(location.search);
      const utm = {};
      for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
        const v = q.get(k);
        if (v) utm[k] = v.slice(0, 120);
      }
      const fbclid = q.get('fbclid'), gclid = q.get('gclid'), tpAd = q.get('tp_ad');
      const us = utm.utm_source || '';
      let source = '';
      if (tpAd) source = 'ad';                                        /* 站内广告位 */
      else if (fbclid || /facebook|instagram|meta|fb/i.test(us)) source = 'meta';
      else if (gclid || /google|adwords|gads/i.test(us)) source = 'google';
      else if (us) source = 'campaign';
      else if (document.referrer && document.referrer.indexOf(location.origin) !== 0) source = 'referral';
      if (!source) return;                                            /* 自然流量,不记 */
      sessionStorage.setItem(ATTR_KEY, JSON.stringify({
        source,
        ad_id: tpAd ? Number(tpAd) : null,
        utm: Object.keys(utm).length ? utm : null,
        landing: (location.pathname + location.search).slice(0, 300)
      }));
    } catch (e) { /* 隐私模式下 sessionStorage 可能不可用,归因失败不影响功能 */ }
  }
  function attribution() {
    try { return JSON.parse(sessionStorage.getItem(ATTR_KEY) || 'null'); } catch (e) { return null; }
  }

  /* ---------- 咨询意图(让客户自己把来意填清楚,省掉来回电话) ----------
     四种:咨询问题 / 预约看房 / 索取资料 / 请经纪人回电。
     哪些页面放哪几种,由各处调 intentSelect() 时决定;交互统一在 bindIntent() 里。 */
  const INTENT_TEXT = {
    question:  { zh: '咨询问题',      en: 'Ask a question' },
    viewing:   { zh: '预约看房',      en: 'Request a viewing' },
    info_pack: { zh: '索取资料',      en: 'Request an info pack' },
    callback:  { zh: '请经纪人回电',  en: 'Ask the agent to call me' }
  };
  const INTENT_BTN = {
    question:  { zh: '发送咨询',      en: 'Send enquiry' },
    viewing:   { zh: '提交看房意向',  en: 'Request viewing' },
    info_pack: { zh: '索取资料',      en: 'Request info pack' },
    callback:  { zh: '请经纪人回电',  en: 'Request a call' }
  };
  const INTENT_NOTE = {
    question:  { zh: '', en: '' },
    viewing:   { zh: '提交的是预约意向,工作人员联系确认后才算预约成功。请至少填写电话或邮箱。', en: 'This is a request, not a confirmed booking. We will contact you to confirm. Please leave a phone number or an email.' },
    info_pack: { zh: '我们会把相关资料发到您填写的邮箱,请至少填写邮箱或电话。', en: 'We will email you the information pack, so please leave an email or a phone number.' },
    callback:  { zh: '请留下可接通的电话,经纪人会在工作时间内致电您。', en: 'Please leave a number we can reach you on; the agent will call during business hours.' }
  };
  const INTENT_DONE = {
    question:  { zh: '留言已发送,我们会尽快回复。', en: 'Message sent. We will reply shortly.' },
    viewing:   { zh: '预约意向已提交,我们会联系您确认看房时间。', en: 'Request received. We will contact you to confirm the viewing time.' },
    info_pack: { zh: '已收到,资料会尽快发到您的邮箱。', en: 'Received. We will email you the information pack shortly.' },
    callback:  { zh: '已收到,经纪人会尽快致电您。', en: 'Received. The agent will call you shortly.' }
  };
  const iText = (map, key) => (map[key] || map.question)[TP.lang === 'en' ? 'en' : 'zh'];

  /* 生成「咨询方式」下拉 + 配套的意向时间字段与提示行。keys 决定这一页提供哪几种。 */
  function intentSelect(keys) {
    const en = TP.lang === 'en';
    return `<label class="viewing-label">${en ? 'How can we help?' : '咨询方式'}
        <select name="intent">${keys.map(k => `<option value="${k}">${iText(INTENT_TEXT, k)}</option>`).join('')}</select></label>`;
  }
  function viewingField() {
    const en = TP.lang === 'en';
    return `<label class="viewing-label" data-viewing-field hidden>${en ? 'Preferred time (New Zealand time)' : '意向时间(新西兰时间)'}<input name="viewing_at" type="datetime-local"></label>`;
  }
  const intentNoteEl = '<p class="viewing-note" data-intent-note hidden></p>';

  /* 下拉一变,表单跟着变:该显示的字段、该必填的字段、按钮文字、提示行 */
  function bindIntent(form) {
    const sel = form.elements.intent;
    if (!sel) return;
    const btn = $('button[type=submit]', form) || $('button', form);
    const message = form.elements.message, phone = form.elements.phone, email = form.elements.email;
    const viewingAt = form.elements.viewing_at, note = $('[data-intent-note]', form);
    const needsContact = v => v === 'viewing' || v === 'info_pack' || v === 'callback';
    function sync() {
      const v = sel.value;
      $$('[data-viewing-field]', form).forEach(el => { el.hidden = v !== 'viewing'; });
      if (viewingAt) { viewingAt.required = v === 'viewing'; viewingAt.disabled = v !== 'viewing'; }
      if (message) message.required = v === 'question';        /* 其余三种来意本身已说明问题 */
      if (phone) phone.required = v === 'callback';             /* 要回电必须有电话 */
      /* 只有标了 data-intent-button 的表单才让按钮跟着来意变文字,
         首页那颗「预约私人洽谈」保留它自己的说法 */
      if (btn && form.hasAttribute('data-intent-button')) btn.textContent = iText(INTENT_BTN, v);
      if (note) { const t = iText(INTENT_NOTE, v); note.textContent = t; note.hidden = !t; }
      if (phone) phone.setCustomValidity('');
    }
    sel.addEventListener('change', sync);
    form.addEventListener('reset-complete', sync);
    /* 捕获阶段先跑,挡住「要我们联系却没留任何联系方式」 */
    form.addEventListener('submit', e => {
      if (needsContact(sel.value) && !(phone && phone.value.trim()) && !(email && email.value.trim())) {
        e.preventDefault(); e.stopImmediatePropagation();
        if (phone) { phone.setCustomValidity(TP.lang === 'en' ? 'Please enter a phone number or email.' : '请至少填写电话或邮箱'); phone.reportValidity(); }
      }
    }, true);
    [phone, email].forEach(el => el && el.addEventListener('input', () => phone && phone.setCustomValidity('')));
    sync();
  }

  function bindForms(root) {
    $$('form[data-api]', root).forEach(f => {
      bindIntent(f);                           /* 有 name=intent 下拉的表单自动接上 */
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const btn = $('button[type=submit]', f) || $('button', f);
        const old = btn ? btn.textContent : '';
        try {
          if (btn) { btn.disabled = true; btn.textContent = TP.t('sending'); }
          const body = {};
          new FormData(f).forEach((v, k) => body[k] = v);
          /* 带上来源归因,后台才知道这条线索是哪个广告带来的 */
          const at = attribution();
          if (at) {
            body.source = at.source;
            if (at.ad_id) body.ad_id = at.ad_id;
            if (at.utm) body.utm = JSON.stringify(at.utm);
            body.landing = at.landing;
          }
          await post(f.dataset.api, body);
          let feedback=$('[data-form-feedback]',f);
          if(!feedback){feedback=document.createElement('p');feedback.dataset.formFeedback='';feedback.className='form-feedback';feedback.setAttribute('role','status');f.append(feedback);}
          const done=body.intent || (body.type==='viewing'?'viewing':'');
          feedback.textContent=done ? iText(INTENT_DONE,done) : (TP.lang==='en'?'Message sent.':'留言已发送。');
          f.reset();
          f.dispatchEvent(new Event('reset-complete'));
          if (btn) btn.textContent = TP.t('sent');
          setTimeout(() => { if (btn) { btn.disabled = false; btn.textContent = old; } }, 2500);
        } catch (err) {
          alert(uiError(err,'Unable to send your message. Please check your details and try again.'));
          if (btn) { btn.disabled = false; btn.textContent = old; }
        }
      });
    });
  }

  /* ============================================================
     页面渲染
     ============================================================ */
  const page = document.body.dataset.page;

  /* ---------- 房产列表 ---------- */
  async function pageProperties() {
    const form = $('#search-form'), grid = $('#plist'), countEl = $('#pcount'),
      moreBtn = $('#load-more'), sortSel = $('#sort-select');
    let pageNo = 1, lastQuery = {};
    const en = TP.lang === 'en';
    const resultLayout=$('#property-results'),mapPanel=$('#property-map-panel'),mapStatus=$('#property-map-status');
    /* 默认用网格:房源不多时一上来就是半屏地图 + 挤成一条的卡片,很难看。
       地图仍在,点「地图找房」一下就到。 */
    let selectedView=['map','grid','list'].includes(param('view'))?param('view'):'grid',mapController,mapStarting,loadEpoch=0;
    let mapData=null;
    async function ensureMap(){
      if(mapController)return mapController;
      if(!mapStarting)mapStarting=TPPropertyMap.create($('#property-map'),{
        price:propertyPrice,
        card:p=>`<section><a href="property.html?id=${p.id}">${p.cover?`<img src="${esc(p.cover)}" alt="${esc(p.title)}" loading="lazy">`:''}<b>${esc(propertyPrice(p))}</b><h3>${esc(TP.L(p,'title'))}</h3><p>${esc(p.address)}${p.suburb?', '+esc(p.suburb):''}</p></a>${favoriteButton(p.id)}</section>`,
        onSelect:ids=>$$('[data-property-id]',grid).forEach(card=>card.classList.toggle('map-selected',ids.includes(Number(card.dataset.propertyId))))
      }).then(controller=>{mapController=controller;return controller;}).catch(error=>{mapStarting=null;throw error;});
      return mapStarting;
    }
    function saveSearchUrl(){const params=new URLSearchParams({...lastQuery,view:selectedView});history.replaceState(null,'','properties.html?'+params);}
    async function updateMap(epoch){
      if(selectedView!=='map')return;
      mapStatus.textContent=en?'Loading home locations…':'正在加载房源位置…';
      try{
        const data=await api('/api/properties?'+new URLSearchParams({...lastQuery,view:'map'}));
        if(epoch!==loadEpoch)return;mapData=data;
        const controller=await ensureMap();if(epoch!==loadEpoch)return;
        controller.resize();controller.setItems(data.items);
        mapPanel.dataset.mapped=String(data.items.length);
        mapStatus.textContent=en?`${data.items.length} homes shown on map. ${data.unmapped} homes awaiting location confirmation (still available in the list).`:`地图显示 ${data.items.length} 套房源；${data.unmapped} 套尚未确认位置，仍可在列表查看。`;
        if(!data.total)mapStatus.textContent=en?'No homes match your search. Try another suburb or adjust the filters.':'暂无符合条件的房源，请更换地区或调整筛选条件。';
        if(data.truncated)mapStatus.textContent+=en?' First 1,000 locations shown; narrow your search to see more.':' 当前最多显示 1,000 个位置，请缩小搜索范围。';
      }catch(error){if(epoch===loadEpoch)mapStatus.textContent=en?'Map unavailable; you can still browse the list.':('地图暂时不可用，仍可查看列表。 '+error.message);}
    }
    function setView(view){
      selectedView=view;
      $$('.viewtoggle button').forEach(b=>{b.classList.toggle('on',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
      resultLayout.classList.toggle('map-view',view==='map');mapPanel.hidden=view!=='map';grid.classList.toggle('listview',view==='list');
      saveSearchUrl();
    }
    grid.addEventListener('click',e=>{
      const button=e.target.closest('[data-map-focus]');if(!button)return;e.preventDefault();e.stopPropagation();
      if(mapController)mapController.focus(button.dataset.mapFocus);
      if(matchMedia('(max-width:760px)').matches)mapPanel.scrollIntoView({behavior:'smooth',block:'start'});
    },true);

    /* EN 模式:房产页界面全英文 */
    if (en) {
      document.title = 'The Estate · THE POINT';
      const h = $('.page-top--banner h1');
      if (h) h.textContent = 'The Estate';
      const lead = $('.page-top--banner .lead-dim');
      if (lead) lead.textContent = 'Every home here is personally curated by The Point — begin your next chapter.';
      $$('.field > label', form).forEach(l => { l.textContent = l.textContent.replace(/^[^·]+·\s*/, ''); });
      const OPT = { '所有城市': 'All cities', '所有地区': 'All suburbs', '所有类型': 'All types', '不限': 'Any', '仅看 Open Home': 'Open Home only' };
      Object.assign(OPT,{'全部用途':'Sale & rent','出售':'For sale','出租':'For rent','每周':'Per week','每月':'Per month'});
      $$('option', form).forEach(o => { if (OPT[o.textContent.trim()]) o.textContent = OPT[o.textContent.trim()]; });
      $$('.row span', form).forEach(s => { if (s.textContent.trim() === '至') s.textContent = '–'; });
      $$('input[placeholder]', form).forEach(i => {
        if (i.placeholder === '不限') i.placeholder = 'Any';
        else if (/关键词/.test(i.placeholder)) i.placeholder = 'Keyword or address';
      });
      const sb = $('button[type=submit]', form);
      if (sb) sb.textContent = 'Search';
      if (sortSel) {
        const SM = { new: 'Newest', price_desc: 'Price: high to low', price_asc: 'Price: low to high', featured: 'Featured first' };
        [...sortSel.options].forEach(o => { if (SM[o.value]) o.textContent = SM[o.value]; });
      }
      if (moreBtn) moreBtn.textContent = 'Load more';
    }

    // 填充下拉选项
    try {
      const meta = await api('/api/meta');
      const fill = (sel, list, all) => {
        if (!sel) return;
        /* EN 模式:「别墅 / House」这类数据值只显示英文段,筛选值不变 */
        const disp = v => en && v.includes('/') ? v.split('/').pop().trim() : v;
        sel.innerHTML = `<option value="">${all}</option>` + list.map(v => `<option value="${esc(v)}">${esc(disp(v))}</option>`).join('');
      };
      fill($('[name=city]', form), meta.cities, en ? 'All cities' : '所有城市');
      fill($('[name=suburb]', form), meta.suburbs, en ? 'All suburbs' : '所有地区');
      fill($('[name=type]', form), meta.types, en ? 'All types' : '所有类型');
    } catch (e) { /* 非致命 */ }

    for(const [key,value] of new URLSearchParams(location.search)){
      const field=form.elements.namedItem(key);if(field && typeof field.value==='string')field.value=value;
    }
    if(sortSel&&param('sort')&&[...sortSel.options].some(o=>o.value===param('sort')))sortSel.value=param('sort');
    function collect() {
      const q = {};
      new FormData(form).forEach((v, k) => { if (v) q[k] = v; });
      if (sortSel && sortSel.value) q.sort = sortSel.value;
      return q;
    }
    async function load(reset) {
      const epoch=reset?++loadEpoch:loadEpoch;
      if (reset) { pageNo = 1; lastQuery = collect();mapData=null;saveSearchUrl();updateMap(epoch); }
      const qs = new URLSearchParams({ ...lastQuery, page: pageNo, limit: 12 });
      let data;
      try {data=await api('/api/properties?' + qs);}catch(error){if(epoch===loadEpoch)countEl.textContent=uiError(error,'Unable to load homes. Please try again.');return;}
      if(epoch!==loadEpoch)return;
      const html = data.items.map(propCard).join('');
      if (reset) grid.innerHTML = html || `<p style="grid-column:1/-1;text-align:center;color:var(--ink-3);padding:60px 0">${en ? 'No homes match your search.' : '暂无符合条件的房源'}</p>`;
      else grid.insertAdjacentHTML('beforeend', html);
      if (countEl) countEl.innerHTML = en ? `<b>${data.total}</b> curated homes` : `共 <b>${data.total}</b> 套臻选房源`;
      if (moreBtn) moreBtn.style.display = pageNo * data.limit < data.total ? '' : 'none';
    }
    form.addEventListener('submit', async e => {
      e.preventDefault();await load(true);
      window.scrollTo({top:resultLayout.getBoundingClientRect().top+window.scrollY-120,behavior:'smooth'});
    });
    const use=form.querySelector('[name=listing_kind]');
    const priceNote=$('#property-price-note');
    if(use){
      const period=form.querySelector('[name=rent_period]');
      const updatePurpose=()=>{
        const rent=use.value==='rent';
        const filter=form.querySelector('[data-rent-filter]');if(filter)filter.hidden=!rent;if(period)period.disabled=!rent;
        if(priceNote)priceNote.textContent=rent ? (en?'Compare rentals within the selected weekly or monthly period.':'出租房源会按所选租金周期筛选，避免混合比较周租和月租。') : (en?'Prices in NZD. Choose a listing purpose before comparing prices.':'价格单位为 NZD；请先选择出售或出租再比较价格。');
      };
      use.addEventListener('change',updatePurpose);updatePurpose();
    }
    if (sortSel) sortSel.addEventListener('change', () => load(true));
    if (moreBtn) moreBtn.addEventListener('click', e => { e.preventDefault(); pageNo++; load(false); });
    // 视图切换
    $$('.viewtoggle button').forEach(b => b.addEventListener('click', e => {
      e.preventDefault();
      $$('.viewtoggle button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      setView(b.dataset.view);
      if(selectedView==='map'){
        if(mapData&&mapController){mapController.resize();mapController.setItems(mapData.items);}
        else updateMap(loadEpoch);
      }
    }));
    lastQuery = collect();setView(selectedView);load(true);
  }

  /* ---------- 房源详情 ---------- */
  async function pageProperty() {
    const id = param('id');
    const box = $('#property-detail');
    if (!id) { box.innerHTML = `<p class="center" style="padding:80px 0">${TP.lang==='en'?'No property selected.':'未指定房源'}</p>`; return; }
    let p;
    try { p = await api('/api/properties/' + id); }
    catch (e) { box.innerHTML = `<p style="text-align:center;padding:80px 0;color:var(--ink-3)">${esc(uiError(e,'This property is unavailable.'))}</p>`; return; }
    setMeta(`${TP.L(p, 'title')} · ${TP.lang==='en'?'THE POINT':'THE POINT 一点'}`, TP.L(p, 'description') || `${p.address} ${p.suburb} ${p.city}`, p.images[0]);
    const pen = TP.lang === 'en';
    const pstat = pen ? ({ '在售': 'For Sale', '已售': 'Sold', '在租':'For Rent','已租':'Let', '下架': 'Off Market' }[p.status] || p.status) : p.status;
    const imgs = p.images.length ? p.images : ['media/logo.svg'];
    const agent = p.agent;
    box.innerHTML = `
      <div class="pd-gallery">
        <button type="button" class="pd-main pd-zoom" id="pd-main" aria-label="${pen?'View larger photos':'查看大图'}" style="background-image:url('${esc(imgs[0])}')"><span>${pen?'View photos':'点击查看大图'}</span></button>
        ${imgs.length > 1 ? `<div class="pd-thumbs">${imgs.map((im, i) =>
          `<div class="pd-thumb${i === 0 ? ' on' : ''}" data-src="${esc(im)}" style="background-image:url('${esc(im)}')"></div>`).join('')}</div>` : ''}
      </div>
      <div class="pd-layout">
        <div class="pd-info">${favoriteButton(p.id)}
          <div class="ltop" style="padding:0 0 14px"><span>${esc(pstat)}${p.open_home ? ' · Open Home ' + esc(p.open_home) : ''}</span><b style="font-size:22px">${esc(propertyPrice(p))}</b></div>
          <h1 class="section-title" style="margin-bottom:6px">${esc(TP.L(p, 'title'))}</h1>
          <p class="laddr" style="font-size:16px;margin-bottom:18px">${esc(p.address)}${p.suburb ? ', ' + esc(p.suburb) : ''}${p.city ? ', ' + esc(p.city) : ''}</p>
          <div class="lspecs pd-specs">${specsHTML(p)}${p.floor_area && p.land_area ? `<span>${ICON.area}${pen?'Floor area':'室内'} ${esc(p.floor_area)}</span>` : ''}</div>
          ${p.listing_kind==='rent' ? `<div class="rental-facts">${p.available_from ? `<span>${pen?'Available from':'可入住日期'}：${esc(p.available_from)}</span>` : ''}${p.bond != null ? `<span>${pen?'Bond':'押金'}：NZ$${esc(Number(p.bond).toLocaleString('en-NZ'))}</span>`:''}</div>`:''}
          ${p.updated_at ? `<p class="property-updated">${pen?'Updated':'信息更新'}：${esc(p.updated_at.slice(0,10))}</p>`:''}
          <div class="divider"></div>
          ${isChineseOriginal(p,'description')?`<p class="translation-note">${TP.t('originalChinese')}</p>`:''}
          <div class="pd-desc"${isChineseOriginal(p,'description')?' lang="zh-CN"':''}>${esc(TP.L(p, 'description') || (pen ? 'Contact The Point for details.' : '详情请垂询一点专家。')).split(/\n+/).map(t => `<p>${t}</p>`).join('')}</div>
          ${(p.floorplans || []).length ? `<div class="divider"></div><h2 class="floorplan-heading">${pen?'Floor plans':'户型图'}</h2><div class="floorplan-grid">${p.floorplans.map((src,i)=>`<button type="button" data-floorplan="${i}" aria-label="${pen?'View floor plan':'查看户型图'} ${i+1}"><img src="${esc(src)}" alt="${pen?'Floor plan':'户型图'} ${i+1}" loading="lazy"></button>`).join('')}</div>`:''}
          ${p.tour_url ? `<div class="divider"></div>
          <p class="eyebrow" style="margin-bottom:14px">${pen ? '3D Tour' : '3D Tour · 实景看房'}</p>
          <div class="pd-map pd-tour"><iframe src="${esc(p.tour_url)}" loading="lazy" allowfullscreen allow="xr-spatial-tracking; gyroscope; accelerometer; fullscreen"></iframe></div>` : ''}
          ${p.address ? `<div class="divider"></div>
          <p class="eyebrow" style="margin-bottom:14px">${pen ? 'Location' : 'Location · 位置'}</p>
          <p style="margin-bottom:16px"><a class="btn btn--sm" href="council.html?address=${encodeURIComponent(p.address)}">${pen?'Research zoning and planning':'查询土地分区与规划资料'}</a></p>
          <div class="pd-map"><iframe src="https://www.google.com/maps?q=${encodeURIComponent([p.address, p.suburb, p.city, 'New Zealand'].filter(Boolean).join(', '))}&output=embed&hl=${pen?'en':'zh-CN'}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>` : ''}
        </div>
        <aside class="pd-side">
          ${agent ? `<div class="pd-agent">
            <div class="avatar" style="background-image:url('${esc(agent.photo || 'media/logo.svg')}')"></div>
            <span class="cat">${esc(pen?({'地产':'Real estate','金融':'Finance','租务':'Rentals'}[agent.category]||agent.category):agent.category)}</span>
            <h3><a href="expert.html?id=${agent.id}">${esc(agent.name)}</a></h3>
            ${agent.email ? `<div class="arow">${ICON.mail}<a href="mailto:${esc(agent.email)}">${esc(agent.email)}</a></div>` : ''}
            ${agent.phone ? `<div class="arow">${ICON.tel}<a href="tel:${esc(agent.phone.replace(/\s/g, ''))}">${esc(agent.phone)}</a></div>` : ''}
            <a class="btn btn--ghost" style="margin-top:14px" href="expert.html?id=${agent.id}">${pen ? 'View their listings' : '查看 TA 的房源'}</a>
          </div>` : ''}
          <div class="pd-enquiry">
            <h4>${pen ? 'Enquire about this home' : '咨询此房源'}</h4>
            <form data-api="/api/enquiries" data-intent-button>
              <input type="hidden" name="type" value="property">
              ${intentSelect(['在售','在租'].includes(p.status) ? ['question','viewing','info_pack','callback'] : ['question','info_pack','callback'])}
              <input type="hidden" name="property_id" value="${p.id}">
              ${agent ? `<input type="hidden" name="agent_id" value="${agent.id}">` : ''}
              <input name="name" placeholder="${pen ? 'Full name' : '姓名（请填全名）'}" required minlength="2">
              <input name="phone" placeholder="${pen ? 'Phone' : '联系电话'}">
              <input name="email" type="email" placeholder="${pen ? 'Email' : '邮箱'}">
              ${viewingField()}
              ${intentNoteEl}
              <textarea name="message" rows="4" placeholder="${pen ? 'What would you like to know…' : '想了解些什么…'}" required></textarea>
              <button class="btn btn--solid" type="submit" style="width:100%;justify-content:center">${pen ? 'Send enquiry' : '发送咨询'}</button>
            </form>
          </div>
        </aside>
      </div>`;
    let currentPhoto=0;
    $$('.pd-thumb', box).forEach((t,i) => t.addEventListener('click', () => {
      currentPhoto=i;
      $('#pd-main').style.backgroundImage = `url('${t.dataset.src}')`;
      $$('.pd-thumb', box).forEach(x => x.classList.remove('on'));
      t.classList.add('on');
    }));
    const allPhotos=imgs.concat(p.floorplans || []);
    $('#pd-main').addEventListener('click',()=>openPropertyPhotos(allPhotos,currentPhoto,TP.L(p,'title')));
    $$('[data-floorplan]',box).forEach(b=>b.addEventListener('click',()=>openPropertyPhotos(allPhotos,imgs.length+Number(b.dataset.floorplan),TP.L(p,'title'))));
    bindForms(box);                            /* 咨询方式的联动交给 bindIntent() 统一处理 */
    reveal(box);
  }

  function openPropertyPhotos(images,index,title){
    const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='property-lightbox';
    const en=TP.lang==='en';dialog.setAttribute('aria-label',en?'Property photos':'房源图片');
    dialog.innerHTML=`<div class="photo-viewer"><header><span>${esc(title)}</span><button type="button" data-close aria-label="${en?'Close':'关闭'}">×</button></header><div class="photo-stage"><button type="button" data-prev aria-label="${en?'Previous photo':'上一张'}">‹</button><img alt=""><button type="button" data-next aria-label="${en?'Next photo':'下一张'}">›</button></div><p data-counter role="status"></p></div>`;
    function show(){index=(index+images.length)%images.length;const img=$('img',dialog);img.src=images[index];img.alt=title+' · '+(index+1);$('[data-counter]',dialog).textContent=`${index+1} / ${images.length}`;}
    $('[data-close]',dialog).onclick=()=>dialog.close();$('[data-prev]',dialog).onclick=()=>{index--;show();};$('[data-next]',dialog).onclick=()=>{index++;show();};
    dialog.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();index--;show();}if(e.key==='ArrowRight'){e.preventDefault();index++;show();}});
    dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
    const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    dialog.addEventListener('close',()=>{dialog.remove();document.body.style.overflow=oldOverflow;if(previous)previous.focus();},{once:true});
    document.body.append(dialog);show();dialog.showModal();
  }

  /* ---------- 专家列表 ---------- */
  async function pageExperts() {
    const grid = $('#agrid');
    const agents = await api('/api/agents');
    grid.innerHTML = agents.map((a, i) => `
      <article class="acard reveal in d${i % 3}" onclick="location.href='expert.html?id=${a.id}'" style="cursor:pointer">
        <div class="ahead"></div>
        <div class="avatar" style="background-image:url('${esc(a.photo || 'media/logo.svg')}')"></div>
        <div class="abody">
          <span class="cat">${esc(a.category)}</span>
          <h3>${esc(a.name)}</h3>
          ${a.email ? `<div class="arow">${ICON.mail}<a href="mailto:${esc(a.email)}" onclick="event.stopPropagation()">${esc(a.email)}</a></div>` : ''}
          ${a.phone ? `<div class="arow">${ICON.tel}<a href="tel:${esc(a.phone.replace(/\s/g, ''))}" onclick="event.stopPropagation()">${esc(a.phone)}</a></div>` : ''}
          <span class="more" style="color:var(--accent-deep);font-size:14px;display:inline-block;margin-top:10px">查看主页 →</span>
        </div>
      </article>`).join('');
  }

  /* ---------- 专家详情 ---------- */
  /* 只放行 http(s) 外链。channel_url 是经纪人自己填的,直接当 href 用会被塞 javascript: 伪协议 */
  function safeHttp(value) {
    const url = String(value || '').trim();
    if (/[\s\\\u0000-\u001f]/.test(url) || !/^https?:\/\//i.test(url)) return '';
    try { const u = new URL(url); return (u.username || u.password) ? '' : u.href; } catch (e) { return ''; }
  }

  async function pageExpert() {
    const id = param('id');
    const box = $('#expert-detail');
    if (!id) { box.innerHTML = '<p style="text-align:center;padding:80px 0">未指定专家</p>'; return; }
    let a;
    try { a = await api('/api/agents/' + id); }
    catch (e) { box.innerHTML = `<p style="text-align:center;padding:80px 0;color:var(--ink-3)">${esc(e.message)}</p>`; return; }
    document.title = `${a.name} · 一点专家 · THE POINT`;
    box.innerHTML = `
      <div class="ex-head">
        <div class="avatar" style="background-image:url('${esc(a.photo || 'media/logo.svg')}')"></div>
        <div class="ex-meta">
          <span class="cat">${esc(a.category)}</span>
          <h1 class="section-title">${esc(a.name)}</h1>
          <div class="ex-contacts">
            ${a.email ? `<div class="arow">${ICON.mail}<a href="mailto:${esc(a.email)}">${esc(a.email)}</a></div>` : ''}
            ${a.phone ? `<div class="arow">${ICON.tel}<a href="tel:${esc(a.phone.replace(/\s/g, ''))}">${esc(a.phone)}</a></div>` : ''}
            ${a.wechat ? `<div class="arow"><b style="font-size:13px">微信</b><span>${esc(a.wechat)}</span></div>` : ''}
          </div>
          ${TP.L(a, 'bio') ? `<p class="lead-dim" style="max-width:60ch;margin-top:14px">${esc(TP.L(a, 'bio'))}</p>` : ''}
          ${safeHttp(a.channel_url) ? `<p style="margin-top:12px"><a class="btn btn--sm" href="${esc(safeHttp(a.channel_url))}" target="_blank" rel="noopener noreferrer">${TP.lang === 'en' ? 'YouTube channel' : 'YouTube 频道'} →</a></p>` : ''}
        </div>
      </div>
      ${(a.videos && a.videos.length) ? `
      <div class="ex-section">
        <p class="eyebrow line">Videos</p>
        <h2 class="section-title">${TP.lang === 'en' ? 'Videos' : 'TA 的视频'} <span style="color:var(--ink-3);font-size:60%">${a.videos.length}</span></h2>
        <div class="divider"></div>
        <div class="lgrid">${a.videos.filter(v => /^[\w-]{6,20}$/.test(String(v.video_id || ''))).map(v => `
          <a class="vcard" href="https://www.youtube.com/watch?v=${esc(v.video_id)}" target="_blank" rel="noopener noreferrer" style="display:block;border:1px solid var(--line);background:var(--card);text-decoration:none">
            <img src="${esc(v.cover || ('https://i.ytimg.com/vi/' + v.video_id + '/hqdefault.jpg'))}" alt="${esc(TP.L(v, 'title') || '')}" loading="lazy" style="display:block;width:100%;height:auto;object-fit:cover">
            <span style="display:block;padding:12px 14px;font-size:14px;color:var(--ink-2);line-height:1.5">${esc(TP.L(v, 'title') || '')}</span>
          </a>`).join('')}</div>
      </div>` : ''}
      <div class="ex-section">
        <p class="eyebrow line">Listings</p>
        <h2 class="section-title">TA 的在售房源 <span style="color:var(--ink-3);font-size:60%">共 ${a.properties.length} 套</span></h2>
        <div class="divider"></div>
        <div class="lgrid">${a.properties.length ? a.properties.map(propCard).join('') : '<p style="grid-column:1/-1;color:var(--ink-3);padding:30px 0">暂无在售房源</p>'}</div>
      </div>
      <div class="ex-section pd-enquiry" style="max-width:640px">
        <h4>给 ${esc(a.name)} 留言</h4>
        <form data-api="/api/enquiries" data-intent-button>
          <input type="hidden" name="type" value="agent">
          <input type="hidden" name="agent_id" value="${a.id}">
          ${intentSelect(['question','callback','info_pack'])}
          <input name="name" placeholder="${TP.lang==='en'?'Full name':'姓名（请填全名）'}" required minlength="2">
          <input name="phone" placeholder="联系电话">
          <input name="email" type="email" placeholder="邮箱">
          ${intentNoteEl}
          <textarea name="message" rows="4" placeholder="想咨询些什么…" required></textarea>
          <button class="btn btn--solid" type="submit">发送留言</button>
        </form>
      </div>`;
    bindForms(box);
    reveal(box);
  }

  /* ---------- 资讯列表 ---------- */
  async function pageNews() {
    const list = $('#news-items'), moreBtn = $('#news-more');
    const en=TP.lang==='en';
    setMeta(en?'Journal · THE POINT':'一点资讯 · THE POINT',TP.t('journalLead'));
    let pageNo = 1;
    async function load() {
      let data;
      try{data=await api(`/api/news?page=${pageNo}&limit=10`);}catch(error){list.textContent=uiError(error,'Unable to load stories. Please try again.');return;}
      const html = data.items.map((n, i) => `
        <article class="item reveal in" onclick="location.href='article.html?id=${n.id}'" style="cursor:pointer">
          <div class="nthumb" style="background-image:url('${esc(n.image || 'media/logo.svg')}')"></div>
          <div>
            <h3>${esc(TP.L(n, 'title'))}</h3>
            ${isChineseOriginal(n,'title')||isChineseOriginal(n,'excerpt')?`<p class="translation-note">${en?'Original article in Chinese.':''}</p>`:''}
            <p class="excerpt">${TP.L(n,'source_note') ? `<span class="src"${isChineseOriginal(n,'source_note')?' lang="zh-CN"':''}>${esc(TP.L(n,'source_note'))}</span> ` : ''}${esc(TP.L(n, 'excerpt'))}<a class="more" href="article.html?id=${n.id}" onclick="event.stopPropagation()">…${TP.t('readMore')}</a></p>
            <div class="byline"><span class="bp">The Point</span><span>${esc((n.published_at || '').slice(0, 16))}</span></div>
          </div>
        </article>`).join('');
      if (pageNo === 1) list.innerHTML = html || `<p style="color:var(--ink-3);padding:40px 0">${TP.t('noNews')}</p>`;
      else list.insertAdjacentHTML('beforeend', html);
      if (moreBtn) moreBtn.parentElement.style.display = pageNo * data.limit < data.total ? '' : 'none';
    }
    if (moreBtn) moreBtn.addEventListener('click', async e => { e.preventDefault();if(moreBtn.getAttribute('aria-busy')==='true')return;moreBtn.setAttribute('aria-busy','true');pageNo++;try{await load();}finally{moreBtn.removeAttribute('aria-busy');} });
    load();
  }

  /* ---------- 文章详情 ---------- */
  async function pageArticle() {
    const id = param('id');
    const box = $('#article-detail');
    let n;
    try { n = await api('/api/news/' + id); }
    catch (e) { box.innerHTML = `<p style="text-align:center;padding:80px 0;color:var(--ink-3)">${esc(uiError(e,'This story is unavailable.'))}</p>`; return; }
    setMeta(`${TP.L(n, 'title')} · ${TP.lang==='en'?'The Point Journal':'一点资讯'}`, TP.L(n, 'excerpt') || TP.L(n, 'content'), n.image);
    box.innerHTML = `
      <h1 class="art-title">${esc(TP.L(n, 'title'))}</h1>
      <div class="byline" style="margin:18px 0 6px"><span class="bp">The Point</span><span>${esc((n.published_at || '').slice(0, 16))}</span></div>
      ${TP.L(n,'source_note') ? `<p class="src" style="color:var(--ink-3);font-size:13px"><span${isChineseOriginal(n,'source_note')?' lang="zh-CN"':''}>${esc(TP.L(n,'source_note'))}</span> · ${TP.t('newsDisclaimer')}</p>` : ''}
      ${n.image ? `<div class="art-img" style="background-image:url('${esc(n.image)}')"></div>` : ''}
      ${isChineseOriginal(n,'content')?`<p class="translation-note">${TP.t('originalChinese')}</p>`:''}
      <div class="art-body article-content"${isChineseOriginal(n,'content')?' lang="zh-CN"':''}>${TPContent.render(TP.L(n, 'content') || TP.L(n, 'excerpt'), n.content_format)}</div>
      <div style="margin-top:44px"><a class="btn" href="news.html">${TP.t('backJournal')}</a></div>`;
    reveal(box);
  }

  /* ---------- 服务名录 ---------- */
  async function pageServices() {
    const tabs = $('#svc-tabs'), grid = $('#svc-grid');
    let current = '';
    async function load() {
      const data = await api('/api/services' + (current ? '?category=' + encodeURIComponent(current) : ''));
      if (!tabs.dataset.built) {
        tabs.innerHTML = `<button class="svc-tab on" data-cat="">全部</button>` +
          data.categories.map(c => `<button class="svc-tab" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
        tabs.dataset.built = '1';
        tabs.addEventListener('click', e => {
          const b = e.target.closest('.svc-tab');
          if (!b) return;
          $$('.svc-tab', tabs).forEach(x => x.classList.remove('on'));
          b.classList.add('on');
          current = b.dataset.cat;
          load();
        });
      }
      grid.innerHTML = data.items.length ? data.items.map((s, i) => `
        <article class="svc-card${s.featured ? ' featured' : ''} reveal in d${i % 3}">
          ${s.featured ? '<span class="svc-star">推荐 · Featured</span>' : ''}
          <div class="svc-top">
            ${s.logo ? `<div class="svc-logo" style="background-image:url('${esc(s.logo)}')"></div>` : `<div class="svc-logo svc-logo--empty">${esc(s.name.slice(0, 1))}</div>`}
            <div>
              <span class="cat">${esc(s.category)}</span>
              <h3>${esc(s.name)}</h3>
            </div>
          </div>
          ${TP.L(s, 'tagline') ? `<p class="svc-tag">${esc(TP.L(s, 'tagline'))}</p>` : ''}
          <div class="svc-contacts">
            ${s.phone ? `<a href="tel:${esc(s.phone.replace(/\s/g, ''))}">📞 ${esc(s.phone)}</a>` : ''}
            ${s.wechat ? `<span>微信 ${esc(s.wechat)}</span>` : ''}
            ${s.email ? `<a href="mailto:${esc(s.email)}">✉ ${esc(s.email)}</a>` : ''}
            ${s.website ? `<a href="${esc(s.website)}" target="_blank" rel="noopener">官网 →</a>` : ''}
          </div>
        </article>`).join('') : '<p style="grid-column:1/-1;text-align:center;color:var(--ink-3);padding:50px 0">该类别暂无商户</p>';
    }
    load();
  }

  /* ---------- 伙伴 ---------- */
  async function pagePartners() {
    const wall = $('#logo-wall');
    const partners = await api('/api/partners');
    wall.innerHTML = partners.map(p => {
      const img = `<img src="${esc(p.logo || 'media/logo.svg')}" alt="${esc(p.name)}" title="${esc(p.name)}" loading="lazy">`;
      return `<div class="cell">${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${img}</a>` : img}</div>`;
    }).join('');
  }

  /* ============================================================
     平台化页面(依赖 i18n.js 的全局 TP)
     ============================================================ */
  const catN = c => TP.lang === 'en' ? (c.name_en || c.name_zh) : c.name_zh;
  const typeLabel = ty => TP.t('status_' + ty);
  const statusTag = st => `<span class="stag stag--${st}">${TP.t(st)}</span>`;
  const wxLabel = () => TP.lang === 'en' ? 'WeChat' : '微信';
  /* 价格标签双语:免费→Free 等 */
  function priceL(label) {
    if (!label) return '';
    if (TP.lang !== 'en') return label;
    const s = String(label).trim();
    const M = { '免费': 'Free', '面议': 'Negotiable', '价格面议': 'Negotiable', '价格待询': 'Price on request', '待询': 'Price on request' };
    if (M[s]) return M[s];
    const m = s.match(/^(.+?)\s*起$/);
    if (m) return 'from ' + m[1];
    return s.replace(/\/\s*周/g,'/ week').replace(/\/\s*月/g,'/ month').replace(/每周/g,'per week').replace(/每月/g,'per month');
  }

  /* ---------- 加载骨架 / 空状态 / 联系方式锁 ---------- */
  const skeleton = (n, style) => Array.from({ length: n || 3 }, (_, i) =>
    `<div class="skel d${i % 3}" ${style ? `style="${style}"` : ''}><div class="skel-img"></div><div class="skel-line"></div><div class="skel-line short"></div></div>`).join('');
  const skelText = `<div class="skel skel--text"><div class="skel-line" style="width:40%"></div><div class="skel-line"></div><div class="skel-line"></div><div class="skel-line short"></div></div>`;
  const emptyBox = (msg, cta) => `<div class="empty-state" style="grid-column:1/-1">
    <span class="es-mark">◦</span><p>${msg || TP.t('empty')}</p>${cta || ''}</div>`;
  function lockCTA() {
    const back = encodeURIComponent((location.pathname.split('/').pop() || 'index.html') + location.search);
    return `<div class="lock-box">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" width="22" height="22"><rect x="5" y="11" width="14" height="9" rx="1"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
      <p>${TP.t('loginToView')}</p>
      <a class="btn btn--solid btn--sm" href="account.html?back=${back}">${TP.t('login')}</a>
      <span class="auth-note">${TP.t('loginFree')}</span>
    </div>`;
  }

  /* ---------- SEO:动态页面 meta ---------- */
  function setMeta(title, desc, img) {
    if (title) document.title = title;
    const ensure = (sel, mk, val) => {
      let el = document.head.querySelector(sel);
      if (!el) { el = document.createElement('meta'); el.setAttribute(mk[0], mk[1]); document.head.appendChild(el); }
      el.setAttribute('content', val);
    };
    if (title) ensure('meta[property="og:title"]', ['property', 'og:title'], title);
    if (desc) {
      const d = String(desc).replace(/\s+/g, ' ').slice(0, 150);
      ensure('meta[name="description"]', ['name', 'description'], d);
      ensure('meta[property="og:description"]', ['property', 'og:description'], d);
    }
    if (img) ensure('meta[property="og:image"]', ['property', 'og:image'], new URL(img, location.href).href);
  }

  /* ---------- 图片:上传前压缩 + 选择预览 ---------- */
  async function compressImage(file, maxDim, quality) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 300 * 1024) return file;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, (maxDim || 1600) / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality || 0.82));
      if (blob && blob.size < file.size) return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch (e) { /* 压缩失败则原图上传 */ }
    return file;
  }
  function bindFilePreviews(form) {
    $$('input[type=file]', form).forEach(inp => {
      inp.addEventListener('change', () => {
        let box = inp.nextElementSibling;
        if (!box || !box.hasAttribute('data-prev')) {
          box = document.createElement('div');
          box.className = 'fprev';
          box.setAttribute('data-prev', '');
          inp.after(box);
        }
        box.innerHTML = [...inp.files].slice(0, 6).map(f => `<img src="${URL.createObjectURL(f)}" alt="preview">`).join('');
      });
    });
  }

  function postCard(p, i) {
    const title = TP.L(p, 'title');
    const meta = [p.section ? TP.sname(p.section) : '', p.category ? catN(p.category) : ''].filter(Boolean).join(' · ');
    return `<article class="lcard reveal in d${i % 3}" onclick="location.href='post.html?id=${p.id}'" style="cursor:pointer">
      <div class="ltop"><span>${esc(typeLabel(p.type))}</span><b>${esc(priceL(p.price_label))}</b></div>
      <div class="lphoto${p.cover ? '' : ' lphoto--empty'}" style="background-image:url('${esc(p.cover || 'media/logo.svg')}')"></div>
      <div class="lbody">
        <div class="lrow"><h3 style="font-size:19px">${esc(title)}</h3></div>
        <p class="laddr">${esc(meta)}${p.location ? ' · ' + esc(p.location) : ''}</p>
        ${p.vendor ? `<p class="laddr" style="margin-top:4px">${esc(TP.L(p.vendor, 'name'))}${p.vendor.verified ? ` <span class="vbadge">✓ ${TP.t('verified')}</span>` : ''}</p>` : ''}
      </div>
    </article>`;
  }
  function vendorCard(v, i) {
    return `<article class="vcard reveal in d${(i || 0) % 3}" onclick="location.href='vendor.html?id=${v.id}'">
      ${v.logo ? `<div class="vlogo" style="background-image:url('${esc(v.logo)}')"></div>` : `<div class="vlogo vlogo--empty">${esc((TP.L(v, 'name') || '?').slice(0, 1))}</div>`}
      <div class="vbody">
        <h3>${esc(TP.L(v, 'name'))} ${v.verified ? `<span class="vbadge">✓ ${TP.t('verified')}</span>` : ''}</h3>
        <p class="vtag">${esc(TP.L(v, 'tagline'))}</p>
      </div>
    </article>`;
  }
  async function uploadFiles(input) {
    if (!input || !input.files.length) return [];
    const fd = new FormData();
    for (const f of [...input.files].slice(0, 6)) fd.append('files', await compressImage(f));
    const res = await fetch('/api/user/upload', { method: 'POST', body: fd });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || (TP.lang === 'en' ? 'Upload failed' : '上传失败,请重试'));
    return d.files;
  }
  function videoEmbed(url) {
    if (!url) return '';
    let src = url;
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
    if (yt) src = 'https://www.youtube.com/embed/' + yt[1];
    const bili = url.match(/bilibili\.com\/video\/(BV\w+)/);
    if (bili) src = 'https://player.bilibili.com/player.html?bvid=' + bili[1] + '&autoplay=0';
    return `<div class="pd-map pd-tour"><iframe src="${esc(src)}" loading="lazy" allowfullscreen allow="fullscreen; encrypted-media"></iframe></div>`;
  }

  /* ---------- 广告位 ----------
     用法:页面上放 <div data-ad-slot="home_side" data-ad-limit="3"></div>,此处自动填充。
     没有在投广告时整块移除,不在页面上留空白。 */
  async function mountAdSlots() {
    for (const box of $$('[data-ad-slot]')) {
      try {
        const limit = Number(box.dataset.adLimit) || 3;
        const ads = await api(`/api/ads?placement=${encodeURIComponent(box.dataset.adSlot)}&limit=${limit}`);
        if (!ads.length) { box.remove(); continue; }
        box.innerHTML = `
          <p class="ad-label">${TP.lang === 'en' ? 'Sponsored' : '推广'}</p>
          <div class="ad-list">${ads.map(a => {
            const t = TP.L(a, 'title');
            return `<a class="ad-card" href="${esc(a.link)}" target="_blank" rel="noopener noreferrer sponsored">
              <img src="${esc(a.image)}" alt="${esc(t || '')}" loading="lazy">
              ${t ? `<span class="ad-title">${esc(t)}</span>` : ''}
            </a>`;
          }).join('')}</div>`;
      } catch (e) { box.remove(); }
    }
  }

  /* ---------- 门户主页 ---------- */
  async function pageHome() {
    if (TP.lang === 'en') {
      const set = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };
      /* 主页大图全英文 */
      const h1 = $('.hero-inner .display');
      if (h1) h1.innerHTML = '<span class="lm"><span>Land well in New Zealand</span></span><span class="lm l2"><span>One point, <span class="gold">all connected</span></span></span>';
      set('#hero-lede', 'Property, advisory, education, daily life — everything you need to land well in New Zealand, curated at one point.');
      set('#hero-cta1', 'Explore the nine sections'); set('#hero-cta2', 'Browse properties');
      /* 预约表单英文 */
      const cf = $('#contact form');
      if (cf) {
        const ph = { name: 'Full name', phone: 'Phone', email: 'Email', message: 'What would you like to talk about…' };
        Object.entries(ph).forEach(([k, v]) => { const el = cf.querySelector(`[name=${k}]`); if (el) el.placeholder = v; });
        const btn = cf.querySelector('button[type=submit]');
        if (btn) btn.textContent = 'Book a private consultation';
        /* 「咨询方式」下拉也要跟着切语言 */
        const il = cf.querySelector('#cta-intent-label');
        if (il) il.childNodes[0].nodeValue = 'How can we help?';
        cf.querySelectorAll('select[name=intent] option').forEach(o => { o.textContent = iText(INTENT_TEXT, o.value); });
      }
      set('#promise-title', 'New Zealand, handed to you at one point');
      set('#promise-p1', 'From a home to a trusted advisor, the right school, an effortless move — every step of settling in deserves to be taken seriously.');
      set('#promise-p2', 'Every provider on The Point is curated, and every “Verified” badge personally vetted. Less, but better — that is our answer to your trust.');
      set('#promise-cta', 'Become a provider');
      set('#sec-title', 'Nine worlds, one point');
      set('#sec-lede', 'Nine sections, each a world of its own. Step in and find yours.');
      set('#props-title', 'Selected homes'); set('#props-more', 'All properties');
      set('#news-title', 'The Journal'); set('#news-more-link', 'More stories');
      set('#cta-title', 'Let’s start from one point');
      set('#cta-p', 'Buying, consulting, or simply newly landed — we are here for a quiet, unhurried conversation.');
      set('#footer-slogan', 'The Point — One Point, All Connected.');
      document.title = 'THE POINT · One Point, All Connected';
    }
    const grid0 = $('#sec-grid');
    if (grid0) grid0.innerHTML = skeleton(6, 'min-height:150px');
    const d = await api('/api/home');
    const grid = $('#sec-grid');
    if (grid) grid.innerHTML = d.sections.map((s, i) => `
      <a class="sec-tile reveal in d${i % 3}" href="${TP.sectionUrl(s)}">
        <div class="st-photo" style="background-image:url('${esc(secImg(s.slug).replace('w=2000', 'w=900'))}')"></div>
        <div class="st-body">
          <span class="t-num">${String(i + 1).padStart(2, '0')}</span>
          <h3>${esc(TP.sname(s))}</h3>
          ${TP.lang === 'zh' && s.name_en ? `<p class="t-en">${esc(s.name_en)}</p>` : ''}
          <p class="s-tag">${esc(TP.L(s, 'tagline'))}</p>
          <span class="t-go">→</span>
        </div>
      </a>`).join('');
    const show = sel => { const el = $(sel); if (el) el.style.display = ''; };
    if (d.featured_posts.length) { $('#feat-grid').innerHTML = d.featured_posts.map(postCard).join(''); show('#featured-sec'); }
    if (d.vendors.length) { $('#vendor-strip').innerHTML = d.vendors.map(vendorCard).join(''); show('#vendors-sec'); }
    if (d.properties.length) { $('#prop-grid').innerHTML = d.properties.map(propCard).join(''); show('#props-sec'); }
    if (d.news.length) {
      $('#home-news').innerHTML = d.news.map(n => `
        <article class="item reveal in" onclick="location.href='article.html?id=${n.id}'" style="cursor:pointer">
          <div class="nthumb" style="background-image:url('${esc(n.image || 'media/logo.svg')}')"></div>
          <div><h3>${esc(TP.L(n, 'title'))}</h3><p class="excerpt">${esc(TP.L(n, 'excerpt'))}</p>
          <div class="byline"><span class="bp">The Point</span><span>${esc((n.published_at || '').slice(0, 10))}</span></div></div>
        </article>`).join('');
      show('#news-sec');
    }
  }

  /* ---------- 通用板块页 ---------- */
  const SEC_IMG = {
    property: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=2000&q=80',  // 现代宅邸(与置业页同源)
    advisory: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=2000&q=80',  // 案头文件(站内已用)
    education: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=2000&q=80', // 协作学习(站内已用,确定可显示)
    living: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=2000&q=80',    // 高端室内(站内已用)
    market: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=2000&q=80',    // 宅邸泳池(站内已用)
    local: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=2000&q=80',     // 城市天际线暮色
    career: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=2000&q=80',    // 极简办公
    culture: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=2000&q=80',   // 图书馆书墙
    news: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=2000&q=80',      // 报纸
    trades: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=2000&q=80'     // 师傅实地作业(洗窗/水电/建筑)
  };
  /* 这张表是按 slug 写死的,而板块可以在后台随时新增 ——
     没有对应条目时必须有兜底,否则新板块的页面顶部会是一片空白。 */
  const secImg = slug => SEC_IMG[slug] || SEC_IMG.living;
  async function pageSection() {
    const slug = param('s');
    const secs = await TP.sections();
    const sec = secs.find(x => x.slug === slug);
    if (!sec) { location.href = 'index.html'; return; }
    if (sec.slug === 'property') { location.href = 'properties.html'; return; }
    if (sec.slug === 'news') { location.href = 'news.html'; return; }
    /* 页面主标题:中文「一点教育 / 一点集市…」(与「一点房产」同款),EN 用英文名 */
    const secTitle = TP.lang === 'zh' ? `一点${sec.name_zh}` : (sec.name_en || sec.name_zh);
    setMeta(`${secTitle} · THE POINT 一点`, TP.L(sec, 'tagline'));
    $('#sec-name').textContent = secTitle;
    $('#sec-eyebrow').textContent = sec.name_en || 'The Point';
    $('#sec-tagline').textContent = TP.L(sec, 'tagline');
    /* 板块顶部大图(与置业 page-top--banner 同款风格) */
    const banner = $('#sec-banner');
    if (banner) banner.style.setProperty('--img', `url('${secImg(slug)}')`);
    /* 入驻申请入口:集市引导发布闲置,其余板块引导入驻 */
    const joinBtn = $('#sec-join');
    if (joinBtn) {
      const en = TP.lang === 'en';
      if (slug === 'market') {
        joinBtn.href = 'me.html';
        joinBtn.textContent = en ? 'Sell your pre-loved items →' : '发布我的闲置 →';
      } else {
        joinBtn.href = 'join.html?s=' + encodeURIComponent(slug);
        joinBtn.textContent = en
          ? `Become a ${sec.name_en || ''} provider →`
          : `申请入驻「${sec.name_zh}」板块 →`;
      }
      joinBtn.style.display = '';
    }
    let cat = '', pageNo = 1;
    const tabs = $('#cat-tabs'), moreBtn = $('#sec-more');
    tabs.innerHTML = `<button class="svc-tab on" data-id="">${TP.t('all')}</button>` +
      sec.categories.map(c => `<button class="svc-tab" data-id="${c.id}">${esc(catN(c))}</button>`).join('');
    tabs.addEventListener('click', e => {
      const b = e.target.closest('.svc-tab'); if (!b) return;
      $$('.svc-tab', tabs).forEach(x => x.classList.remove('on')); b.classList.add('on');
      cat = b.dataset.id; pageNo = 1; loadVendors(); loadPosts(true);
    });
    async function loadVendors() {
      const vs = await api(`/api/vendors?section=${encodeURIComponent(slug)}${cat ? '&category_id=' + cat : ''}`);
      $('#sec-vendors-wrap').style.display = vs.length ? '' : 'none';
      $('#sec-vendors').innerHTML = vs.map(vendorCard).join('');
    }
    async function loadPosts(reset) {
      if (reset) $('#sec-posts').innerHTML = skeleton(3);
      const qs = new URLSearchParams({ section: slug, page: pageNo, limit: 12 });
      if (cat) qs.set('category_id', cat);
      const d = await api('/api/posts?' + qs);
      const html = d.items.map(postCard).join('');
      if (reset) {
        const isMarket = slug === 'market';
        $('#sec-posts').innerHTML = html || emptyBox(TP.t('empty'),
          isMarket ? `<a class="btn btn--sm" href="me.html">${TP.lang === 'en' ? 'Be the first to post' : '来发布第一条闲置'}</a>` : '');
      } else $('#sec-posts').insertAdjacentHTML('beforeend', html);
      moreBtn.style.display = pageNo * d.limit < d.total ? '' : 'none';
    }
    moreBtn.addEventListener('click', e => { e.preventDefault(); pageNo++; loadPosts(false); });
    loadVendors(); loadPosts(true);
    /* 文化页专属:「一点镜头」视频区(后台「视频管理」维护,置顶排最前) */
    if (slug === 'culture') loadCultureVideos();
    async function loadCultureVideos() {
      let d;
      try { d = await api('/api/videos?limit=12'); } catch (e) { return; }
      if (!d.items.length) return;
      const en = TP.lang === 'en';
      $('#sec-posts-wrap').insertAdjacentHTML('beforebegin', `
        <div id="sec-videos-wrap" style="margin-bottom:44px">
          <p class="eyebrow">${en ? 'The Point Lens · Videos' : '一点镜头 · 视频'}</p>
          <div class="divider"></div>
          <div class="lgrid" id="sec-videos">${d.items.map((v, i) => `
            <article class="lcard reveal in d${i % 3}" data-video="${esc(v.video_id)}" data-vtitle="${esc(en ? (v.title_en || v.title) : v.title)}" style="cursor:pointer">
              <div class="ltop"><span>${esc(v.category || (en ? 'Video' : '视频'))}</span><b style="font-size:13px;color:var(--ink-3)">${esc((v.published_at || '').slice(0, 10))}</b></div>
              <div class="lphoto" style="background-image:url('${esc(v.cover)}');position:relative">
                <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
                  <span style="width:54px;height:54px;border-radius:50%;background:rgba(32,31,27,.72);display:flex;align-items:center;justify-content:center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#EFE9DA"><path d="M8 5v14l11-7z"/></svg>
                  </span>
                </span>
              </div>
              <div class="lbody"><div class="lrow"><h3 style="font-size:18px">${esc(en ? (v.title_en || v.title) : v.title)}</h3></div></div>
            </article>`).join('')}</div>
        </div>`);
      $('#sec-videos').addEventListener('click', e => {
        const card = e.target.closest('[data-video]');
        if (card && card.dataset.video) openVideoModal(card.dataset.video, card.dataset.vtitle);
      });
    }
    function openVideoModal(videoId, title) {
      let bg = $('#video-modal-bg');
      if (!bg) {
        bg = document.createElement('div');
        bg.id = 'video-modal-bg';
        bg.style.cssText = 'position:fixed;inset:0;background:rgba(20,19,16,.88);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px';
        bg.innerHTML = `<div style="width:960px;max-width:100%">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <span id="vm-title" style="color:#EFE9DA;font-family:var(--serif);font-size:17px;letter-spacing:.04em"></span>
            <button id="vm-close" style="background:none;border:0;color:#EFE9DA;font-size:30px;cursor:pointer;line-height:1">&times;</button>
          </div>
          <div style="position:relative;padding-top:56.25%;background:#000">
            <iframe id="vm-frame" style="position:absolute;inset:0;width:100%;height:100%;border:0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe>
          </div>
        </div>`;
        document.body.appendChild(bg);
        const close = () => { bg.style.display = 'none'; $('#vm-frame').src = ''; };
        bg.addEventListener('click', e => { if (e.target === bg) close(); });
        $('#vm-close').addEventListener('click', close);
        document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
      }
      bg.style.display = 'flex';
      $('#vm-title').textContent = title || '';
      $('#vm-frame').src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    }
  }

  /* ---------- 内容详情 ---------- */
  async function pagePost() {
    const box = $('#post-detail');
    box.innerHTML = skelText;
    let p;
    try { p = await api('/api/posts/' + param('id')); }
    catch (e) { box.innerHTML = emptyBox(esc(e.message), `<a class="btn btn--sm" href="index.html">${TP.t('home')}</a>`); return; }
    setMeta(`${TP.L(p, 'title')} · THE POINT 一点`, TP.L(p, 'content') || TP.L(p, 'title'), (p.images || [])[0]);
    const imgs = p.images || [];
    const contacts = [
      p.contact_name ? `<div class="arow"><b style="font-size:13px">${TP.lang === 'en' ? 'Name' : '称呼'}</b><span>${esc(p.contact_name)}</span></div>` : '',
      p.contact_phone ? `<div class="arow">${ICON.tel}<a href="tel:${esc(p.contact_phone.replace(/\s/g, ''))}">${esc(p.contact_phone)}</a></div>` : '',
      p.contact_wechat ? `<div class="arow"><b style="font-size:13px">${wxLabel()}</b><span>${esc(p.contact_wechat)}</span></div>` : '',
      p.contact_email ? `<div class="arow">${ICON.mail}<a href="mailto:${esc(p.contact_email)}">${esc(p.contact_email)}</a></div>` : ''
    ].filter(Boolean).join('');
    box.innerHTML = `
      ${imgs.length ? `<div class="pd-gallery">
        <div class="pd-main" id="pd-main" style="background-image:url('${esc(imgs[0])}')"></div>
        ${imgs.length > 1 ? `<div class="pd-thumbs">${imgs.map((im, i) =>
          `<div class="pd-thumb${i === 0 ? ' on' : ''}" data-src="${esc(im)}" style="background-image:url('${esc(im)}')"></div>`).join('')}</div>` : ''}
      </div>` : ''}
      <div class="pd-layout">
        <div class="pd-info">
          <div class="ltop" style="padding:0 0 14px">
            <span>${esc(typeLabel(p.type))}${p.section ? ' · ' + esc(TP.sname(p.section)) : ''}${p.category ? ' · ' + esc(catN(p.category)) : ''}</span>
            ${p.price_label ? `<b style="font-size:22px">${esc(priceL(p.price_label))}</b>` : ''}
          </div>
          <h1 class="section-title" style="margin-bottom:6px">${esc(TP.L(p, 'title'))}</h1>
          <p class="laddr" style="font-size:15px;margin-bottom:6px">
            ${p.location ? esc(p.location) + ' · ' : ''}${p.event_time ? esc(p.event_time) + ' · ' : ''}${esc((p.published_at || '').slice(0, 10))}
          </p>
          <div class="divider"></div>
          ${videoEmbed(p.video_url)}
          <div class="pd-desc article-content">${TPContent.render(TP.L(p, 'content') || '', p.content_format)}</div>
        </div>
        <aside class="pd-side">
          ${p.vendor ? `<div class="pd-agent">
            ${p.vendor.logo ? `<div class="avatar" style="background-image:url('${esc(p.vendor.logo)}')"></div>` : ''}
            <span class="cat">${p.vendor.verified ? `✓ ${TP.t('verified')}` : (TP.lang === 'en' ? 'Provider' : '入驻方')}</span>
            <h3><a href="vendor.html?id=${p.vendor.id}">${esc(TP.L(p.vendor, 'name'))}</a></h3>
            <a class="btn btn--ghost" style="margin-top:14px" href="vendor.html?id=${p.vendor.id}">${TP.t('viewHome')}</a>
          </div>` : ''}
          ${contacts ? `<div class="pd-enquiry"><h4>${TP.t('contactInfo')}</h4>${contacts}</div>`
            : (p.contact_locked ? `<div class="pd-enquiry"><h4>${TP.t('contactInfo')}</h4>${lockCTA()}</div>` : '')}
        </aside>
      </div>`;
    $$('.pd-thumb', box).forEach(t => t.addEventListener('click', () => {
      $('#pd-main').style.backgroundImage = `url('${t.dataset.src}')`;
      $$('.pd-thumb', box).forEach(x => x.classList.remove('on'));
      t.classList.add('on');
    }));
    reveal(box);
  }

  /* ---------- 入驻方主页 ---------- */
  async function pageVendor() {
    const box = $('#vendor-detail');
    box.innerHTML = skelText;
    let v;
    try { v = await api('/api/vendors/' + param('id')); }
    catch (e) { box.innerHTML = emptyBox(esc(e.message), `<a class="btn btn--sm" href="index.html">${TP.t('home')}</a>`); return; }
    setMeta(`${TP.L(v, 'name')} · THE POINT 一点`, TP.L(v, 'tagline') || TP.L(v, 'intro'), v.logo);
    box.innerHTML = `
      <div class="ex-head">
        ${v.logo ? `<div class="avatar" style="background-image:url('${esc(v.logo)}')"></div>` : `<div class="avatar vlogo--empty">${esc((TP.L(v, 'name') || '?').slice(0, 1))}</div>`}
        <div class="ex-meta">
          <span class="cat">${v.verified ? `✓ ${TP.t('verified')}` : (TP.lang === 'en' ? 'Provider' : '一点入驻方')}${v.featured ? ' · ★' : ''}</span>
          <h1 class="section-title">${esc(TP.L(v, 'name'))}</h1>
          ${TP.L(v, 'tagline') ? `<p class="lead-dim">${esc(TP.L(v, 'tagline'))}</p>` : ''}
          <div class="ex-contacts">
            ${v.email ? `<div class="arow">${ICON.mail}<a href="mailto:${esc(v.email)}">${esc(v.email)}</a></div>` : ''}
            ${v.phone ? `<div class="arow">${ICON.tel}<a href="tel:${esc(v.phone.replace(/\s/g, ''))}">${esc(v.phone)}</a></div>` : ''}
            ${v.wechat ? `<div class="arow"><b style="font-size:13px">${wxLabel()}</b><span>${esc(v.wechat)}</span></div>` : ''}
            ${v.website ? `<div class="arow"><a href="${esc(v.website)}" target="_blank" rel="noopener">${TP.lang === 'en' ? 'Website' : '官网'} →</a></div>` : ''}
            ${v.contact_locked ? lockCTA() : ''}
          </div>
          ${TP.L(v, 'intro') ? `<div class="lead-dim" style="max-width:70ch;margin-top:14px">${esc(TP.L(v, 'intro')).split(/\n+/).map(t => `<p>${t}</p>`).join('')}</div>` : ''}
        </div>
      </div>
      ${(v.photos || []).length ? `<div class="pd-thumbs" style="margin-top:24px">${v.photos.map(ph =>
        `<div class="pd-thumb" style="background-image:url('${esc(ph)}');cursor:default"></div>`).join('')}</div>` : ''}
      <div class="ex-section">
        <p class="eyebrow line">Posts</p>
        <h2 class="section-title">${TP.lang === 'en' ? 'Latest from ' + esc(TP.L(v, 'name')) : 'TA 的发布'} <span style="color:var(--ink-3);font-size:60%">${v.posts.length}</span></h2>
        <div class="divider"></div>
        <div class="lgrid">${v.posts.length ? v.posts.map(postCard).join('') : emptyBox()}</div>
      </div>
      <div class="ex-section pd-enquiry" style="max-width:640px">
        <h4>${TP.t('leaveMsg')}</h4>
        <form data-api="/api/enquiries" data-intent-button>
          <input type="hidden" name="type" value="vendor">
          <input type="hidden" name="vendor_id" value="${v.id}">
          ${intentSelect(['question','callback'])}
          <input name="name" placeholder="${TP.lang === 'en' ? 'Full name' : '姓名（请填全名）'}" required minlength="2">
          <input name="phone" placeholder="${TP.lang === 'en' ? 'Phone' : '联系电话'}">
          <input name="email" type="email" placeholder="${TP.lang === 'en' ? 'Email' : '邮箱'}">
          ${intentNoteEl}
          <textarea name="message" rows="4" placeholder="${TP.lang === 'en' ? 'Your message…' : '想咨询些什么…'}" required></textarea>
          <button class="btn btn--solid" type="submit">${TP.t('send')}</button>
        </form>
      </div>`;
    bindForms(box);
    reveal(box);
  }

  /* ---------- 全站搜索 ---------- */
  function newsItem(n) {
    return `<article class="item reveal in" onclick="location.href='article.html?id=${n.id}'" style="cursor:pointer">
      <div class="nthumb" style="background-image:url('${esc(n.image || 'media/logo.svg')}')"></div>
      <div><h3>${esc(TP.L(n, 'title'))}</h3><p class="excerpt">${esc(TP.L(n, 'excerpt'))}</p>
      <div class="byline"><span class="bp">The Point</span><span>${esc((n.published_at || '').slice(0, 10))}</span></div></div>
    </article>`;
  }
  async function pageSearch() {
    const form = $('#search-form'), input = $('#search-input'), box = $('#search-results');
    if (TP.lang === 'en') {
      $('#search-title').textContent = TP.t('searchSite');
      input.placeholder = TP.t('searchPh');
      $('#search-btn').textContent = 'Search';
    }
    async function run(q) {
      if (!q) { box.innerHTML = ''; return; }
      history.replaceState(null, '', 'search.html?q=' + encodeURIComponent(q));
      box.innerHTML = `<div class="lgrid">${skeleton(3)}</div>`;
      const d = await api('/api/search?q=' + encodeURIComponent(q));
      const head = (k, n) => `<p class="eyebrow" style="margin-top:38px">${TP.t('results_' + k)} <span style="color:var(--ink-3)">· ${n}</span></p><div class="divider"></div>`;
      const parts = [];
      if (d.properties.length) parts.push(head('properties', d.properties.length) + `<div class="lgrid">${d.properties.map(propCard).join('')}</div>`);
      if (d.vendors.length) parts.push(head('vendors', d.vendors.length) + `<div class="vgrid" style="margin-top:0">${d.vendors.map(vendorCard).join('')}</div>`);
      if (d.posts.length) parts.push(head('posts', d.posts.length) + `<div class="lgrid">${d.posts.map(postCard).join('')}</div>`);
      if (d.news.length) parts.push(head('news', d.news.length) + `<div class="news-list" style="margin-top:20px">${d.news.map(newsItem).join('')}</div>`);
      box.innerHTML = parts.length ? parts.join('') : emptyBox(TP.t('noResults'));
    }
    form.addEventListener('submit', e => { e.preventDefault(); run(input.value.trim()); });
    const q0 = param('q');
    if (q0) { input.value = q0; run(q0); }
  }

  /* ---------- 登录 / 注册 ---------- */
  function pageAccount() {
    const err = $('#auth-err');
    const lf = $('#login-form'), rf = $('#register-form');
    /* EN 模式:表单全英文 */
    if (TP.lang === 'en') {
      document.title = 'Sign in / Join · THE POINT';
      $('#tab-login').textContent = 'Sign in';
      $('#tab-register').textContent = 'Join';
      const setFlds = (form, labels) => $$('.fld > span', form).forEach((s, i) => { if (labels[i]) s.textContent = labels[i]; });
      setFlds(lf, ['Email', 'Password']);
      setFlds(rf, ['Name', 'Email', 'Phone (optional)', 'Password (min 6 characters)']);
      const ph = (form, name, v) => { const el = form.querySelector(`[name=${name}]`); if (el) el.placeholder = v; };
      ph(rf, 'name', 'Your name');
      ph(rf, 'password', 'At least 6 characters');
      lf.querySelector('button[type=submit]').textContent = 'Sign in';
      rf.querySelector('button[type=submit]').textContent = 'Create account';
      const note = $('.auth-note');
      if (note) note.innerHTML = 'Sign up to post in the Marketplace. Businesses and advisors can <a href="join.html">apply to become a provider</a>.';
      $$('.pw-eye').forEach(b => b.setAttribute('aria-label', 'Show password'));
    }
    /* 密码可见性切换(小眼睛) */
    $$('.pw-wrap').forEach(w => {
      const inp = $('input', w), btn = $('.pw-eye', w);
      if (!inp || !btn) return;
      btn.addEventListener('click', e => {
        e.preventDefault();
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        btn.classList.toggle('on', show);
      });
    });
    $('#tab-login').addEventListener('click', () => { lf.style.display = ''; rf.style.display = 'none'; $('#tab-login').classList.add('on'); $('#tab-register').classList.remove('on'); err.textContent = ''; });
    $('#tab-register').addEventListener('click', () => { rf.style.display = ''; lf.style.display = 'none'; $('#tab-register').classList.add('on'); $('#tab-login').classList.remove('on'); err.textContent = ''; });
    if (param('r') === '1') $('#tab-register').click();
    /* 忘记密码:就地展开一个小表单,不跳页 */
    const fgBtn = $('#forgot-link');
    if (fgBtn) fgBtn.addEventListener('click', ev => {
      ev.preventDefault();
      const box = $('#forgot-box');
      const open = box.style.display === 'none' || !box.style.display;
      box.style.display = open ? 'block' : 'none';
      if (open) {
        const em = $('[name=email]', lf).value;
        if (em) $('[name=email]', box).value = em;
        $('[name=email]', box).focus();
      }
    });
    const fgForm = $('#forgot-form');
    if (fgForm) fgForm.addEventListener('submit', async ev => {
      ev.preventDefault(); err.textContent = '';
      const btn = $('button[type=submit]', fgForm);
      btn.disabled = true;
      try {
        const result=await post('/api/auth/forgot', { email: $('[name=email]', fgForm).value.trim() });
        if(result.delivery_available===false){
          $('#forgot-box').innerHTML=`<p class="auth-note">${TP.lang==='en'?'Email recovery is not enabled yet. Please contact The Point for help.':'邮件找回暂未启用，请联系一点客服协助重置密码。'} <a href="mailto:enquiry@thepoint.co.nz">enquiry@thepoint.co.nz</a></p>`;
          return;
        }
      } catch (ex) { err.textContent=TP.lang==='en'?'Could not submit. Please try again.':'提交失败，请稍后重试。';btn.disabled=false;return; }
      /* 无论邮箱是否注册过都显示同一句话,避免泄露哪些邮箱存在 */
      $('#forgot-box').innerHTML = `<p style="color:var(--ink-3);font-size:13px;line-height:1.7;margin:0">${
        TP.lang === 'en'
          ? 'If that email is registered, we will attempt to send a reset link. It expires in one hour. Please also check spam, or contact us if it does not arrive.'
          : '如果该邮箱已注册，我们会尝试发送重置链接，1 小时内有效。请同时检查垃圾邮件；未收到时可联系平台协助。'}</p>`;
    });

    const go = () => {
      const back = param('back') || 'me.html';
      const allowed = /^(?:index|me|join|post|vendor|property|properties|section|article|news|experts|expert|services|partners|search)\.html(?:[?#][^\\\s]*)?$/;
      location.href = allowed.test(back) ? back : 'me.html';
    };
    lf.addEventListener('submit', async e => {
      e.preventDefault(); err.textContent = '';
      const body = {}; new FormData(lf).forEach((v, k) => body[k] = v);
      try { await post('/api/auth/login', body); go(); } catch (ex) { err.textContent = ex.message; }
    });
    rf.addEventListener('submit', async e => {
      e.preventDefault(); err.textContent = '';
      const body = {}; new FormData(rf).forEach((v, k) => body[k] = v);
      try { await post('/api/auth/register', body); go(); } catch (ex) { err.textContent = ex.message; }
    });
    return Promise.resolve();
  }

  /* ---------- 发布表单(个人中心共用) ---------- */
  function postFormHTML(me, secs, p) {
    const isVendor = me.vendor && me.vendor.status === 'approved';
    const types = isVendor ? ['market', 'service', 'update', 'event', 'job'] : ['market'];
    const marketOnly = !isVendor;
    const secOpts = secs.map(s => `<option value="${s.id}" ${p && p.section_id === s.id ? 'selected' : ''}>${esc(TP.sname(s))}</option>`).join('');
    return `<form id="post-form" class="me-form">
      ${p ? `<input type="hidden" name="_id" value="${p.id}">` : ''}
      <div class="frow">
        <label>${TP.lang === 'en' ? 'Type' : '类型'}
          <select name="type" ${p ? 'disabled' : ''}>${types.map(t => `<option value="${t}" ${p && p.type === t ? 'selected' : ''}>${typeLabel(t)}</option>`).join('')}</select>
        </label>
        <label>${TP.lang === 'en' ? 'Section' : '板块'}<select name="section_id" required>${marketOnly
          ? secs.filter(s => s.slug === 'market').map(s => `<option value="${s.id}">${esc(TP.sname(s))}</option>`).join('')
          : secs.filter(s => s.slug !== 'news').map(s => `<option value="${s.id}" ${p && p.section_id === s.id ? 'selected' : ''}>${esc(TP.sname(s))}</option>`).join('')}</select></label>
        <label>${TP.lang === 'en' ? 'Category' : '分类'}<select name="category_id"></select></label>
      </div>
      <div class="frow">
        <label>标题(中文)<input name="title_zh" value="${esc(p ? p.title_zh : '')}" required></label>
        <label>Title (EN)<input name="title_en" value="${esc(p ? p.title_en : '')}"></label>
      </div>
      <label>内容(中文)<textarea name="content_zh" rows="5">${esc(p ? p.content_zh : '')}</textarea></label>
      <label>Content (EN)<textarea name="content_en" rows="3">${esc(p ? p.content_en : '')}</textarea></label>
      <div class="frow">
        <label>${TP.lang === 'en' ? 'Price label' : '价格显示'}<input name="price_label" value="${esc(p ? p.price_label : '')}" placeholder="$80 / 面议"></label>
        <label>${TP.lang === 'en' ? 'Price value' : '价格数值'}<input name="price_value" type="number" value="${p && p.price_value != null ? p.price_value : ''}"></label>
        <label>${TP.t('location')}<input name="location" value="${esc(p ? p.location : '')}" placeholder="Albany, Auckland"></label>
      </div>
      <div class="frow">
        <label>${TP.lang === 'en' ? 'Event time' : '活动时间'}<input name="event_time" value="${esc(p ? p.event_time : '')}" placeholder="2026-08-01 14:00"></label>
        <label>${TP.lang === 'en' ? 'Video URL' : '视频链接(YouTube 等)'}<input name="video_url" value="${esc(p ? p.video_url : '')}"></label>
      </div>
      <div class="frow">
        <label>${TP.lang === 'en' ? 'Contact phone' : '联系电话'}<input name="contact_phone" value="${esc(p ? p.contact_phone : '')}"></label>
        <label>微信<input name="contact_wechat" value="${esc(p ? p.contact_wechat : '')}"></label>
        <label>${TP.lang === 'en' ? 'Contact email' : '联系邮箱'}<input name="contact_email" value="${esc(p ? p.contact_email : '')}"></label>
      </div>
      <label>${TP.lang === 'en' ? 'Images (up to 6)' : '图片(最多 6 张,第一张为封面)'}<input type="file" name="files" accept="image/*" multiple></label>
      <p class="err" id="post-err"></p>
      <div style="display:flex;gap:12px">
        <button class="btn btn--solid" type="submit">${p ? (TP.lang === 'en' ? 'Save (re-review)' : '保存(重新审核)') : TP.t('publish')}</button>
        <button class="btn" type="button" id="post-cancel">${TP.lang === 'en' ? 'Cancel' : '取消'}</button>
      </div>
      <p class="auth-note">${TP.lang === 'en' ? 'All public content is reviewed. Updates to a live post are reviewed separately while the original stays live.' : '所有公开内容均需审核；修改已发布内容时原版本继续展示，审核通过后再替换。'}</p>
    </form>`;
  }
  function bindCategorySelect(form, secs, selected) {
    const secSel = form.querySelector('[name=section_id]');
    const catSel = form.querySelector('[name=category_id]');
    const fill = () => {
      const s = secs.find(x => x.id === Number(secSel.value));
      catSel.innerHTML = `<option value="">—</option>` +
        ((s && s.categories) || []).map(c => `<option value="${c.id}" ${selected === c.id ? 'selected' : ''}>${esc(catN(c))}</option>`).join('');
    };
    secSel.addEventListener('change', fill);
    fill();
  }

  /* ---------- 入驻申请表单(join / me 共用) ---------- */
  function vendorFormHTML(secs, v, mode) {
    return `<form id="vendor-form" class="me-form">
      <div class="frow">
        <label>名称(中文)*<input name="name_zh" value="${esc(v ? v.name_zh : '')}" required></label>
        <label>Name (EN)<input name="name_en" value="${esc(v ? v.name_en : '')}"></label>
      </div>
      <div class="frow">
        <label>所属板块*<select name="section_id" required>${secs.filter(s => s.slug !== 'market' && s.slug !== 'news').map(s => `<option value="${s.id}" ${v && v.section_id === s.id ? 'selected' : ''}>${esc(TP.sname(s))}</option>`).join('')}</select></label>
        <label>分类<select name="category_id"></select></label>
      </div>
      <div class="frow">
        <label>一句话介绍(中文)<input name="tagline_zh" value="${esc(v ? v.tagline_zh : '')}"></label>
        <label>Tagline (EN)<input name="tagline_en" value="${esc(v ? v.tagline_en : '')}"></label>
      </div>
      <label>详细介绍(中文)<textarea name="intro_zh" rows="5">${esc(v ? v.intro_zh : '')}</textarea></label>
      <label>Introduction (EN)<textarea name="intro_en" rows="3">${esc(v ? v.intro_en : '')}</textarea></label>
      <div class="frow">
        <label>电话<input name="phone" value="${esc(v ? v.phone : '')}"></label>
        <label>邮箱<input name="email" value="${esc(v ? v.email : '')}"></label>
        <label>微信<input name="wechat" value="${esc(v ? v.wechat : '')}"></label>
      </div>
      <label>官网<input name="website" value="${esc(v ? v.website : '')}" placeholder="https://"></label>
      <label>Logo / 头像<input type="file" name="logo_file" accept="image/*"></label>
      <label>展示图片(最多 6 张)<input type="file" name="photo_files" accept="image/*" multiple></label>
      ${mode === 'apply' ? `<label>申请留言(给审核团队)<textarea name="apply_message" rows="3" placeholder="简单介绍您的业务与资质…">${esc(v ? v.apply_message || '' : '')}</textarea></label>` : ''}
      <p class="err" id="vendor-err"></p>
      <button class="btn btn--solid" type="submit">${mode === 'apply' ? '提交入驻申请' : '提交资料修改'}</button>
      <p class="auth-note">${mode==='apply'?'提交后由一点官方审核，通过后即获得您的专属主页。':'资料修改单独审核，原主页继续展示；未选择新图片时保留现有图片。'}</p>
    </form>`;
  }
  async function submitVendorForm(form, mode) {
    const err = form.querySelector('#vendor-err');
    err.textContent = '';
    const body = {};
    new FormData(form).forEach((v, k) => { if (k !== 'logo_file' && k !== 'photo_files') body[k] = v; });
    try {
      const logos = await uploadFiles(form.querySelector('[name=logo_file]'));
      if (logos.length) body.logo = logos[0];
      const photos = await uploadFiles(form.querySelector('[name=photo_files]'));
      if (photos.length) body.photos = photos;
      if (mode === 'apply') return await post('/api/vendor/apply', body);
      return await api('/api/vendor/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (ex) { err.textContent = ex.message; return false; }
  }

  /* ---------- 我要上一点 ---------- */
  async function pageJoin() {
    const root = $('#join-root');
    const u = await TP.user();
    const secs = await TP.sections();
    if (!u) {
      root.innerHTML = `<div class="auth-card" style="text-align:center">
        <p style="margin-bottom:18px">${TP.lang === 'en' ? 'Please sign in before applying.' : '申请入驻前,请先登录或注册一点账号。'}</p>
        <a class="btn btn--solid" href="account.html?back=join.html">${TP.t('login')}</a></div>`;
      return;
    }
    if (u.vendor && u.vendor.status === 'pending') {
      root.innerHTML = `<div class="auth-card" style="text-align:center"><p>您的入驻申请正在审核中,请耐心等待。</p><a class="btn" style="margin-top:16px" href="me.html">${TP.t('me')}</a></div>`;
      return;
    }
    if (u.vendor && u.vendor.status === 'approved') {
      root.innerHTML = `<div class="auth-card" style="text-align:center"><p>您已是一点入驻方。</p>
        <div style="display:flex;gap:12px;justify-content:center;margin-top:16px">
        <a class="btn btn--solid" href="vendor.html?id=${u.vendor.id}">${TP.t('viewHome')}</a>
        <a class="btn" href="me.html">${TP.t('me')}</a></div></div>`;
      return;
    }
    let v = null;
    if (u.vendor) { try { v = await api('/api/vendor/me'); } catch (e) {} }
    root.innerHTML = (v && v.status === 'rejected' && v.review_note ? `<p class="err" style="margin-bottom:14px">上次申请未通过:${esc(v.review_note)}(可修改后重新提交)</p>` : '') + vendorFormHTML(secs, v, 'apply');
    const form = $('#vendor-form');
    /* 从板块页进入时预选板块(join.html?s=slug) */
    const preSlug = param('s');
    if (preSlug && !v) {
      const pre = secs.find(x => x.slug === preSlug);
      if (pre) form.querySelector('[name=section_id]').value = pre.id;
    }
    bindCategorySelect(form, secs, v ? v.category_id : null);
    bindFilePreviews(form);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (await submitVendorForm(form, 'apply')) {
        root.innerHTML = `<div class="auth-card" style="text-align:center"><p>申请已提交,一点官方将尽快审核。</p><a class="btn" style="margin-top:16px" href="me.html">${TP.t('me')}</a></div>`;
      }
    });
  }

  /* ---------- 重置密码(邮件链接落地页) ---------- */
  async function pageReset() {
    const root = $('#reset-root');
    const en = TP.lang === 'en';
    const token = param('token') || '';
    const bad = msg => {
      root.innerHTML = `<h2 style="font-family:var(--serif);font-size:22px;margin-bottom:12px">${en ? 'Link expired' : '链接已失效'}</h2>
        <p style="color:var(--ink-3);line-height:1.7">${msg}</p>
        <a class="btn btn--solid" href="account.html" style="width:100%;justify-content:center;margin-top:20px">${en ? 'Back to sign in' : '返回登录'}</a>`;
    };
    if (!token) return bad(en ? 'This page needs a reset link from your email.' : '请通过邮件里的链接打开本页面。');
    let chk;
    try { chk = await api('/api/auth/reset-check?token=' + encodeURIComponent(token)); }
    catch (e) { return bad(en ? 'Could not verify the link. Please try again.' : '无法校验链接,请稍后重试。'); }
    if (!chk.valid) {
      return bad(en
        ? 'This reset link is invalid or has expired (links last one hour). Please request a new one.'
        : '该重置链接无效或已过期(链接有效期为 1 小时),请重新申请一次。');
    }
    root.innerHTML = `
      <h2 style="font-family:var(--serif);font-size:22px;margin-bottom:6px">${en ? 'Set a new password' : '设置新密码'}</h2>
      <p style="color:var(--ink-3);font-size:13px;margin-bottom:20px">${en
        ? 'Choose a new password for your account. You will be signed out everywhere else.'
        : '为您的账号设置新密码。设置成功后,其它设备上的登录会同时失效。'}</p>
      <p class="err" id="reset-err"></p>
      <form id="reset-form">
        <label class="fld"><span>${en ? 'New password' : '新密码'}</span>
          <input name="new_password" type="password" required minlength="6" autocomplete="new-password"
                 placeholder="${en ? 'At least 6 characters' : '至少 6 位'}"></label>
        <label class="fld"><span>${en ? 'Confirm password' : '再输一次'}</span>
          <input name="confirm" type="password" required minlength="6" autocomplete="new-password"
                 placeholder="${en ? 'Repeat the password' : '重复上面的密码'}"></label>
        <button class="btn btn--solid" type="submit" style="width:100%;justify-content:center;margin-top:6px">${en ? 'Save new password' : '保存新密码'}</button>
      </form>`;
    const err = $('#reset-err');
    $('#reset-form').addEventListener('submit', async e => {
      e.preventDefault(); err.textContent = '';
      const f = e.target;
      if (f.new_password.value !== f.confirm.value) {
        err.textContent = en ? 'The two passwords do not match.' : '两次输入的密码不一致。';
        return;
      }
      const btn = $('button[type=submit]', f);
      btn.disabled = true;
      try {
        await post('/api/auth/reset', { token, new_password: f.new_password.value });
        root.innerHTML = `<h2 style="font-family:var(--serif);font-size:22px;margin-bottom:12px">${en ? 'Password updated' : '密码已更新'}</h2>
          <p style="color:var(--ink-3);line-height:1.7">${en ? 'You can now sign in with your new password.' : '现在可以用新密码登录了。'}</p>
          <a class="btn btn--solid" href="account.html" style="width:100%;justify-content:center;margin-top:20px">${en ? 'Sign in' : '去登录'}</a>`;
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
      }
    });
  }

  /* ---------- 个人中心 ---------- */
  async function pageMe() {
    const root = $('#me-root');
    let me;
    try { me = await api('/api/auth/me'); }
    catch (e) { location.href = 'account.html'; return; }
    const secs = await TP.sections();
    const vstatus = me.vendor ? me.vendor.status : null;
    const en = TP.lang === 'en';
    /* 这个账号有没有被后台绑定到某位专家 —— 绑定了才出现「我的专家资料」 */
    let agentLink = { linked: false };
    try { agentLink = await api('/api/my/agent'); } catch (e) {}

    root.innerHTML = `
      <div class="me-head">
        <div>
          <p class="eyebrow line">${en ? 'My Point' : 'My Point'}</p>
          <h1 class="section-title">${esc(me.name || me.email)}</h1>
          <p class="lead-dim" style="font-size:14px">${esc(me.email)}
            ${vstatus === 'approved' ? ` · <span class="vbadge">${me.vendor.verified ? '✓ ' + TP.t('verified') : (en ? 'Provider' : '入驻方')}</span>` : ''}
            ${vstatus === 'pending' ? ` · <span class="stag stag--pending">${en ? 'Provider application in review' : '入驻审核中'}</span>` : ''}
          </p>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn--solid btn--sm" id="btn-new-post">＋ ${TP.t('newPost')}</button>
          <button class="btn btn--sm" id="btn-favorites">${en ? "My saved homes" : "我的收藏"}</button>
          <button class="btn btn--sm" id="btn-notif">${TP.t('notifications')}${me.unread_notifications ? ` <i class="ndot" style="position:static;display:inline-flex">${me.unread_notifications}</i>` : ''}</button>
          ${vstatus === 'approved' ? `<button class="btn btn--sm" id="btn-enq">${TP.t('enquiries')}</button>
            <a class="btn btn--sm" href="vendor.html?id=${me.vendor.id}">${TP.t('viewHome')}</a>
            <button class="btn btn--sm" id="btn-ads">${en ? 'My ads' : '我的广告'}</button>
            <button class="btn btn--sm" id="btn-vendor-edit">${en ? 'Edit profile page' : '管理主页资料'}</button>` : ''}
          ${agentLink.linked ? `<button class="btn btn--sm" id="btn-agent">${en ? 'My expert profile' : '我的专家资料'}${agentLink.pending ? ' <span class="stag stag--pending" style="margin-left:4px">审核中</span>' : ''}</button>` : ''}
          ${!vstatus || vstatus === 'rejected' ? `<a class="btn btn--sm" href="join.html">${TP.t('join')}</a>` : ''}
          <button class="btn btn--sm" id="btn-profile">${en ? 'Account' : '账号设置'}</button>
          <button class="btn btn--sm btn--danger" id="btn-logout">${TP.t('logout')}</button>
        </div>
      </div>
      <div id="me-panel"></div>
      <div class="ex-section">
        <p class="eyebrow">${TP.t('myPosts')}</p>
        <div class="divider"></div>
        <div id="my-posts"></div>
      </div>`;

    const panel = $('#me-panel');
    $('#btn-favorites').addEventListener('click',async()=>{
      panel.innerHTML='<p>Loading…</p>';
      try {
        const rows=await api('/api/my/favorites');favoriteIds=new Set(rows.map(p=>p.id));
        panel.innerHTML=`<h2>${en?'My saved homes':'我的收藏'}</h2><p>${en?'Saved homes sync across your devices.':'登录同一账号，可在不同设备查看收藏。'}</p><div class="lgrid">${rows.length?rows.map((p,i)=>p.unavailable?`<div data-favorite-item><p>${en?'This home is no longer available.':'此房源已下架或删除。'}</p><button class="btn btn--sm" data-remove-favorite="${p.id}">${en?'Remove':'移除收藏'}</button></div>`:`<div data-favorite-item>${propCard(p,i)}</div>`).join(''):`<p>${en?'No saved homes yet.':'还没有收藏房源。去找房页面点击「收藏房源」即可。'}</p>`}</div>`;
        $$('[data-remove-favorite]',panel).forEach(b=>b.addEventListener('click',async()=>{try{await api('/api/my/favorites/'+b.dataset.removeFavorite,{method:'DELETE'});favoriteIds.delete(Number(b.dataset.removeFavorite));b.closest('[data-favorite-item]').remove();paintFavorites();}catch(err){alert(err.message);}}));
      }catch(err){panel.textContent=err.message;}
    });

    $('#btn-logout').addEventListener('click', async () => { await post('/api/auth/logout', {}); location.href = 'index.html'; });

    /* 站内通知 */
    async function showNotifications() {
      panel.innerHTML = `<div class="me-card">${skelText}</div>`;
      const list = await api('/api/my/notifications');
      panel.innerHTML = `<div class="me-card"><h3>${TP.t('notifications')}</h3>
        <div class="notif-list">${list.length ? list.map(n => `
          <div class="notif${n.is_read ? '' : ' unread'}">
            <div class="nt"><b>${esc(TP.L(n, 'title'))}</b><span>${esc((n.created_at || '').slice(0, 16))}</span></div>
            ${TP.L(n, 'body') ? `<p>${esc(TP.L(n, 'body'))}</p>` : ''}
            ${n.link ? `<a href="${esc(n.link)}">${en ? 'View' : '查看'} →</a>` : ''}
          </div>`).join('') : `<p style="color:var(--ink-3);padding:10px 0">${TP.t('empty')}</p>`}</div></div>`;
      if (list.some(n => !n.is_read)) {
        await api('/api/my/notifications/read-all', { method: 'PUT' }).catch(() => {});
        const b = $('#btn-notif .ndot'); if (b) b.remove();
        $$('.nav-bell .ndot').forEach(x => x.remove());
      }
    }
    $('#btn-notif').addEventListener('click', showNotifications);

    /* 入驻方收到的留言 */
    const be = $('#btn-enq');
    if (be) be.addEventListener('click', async () => {
      panel.innerHTML = `<div class="me-card">${skelText}</div>`;
      const list = await api('/api/my/enquiries');
      panel.innerHTML = `<div class="me-card"><h3>${TP.t('enquiries')}</h3>
        <div class="notif-list">${list.length ? list.map(q => `
          <div class="notif">
            <div class="nt"><b>${esc(q.name || (en ? 'Guest' : '访客'))}</b><span>${esc((q.created_at || '').slice(0, 16))}</span></div>
            <p>${esc(q.message)}</p>
            ${[q.phone, q.email].filter(Boolean).length ? `<p style="color:var(--ink-3);font-size:12.5px">${[q.phone, q.email].filter(Boolean).map(esc).join(' · ')}</p>` : ''}
          </div>`).join('') : `<p style="color:var(--ink-3);padding:10px 0">${TP.t('empty')}</p>`}</div></div>`;
    });

    /* 我的广告(仅已入驻方):自助投放 + 自助看数据,不必找客服问效果 */
    const AD_PLACE = {
      home_side: en ? 'Home sidebar' : '首页侧栏', home_flow: en ? 'Home feed' : '首页信息流',
      news_side: en ? 'News sidebar' : '资讯页侧栏', section_top: en ? 'Section top' : '板块页顶部',
      property_side: en ? 'Property sidebar' : '房源页侧栏'
    };
    const AD_STATUS = {
      pending: [en ? 'In review' : '审核中', 'pending'], approved: [en ? 'Live' : '投放中', 'approved'],
      rejected: [en ? 'Declined' : '已驳回', 'rejected'], paused: [en ? 'Paused' : '已暂停', 'offline']
    };
    async function showMyAds() {
      panel.innerHTML = `<div class="me-card">${skelText}</div>`;
      const list = await api('/api/my/ads');
      panel.innerHTML = `<div class="me-card">
        <h3>${en ? 'My advertisements' : '我的广告'}</h3>
        <p style="color:var(--ink-3);font-size:13px;margin-bottom:16px">${en
          ? 'New or edited ads go into review before going live. Impressions and clicks update on their own.'
          : '新建或修改后的广告需经审核才会上线。曝光与点击自动统计,随时可在这里查看。'}</p>
        <div class="notif-list">${list.length ? list.map(a => {
          const st = AD_STATUS[a.status] || ['?', ''];
          const ctr = a.impressions ? (a.clicks / a.impressions * 100).toFixed(1) + '%' : '—';
          return `<div class="notif">
            <div class="nt">
              <b>${esc(TP.L(a, 'title') || (en ? '(untitled)' : '(无标题)'))}</b>
              <span class="stag stag--${st[1]}">${st[0]}</span>
            </div>
            <p style="color:var(--ink-3);font-size:12.5px">${esc(AD_PLACE[a.placement] || a.placement)} · ${esc(a.start_at || (en ? 'now' : '即刻'))} → ${esc(a.end_at || (en ? 'open-ended' : '不限'))}</p>
            <p style="font-size:13px">${en ? 'Impressions' : '曝光'} <b>${a.impressions}</b> · ${en ? 'Clicks' : '点击'} <b>${a.clicks}</b> · ${en ? 'CTR' : '点击率'} <b>${ctr}</b> · ${en ? 'Leads' : '带来线索'} <b>${a.leads || 0}</b></p>
            ${a.review_note ? `<p style="color:var(--danger);font-size:12.5px">${en ? 'Review note' : '审核备注'}:${esc(a.review_note)}</p>` : ''}
            <p><a href="${esc(a.target_url)}" target="_blank" rel="noopener noreferrer" style="font-size:12.5px">${esc(a.target_url)}</a></p>
            <button class="btn btn--sm btn--danger" data-adel="${a.id}" style="margin-top:8px">${en ? 'Delete' : '删除'}</button>
          </div>`;
        }).join('') : `<p style="color:var(--ink-3);padding:10px 0">${en ? 'No advertisements yet.' : '还没有投放过广告。'}</p>`}</div>
        <form id="ad-form" class="me-form" style="margin-top:22px;border-top:1px solid var(--line);padding-top:20px">
          <h4 style="margin-bottom:12px">${en ? 'Submit a new advertisement' : '投放新广告'}</h4>
          <div class="frow">
            <label>${en ? 'Title (ZH)' : '标题(中文)'}<input name="title_zh" maxlength="60"></label>
            <label>${en ? 'Title (EN)' : '标题(英文)'}<input name="title_en" maxlength="60"></label>
          </div>
          <div class="frow">
            <label>${en ? 'Placement' : '展示位置'}<select name="placement">${Object.entries(AD_PLACE).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
            <label>${en ? 'Start date' : '上线日期(留空=即刻)'}<input name="start_at" placeholder="2026-09-10"></label>
            <label>${en ? 'End date' : '下线日期(留空=不限)'}<input name="end_at" placeholder="2026-12-31"></label>
          </div>
          <label>${en ? 'Landing page URL *' : '落地页链接 *(你自己的网站)'}<input name="target_url" type="url" required placeholder="https://"></label>
          <label>${en ? 'Advertisement image *' : '广告图 *'}<input type="file" name="image_file" accept="image/*" required></label>
          <button class="btn btn--solid btn--sm" type="submit">${en ? 'Submit for review' : '提交审核'}</button>
        </form>
      </div>`;
      $$('[data-adel]', panel).forEach(b => b.addEventListener('click', async () => {
        if (!confirm(en ? 'Delete this advertisement? Its stats are removed too.' : '删除这条广告?曝光与点击数据一并清除。')) return;
        try { await api('/api/my/ads/' + b.dataset.adel, { method: 'DELETE' }); showMyAds(); }
        catch (err) { alert(err.message); }
      }));
      $('#ad-form').addEventListener('submit', async ev => {
        ev.preventDefault();
        const form = ev.target, btn = $('button[type=submit]', form);
        const label = btn.textContent;
        btn.disabled = true; btn.textContent = en ? 'Uploading…' : '上传中…';
        try {
          const imgs = await uploadFiles($('[name=image_file]', form));
          if (!imgs.length) throw new Error(en ? 'Please choose an image.' : '请选择广告图。');
          await post('/api/my/ads', {
            title_zh: form.title_zh.value.trim(), title_en: form.title_en.value.trim(),
            image: imgs[0], target_url: form.target_url.value.trim(),
            placement: form.placement.value,
            start_at: form.start_at.value.trim(), end_at: form.end_at.value.trim()
          });
          showMyAds();
        } catch (err) {
          alert(err.message);
          btn.disabled = false; btn.textContent = label;
        }
      });
    }
    const ba = $('#btn-ads');
    if (ba) ba.addEventListener('click', showMyAds);

    /* 我的专家资料(后台绑定过账号的经纪人才有):本人改 → 进待审 → 后台通过才上线 */
    async function showAgent() {
      panel.innerHTML = `<div class="me-card">${skelText}</div>`;
      const d = await api('/api/my/agent');
      if (!d.linked) { panel.innerHTML = `<div class="me-card"><p>${en ? 'No expert profile is linked to this account.' : '您的账号尚未绑定专家资料。'}</p></div>`; return; }
      const a = d.agent, p = d.pending || {};
      const val = k => esc(k in p ? p[k] : (a[k] || ''));   /* 有待审就显示待审的值 */
      panel.innerHTML = `<div class="me-card">
        <h3>${en ? 'My expert profile' : '我的专家资料'}</h3>
        ${d.pending ? `<p class="stag stag--pending" style="display:inline-block;margin-bottom:12px">${en ? 'Changes under review' : '以下修改正在审核中,通过后才会显示在网站上'}</p>` : ''}
        ${d.review_note ? `<p style="color:var(--danger);font-size:13px;margin-bottom:12px">${en ? 'Last update was declined' : '上次修改未通过'}:${esc(d.review_note)}</p>` : ''}
        <p style="color:var(--ink-3);font-size:13px;margin-bottom:16px">${en
          ? 'Edits go to The Point for review before they appear on the site.'
          : '修改提交后需经一点审核,通过后才会更新到网站上。'}</p>
        <form id="agent-form" class="me-form">
          <div class="frow">
            <label>${en ? 'Name' : '姓名'}<input name="name" value="${val('name')}" maxlength="60" required></label>
            <label>${en ? 'Category' : '类别'}<input name="category" value="${val('category')}" maxlength="30" placeholder="${en ? 'e.g. Property' : '如 地产 / 金融 / 租务'}"></label>
          </div>
          <div class="frow">
            <label>${en ? 'Email' : '邮箱'}<input name="email" type="email" value="${val('email')}" maxlength="200"></label>
            <label>${en ? 'Phone' : '电话'}<input name="phone" value="${val('phone')}" maxlength="50"></label>
            <label>微信<input name="wechat" value="${val('wechat')}" maxlength="60"></label>
          </div>
          <label>${en ? 'Profile photo' : '个人照片'}
            <input type="file" name="photo_file" accept="image/*">
            <span style="display:block;font-size:12px;color:var(--ink-3);margin-top:4px">${a.photo || p.photo ? (en ? 'Leave empty to keep the current photo' : '不选则保留现有照片') : ''}</span></label>
          <label>${en ? 'YouTube channel' : 'YouTube 频道链接'}<input name="channel_url" value="${val('channel_url')}" maxlength="300" placeholder="https://youtube.com/@…"></label>
          <label>${en ? 'Bio (ZH)' : '个人简介(中文)'}<textarea name="bio" rows="4" maxlength="3000">${val('bio')}</textarea></label>
          <label>${en ? 'Bio (EN)' : '个人简介(英文)'}<textarea name="bio_en" rows="3" maxlength="3000">${val('bio_en')}</textarea></label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn--solid btn--sm" type="submit">${en ? 'Submit for review' : '提交审核'}</button>
            ${d.pending ? `<button class="btn btn--sm" type="button" id="agent-withdraw">${en ? 'Withdraw pending changes' : '撤回待审修改'}</button>` : ''}
          </div>
        </form></div>`;

      const wd = $('#agent-withdraw');
      if (wd) wd.addEventListener('click', async () => {
        if (!confirm(en ? 'Withdraw the pending changes?' : '撤回这次待审的修改?')) return;
        try { await api('/api/my/agent/pending', { method: 'DELETE' }); showAgent(); } catch (ex) { alert(ex.message); }
      });

      $('#agent-form').addEventListener('submit', async ev => {
        ev.preventDefault();
        const f = ev.target, btn = $('button[type=submit]', f), label = btn.textContent;
        btn.disabled = true; btn.textContent = en ? 'Submitting…' : '提交中…';
        try {
          const body = {};
          for (const k of ['name', 'category', 'email', 'phone', 'wechat', 'bio', 'bio_en', 'channel_url']) body[k] = f[k].value.trim();
          const files = await uploadFiles($('[name=photo_file]', f));
          if (files.length) body.photo = files[0];
          const r = await api('/api/my/agent', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          alert(r.unchanged ? (en ? 'Nothing changed.' : '没有任何改动。') : (en ? 'Submitted — awaiting review.' : '已提交,等待审核。'));
          showAgent();
        } catch (ex) {
          alert(ex.message);
          btn.disabled = false; btn.textContent = label;
        }
      });
    }
    const ba2 = $('#btn-agent');
    if (ba2) ba2.addEventListener('click', showAgent);

    /* 深链:me.html#notifications / #enquiries */
    if (location.hash === '#notifications') showNotifications();
    else if (location.hash === '#enquiries' && be) be.click();

    /* 账号设置 */
    $('#btn-profile').addEventListener('click', () => {
      panel.innerHTML = `<div class="me-card"><h3>${en ? 'Account' : '账号设置'}</h3>
        <form id="profile-form" class="me-form">
          <div class="frow">
            <label>${en ? 'Name' : '称呼'}<input name="name" value="${esc(me.name)}"></label>
            <label>${en ? 'Phone' : '电话'}<input name="phone" value="${esc(me.phone)}"></label>
            <label>微信<input name="wechat" value="${esc(me.wechat)}"></label>
          </div>
          <button class="btn btn--solid btn--sm" type="submit">${en ? 'Save' : '保存'}</button>
        </form>
        <form id="pw-form" class="me-form" style="margin-top:18px">
          <div class="frow">
            <label>${en ? 'Current password' : '原密码'}<input name="old_password" type="password" required></label>
            <label>${en ? 'New password' : '新密码(至少 6 位)'}<input name="new_password" type="password" required minlength="6"></label>
          </div>
          <p class="err" id="pw-err"></p>
          <button class="btn btn--sm" type="submit">${en ? 'Change password' : '修改密码'}</button>
        </form></div>`;
      $('#profile-form').addEventListener('submit', async e => {
        e.preventDefault();
        const body = {}; new FormData(e.target).forEach((v, k) => body[k] = v);
        await api('/api/auth/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        e.target.querySelector('button').textContent = '✓';
      });
      $('#pw-form').addEventListener('submit', async e => {
        e.preventDefault();
        const body = {}; new FormData(e.target).forEach((v, k) => body[k] = v);
        try { await post('/api/auth/change-password', body); location.href='account.html'; }
        catch (ex) { $('#pw-err').textContent = ex.message; }
      });
    });

    /* 发布 / 编辑 */
    function openPostForm(p) {
      if(p&&p.revision&&['pending','rejected'].includes(p.revision.status)){
        p={...p,...p.revision.payload};if(!Array.isArray(p.images)){try{p.images=JSON.parse(p.images||'[]');}catch(_){p.images=[];}}
      }
      panel.innerHTML = `<div class="me-card"><h3>${p ? (en ? 'Edit post' : '编辑发布') : TP.t('newPost')}</h3>${postFormHTML(me, secs, p)}</div>`;
      if(p&&p.revision&&p.revision.status==='rejected')formPlaceholder();
      function formPlaceholder(){const notice=document.createElement('p');notice.className='revision-notice';notice.textContent=(en?'Update declined: ':'修改未通过：')+p.revision.review_note;panel.querySelector('h3').after(notice);}
      const form = $('#post-form');
      bindCategorySelect(form, secs, p ? p.category_id : null);
      bindFilePreviews(form);
      $('#post-cancel').addEventListener('click', () => { panel.innerHTML = ''; });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const err = $('#post-err'); err.textContent = '';
        const body = {}; new FormData(form).forEach((v, k) => { if (k !== 'files' && k !== '_id') body[k] = v; });
        if (p) body.type = undefined;
        try {
          const files = await uploadFiles(form.querySelector('[name=files]'));
          if (files.length) body.images = files;
          else if (p) body.images = p.images;
          let result;
          if (p) result=await api('/api/my/posts/' + p.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          else result=await post('/api/my/posts', body);
          panel.innerHTML = `<div class="me-card"><p>✓ ${result.live_preserved ? (en?'Update submitted. The original remains live.':'修改已提交，原内容继续展示，审核通过后替换。') : (en ? 'Submitted — it will appear once approved.' : '已提交,审核通过后展示。')}</p></div>`;
          loadMyPosts();
        } catch (ex) { err.textContent = ex.message; }
      });
    }
    $('#btn-new-post').addEventListener('click', () => openPostForm(null));

    /* 入驻方资料管理 */
    const ve = $('#btn-vendor-edit');
    if (ve) ve.addEventListener('click', async () => {
      const v = await api('/api/vendor/me');
      const revision=v.revision;
      const edit={...v,...(revision&&['pending','rejected'].includes(revision.status)?revision.payload:{})};
      if(!Array.isArray(edit.photos)){try{edit.photos=JSON.parse(edit.photos||'[]');}catch(_){edit.photos=[];}}
      panel.innerHTML = `<div class="me-card"><h3>${en ? 'My profile page' : '主页资料'}</h3>
        <p class="auth-note" style="margin:0 0 14px">${en ? 'Your existing profile stays live while changes are reviewed. Approved changes replace the corresponding fields.' : '修改会单独审核，审核期间原主页和发布继续展示；通过后替换对应资料。'}</p>
        ${revision&&revision.status==='pending'?`<p class="revision-notice">${en?'An update is in review. Resubmitting replaces the pending version; your live profile stays unchanged.':'资料修改正在审核。下方显示您提交的版本，再次提交会替换待审版本，线上主页保持不变。'}</p>`:''}
        ${revision&&revision.status==='rejected'?`<p class="revision-notice">${en?'The update was declined. Your existing profile is still live. Reason: ':'资料修改未通过，原主页仍正常展示。原因：'}${esc(revision.review_note)}</p>`:''}
        ${vendorFormHTML(secs, edit, 'edit')}</div>`;
      const form = $('#vendor-form');
      bindCategorySelect(form, secs, edit.category_id);
      bindFilePreviews(form);
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const result=await submitVendorForm(form, 'edit');
        if (result) {
          panel.innerHTML = `<div class="me-card"><p>✓ ${result.unchanged ? (en?'No changes to review.':'资料与线上版本一致，没有需要审核的修改。') : (en?'Changes submitted for review. Your existing profile remains live.':'修改已提交审核，原主页继续正常展示。')}</p></div>`;
        }
      });
    });

    /* 我的发布列表 */
    async function loadMyPosts() {
      const posts = await api('/api/my/posts');
      $('#my-posts').innerHTML = posts.length ? `<div class="tablewrap"><table>
        <tr><th>${en ? 'Title' : '标题'}</th><th>${en ? 'Type' : '类型'}</th><th>${en ? 'Status' : '状态'}</th><th>${en ? 'Date' : '时间'}</th><th></th></tr>
        ${posts.map(p => `<tr>
          <td>${p.status === 'approved' ? `<a href="post.html?id=${p.id}" style="text-decoration:underline">${esc(TP.L(p, 'title'))}</a>` : esc(TP.L(p, 'title'))}</td>
          <td>${esc(typeLabel(p.type))}</td>
          <td>${statusTag(p.status)}${p.revision&&p.revision.status==='pending'?`<br><span class="stag stag--pending">${en?'Update in review':'修改待审核'}</span>`:''}${p.revision&&p.revision.status==='rejected'?`<br><small>${en?'Update declined: ':'修改未通过：'}${esc(p.revision.review_note)}</small>`:''}${p.status === 'rejected' && p.review_note ? `<br><small style="color:var(--danger)">${esc(p.review_note)}</small>` : ''}</td>
          <td style="white-space:nowrap">${esc((p.created_at || '').slice(0, 10))}</td>
          <td><div class="rowbtns">
            <button class="btn btn--sm" data-edit="${p.id}">${en ? 'Edit' : '编辑'}</button>
            <button class="btn btn--sm btn--danger" data-del="${p.id}">${en ? 'Delete' : '删除'}</button>
          </div></td></tr>`).join('')}
      </table></div>` : `<p style="color:var(--ink-3);padding:20px 0">${TP.t('empty')}</p>`;
      $$('#my-posts [data-edit]').forEach(b => b.addEventListener('click', () => {
        openPostForm(posts.find(x => x.id === Number(b.dataset.edit)));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }));
      $$('#my-posts [data-del]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm(en ? 'Delete this post?' : '确定删除这条发布?')) return;
        await api('/api/my/posts/' + b.dataset.del, { method: 'DELETE' });
        loadMyPosts();
      }));
    }
    loadMyPosts();
  }

  /* ---------- 投资意向登记 ----------
     无 token = 新登记;带 token = 本人回来改自己的意向(邮件里「更新我的意向」按钮的落点)。 */
  async function pageInvestors() {
    const root = $('#inv-root');
    const en = TP.lang === 'en';
    const token = param('token') || '';
    let opts, mine = null;

    try { opts = await api('/api/investors/options'); }
    catch (e) { root.innerHTML = `<div class="auth-card"><p>${en ? 'Could not load the form. Please try again later.' : '表单加载失败,请稍后重试。'}</p></div>`; return; }

    if (token) {
      try { mine = await api('/api/investors/me?token=' + encodeURIComponent(token)); }
      catch (e) {
        root.innerHTML = `<div class="auth-card" style="text-align:center">
          <h3 style="font-family:var(--serif);font-size:20px;margin-bottom:10px">${en ? 'Link no longer valid' : '链接已失效'}</h3>
          <p style="color:var(--ink-3);line-height:1.7">${en ? 'Please register again below.' : '请重新登记一次。'}</p>
          <a class="btn btn--solid" href="investors.html" style="margin-top:18px">${en ? 'Register' : '重新登记'}</a></div>`;
        return;
      }
      $('#inv-title').textContent = en ? 'Update my criteria' : '更新我的投资意向';
      $('#inv-lead').textContent = en
        ? 'Adjust the types and budgets below. Changes take effect straight away.'
        : '修改下面的类型与预算,保存后立即生效。';
    }

    const picked = {};
    (mine ? mine.interests : []).forEach(it => { picked[it.kind] = it; });
    /* 把已存的数值区间对回档位 id;对不上(比如以后改了档位)就留空让本人重选 */
    const bandOf = it => {
      if (!it) return '';
      const b = opts.bands.find(x => x.min === it.price_min && x.max === it.price_max);
      return b ? b.id : '';
    };
    const L = o => en ? (o.label_en || o.label_zh) : o.label_zh;

    root.innerHTML = `
      <form id="inv-form" class="auth-card" style="max-width:none">
        <p class="err" id="inv-err"></p>

        <p class="eyebrow" style="margin-bottom:12px">${en ? '1 · What are you looking for?' : '1 · 您想投资什么?'}</p>
        <p style="color:var(--ink-3);font-size:13px;margin-bottom:16px">${en
          ? 'Tick every type you are interested in, then set a budget for each one.'
          : '想投哪几类就勾哪几类,每一类分别设置预算区间。'}</p>
        <div id="inv-kinds">
          ${opts.kinds.map(k => {
            const on = !!picked[k.id];
            return `<div class="inv-kind" data-kind="${k.id}" style="border:1px solid var(--line);padding:16px;margin-bottom:12px">
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin:0">
                <input type="checkbox" name="kind" value="${k.id}"${on ? ' checked' : ''}>
                <b style="font-size:15px">${esc(L(k))}</b>
              </label>
              <div class="inv-band" style="margin-top:12px${on ? '' : ';display:none'}">
                <label class="fld" style="margin:0"><span>${en ? 'Budget' : '预算区间'}</span>
                  <select name="band_${k.id}">
                    <option value="">${en ? 'Please choose' : '请选择'}</option>
                    ${opts.bands.map(b => `<option value="${b.id}"${bandOf(picked[k.id]) === b.id ? ' selected' : ''}>${esc(L(b))}</option>`).join('')}
                  </select></label>
              </div>
            </div>`;
          }).join('')}
        </div>

        <p class="eyebrow" style="margin:26px 0 12px">${en ? '2 · How can we reach you?' : '2 · 怎么联系您?'}</p>
        <div class="frow" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px">
          <label class="fld"><span>${en ? 'Name' : '称呼'}</span>
            <input name="name" maxlength="60" value="${esc(mine ? mine.name : '')}" placeholder="${en ? 'Your name' : '如何称呼您'}"></label>
          <label class="fld"><span>${en ? 'Email *' : '邮箱 *'}</span>
            <input name="email" type="email" required maxlength="120" value="${esc(mine ? mine.email : '')}"${mine ? ' readonly style="background:var(--soft)"' : ''} placeholder="you@example.com"></label>
          <label class="fld"><span>${en ? 'Phone' : '电话'}</span>
            <input name="phone" maxlength="40" value="${esc(mine ? mine.phone : '')}" placeholder="021 000 0000"></label>
        </div>

        <!-- 蜜罐:真人看不见,机器人会填 -->
        <div style="position:absolute;left:-9999px" aria-hidden="true">
          <label>Website<input name="website" tabindex="-1" autocomplete="off"></label>
        </div>

        ${mine ? '' : `
        <label style="display:flex;gap:10px;align-items:flex-start;margin:22px 0 6px;font-size:13px;color:var(--ink-2);line-height:1.6;cursor:pointer">
          <input type="checkbox" name="consent" required style="margin-top:3px">
          <span>${en
            ? 'I agree that The Point may keep these details and contact me about properties matching my criteria. I can update or unsubscribe at any time.'
            : '我同意一点保存以上信息,并在有符合我条件的房源时与我联系。我可以随时更新意向或退订。'}</span>
        </label>`}

        <button class="btn btn--solid" type="submit" style="width:100%;justify-content:center;margin-top:18px">
          ${mine ? (en ? 'Save changes' : '保存修改') : (en ? 'Register my criteria' : '提交登记')}
        </button>
      </form>
      ${mine ? `<p style="text-align:center;margin-top:16px">
        <a href="#" id="inv-unsub" style="font-size:13px;color:var(--ink-3)">${en ? 'Unsubscribe from these alerts' : '不再接收匹配通知'}</a></p>` : ''}`;

    /* 勾选类型 → 展开该类的预算下拉 */
    $('#inv-kinds').addEventListener('change', e => {
      const cb = e.target.closest('input[name=kind]');
      if (!cb) return;
      const box = cb.closest('.inv-kind').querySelector('.inv-band');
      box.style.display = cb.checked ? '' : 'none';
      if (!cb.checked) box.querySelector('select').value = '';
    });

    const err = $('#inv-err');
    $('#inv-form').addEventListener('submit', async e => {
      e.preventDefault();
      err.textContent = '';
      const f = e.target;
      const interests = [];
      $$('input[name=kind]:checked', f).forEach(cb => {
        const band = $(`[name="band_${cb.value}"]`, f).value;
        if (band) interests.push({ kind: cb.value, band });
      });
      if (!interests.length) {
        err.textContent = en ? 'Please tick at least one type and choose its budget.' : '请至少勾选一个类型,并选好它的预算区间。';
        return;
      }
      const btn = $('button[type=submit]', f), label = btn.textContent;
      btn.disabled = true; btn.textContent = en ? 'Submitting…' : '提交中…';
      const body = {
        name: f.name.value.trim(), phone: f.phone.value.trim(),
        lang: TP.lang, interests, website: f.website.value
      };
      try {
        if (mine) {
          await api('/api/investors/me?token=' + encodeURIComponent(token),
            { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          done(en ? 'Your criteria are updated.' : '您的投资意向已更新。', '');
        } else {
          body.email = f.email.value.trim();
          body.consent = f.consent.checked ? 1 : 0;
          const at = attribution();
          if (at) { body.source = at.source; if (at.utm) body.utm = JSON.stringify(at.utm); body.landing = at.landing; }
          const r = await post('/api/investors', body);
          /* 无论邮箱是否已登记过,提示语都一样 —— 后端也不告诉我们,免得这里变成邮箱探测器。
             只有新建成功时后端才会给专属链接,已登记的邮箱不会拿到别人的链接。 */
          done(en
            ? 'Thanks — we have your criteria. We will be in touch when something matches.'
            : '已收到您的投资意向。有匹配的房源时我们会联系您。',
            r.profile_url || '');
        }
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false; btn.textContent = label;
      }
    });

    function done(msg, editUrl) {
      root.innerHTML = `<div class="auth-card" style="text-align:center">
        <h3 style="font-family:var(--serif);font-size:20px;margin-bottom:12px">${en ? 'All set' : '已完成'}</h3>
        <p style="color:var(--ink-3);line-height:1.75">${esc(msg)}</p>
        ${editUrl ? `<p style="color:var(--ink-3);font-size:13px;line-height:1.7;margin-top:18px">${en
          ? 'Bookmark this link to change your criteria later:' : '想以后修改意向,可收藏这个链接:'}<br>
          <a href="${esc(editUrl)}" style="word-break:break-all">${esc(location.origin + editUrl)}</a></p>` : ''}
        <a class="btn" href="index.html" style="margin-top:22px">${en ? 'Back to home' : '返回首页'}</a></div>`;
    }

    const un = $('#inv-unsub');
    if (un) un.addEventListener('click', async ev => {
      ev.preventDefault();
      if (!confirm(en ? 'Stop receiving matching alerts?' : '确定不再接收匹配通知?')) return;
      try {
        await post('/api/investors/unsubscribe', { token });
        done(en ? 'You will no longer receive alerts. Register again any time.' : '已退订,不会再收到通知。随时可以重新登记。', '');
      } catch (ex) { alert(ex.message); }
    });
  }

  /* ---------- 路由 ---------- */
  const routes = {
    investors: pageInvestors,
    properties: pageProperties,
    property: pageProperty,
    experts: pageExperts,
    expert: pageExpert,
    news: pageNews,
    article: pageArticle,
    partners: pagePartners,
    services: pageServices,
    home: pageHome,
    section: pageSection,
    post: pagePost,
    vendor: pageVendor,
    account: pageAccount,
    reset: pageReset,
    me: pageMe,
    join: pageJoin,
    search: pageSearch
  };
  document.addEventListener('DOMContentLoaded', () => {
    captureAttribution();
    bindForms(document);
    mountAdSlots();
    if (routes[page]) routes[page]().catch(err => console.error(err));
  });
})();
