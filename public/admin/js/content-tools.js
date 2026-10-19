(function () {
  'use strict';
  const { esc, render } = window.TPContent;
  let active = null;
  window.addEventListener('beforeunload', e => {
    if (active && active.form.isConnected && active.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
  async function mediaView(root, ctx, select) {
    root.innerHTML = `<div class="topbar"><div><h2>媒体库</h2><p class="editor-note">复用文章与房源图片；修改图片说明不会改动已插入文章的图注。</p></div>
      <label class="btn btn--solid">上传图片<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple hidden data-media-upload></label></div>
      <div class="editor-actions"><input data-media-query placeholder="搜索文件名或图片说明" style="max-width:320px"><button class="btn btn--sm" data-media-search>搜索</button></div>
      <p data-media-msg role="status" class="editor-note"></p><div class="media-grid" data-media-grid></div>`;
    const msg = root.querySelector('[data-media-msg]');
    async function load() {
      try {
        const rows = await ctx.api('/api/admin/media?q=' + encodeURIComponent(root.querySelector('[data-media-query]').value));
        root.querySelector('[data-media-grid]').innerHTML = rows.length ? rows.map(r => `<div class="media-item" data-id="${r.id}">
          <img src="${esc(ctx.toAdminPath(r.path))}" alt="${esc(r.alt)}" loading="lazy"><p>${esc(r.original_name)} · ${Math.ceil(r.size/1024)} KB</p>
          <input aria-label="图片说明" value="${esc(r.alt)}" maxlength="500" placeholder="图片说明 / 搜索关键词">
          <div class="rowbtns"><button class="btn btn--sm" data-media-save>保存说明</button><button class="btn btn--sm" data-media-use>${select ? '插入' : '复制地址'}</button></div></div>`).join('') : '<p class="media-empty">没有找到图片，可以先上传一张。</p>';
        root.querySelectorAll('.media-item').forEach(card => {
          const row = rows.find(r => r.id === Number(card.dataset.id));
          card.querySelector('[data-media-save]').onclick = async () => {
            try { await ctx.put('/api/admin/media/' + row.id, { alt: card.querySelector('input').value }); row.alt = card.querySelector('input').value; msg.textContent = '图片说明已保存'; }
            catch (e) { msg.textContent = e.message; }
          };
          card.querySelector('[data-media-use]').onclick = async () => {
            if (select) { select({ ...row, alt: card.querySelector('input').value }); return; }
            try { await navigator.clipboard.writeText(row.path); msg.textContent = '已复制：' + row.path; }
            catch (_) { msg.textContent = '图片地址：' + row.path; }
          };
        });
      } catch (e) { msg.textContent = e.message; }
    }
    root.querySelector('[data-media-search]').onclick = load;
    root.querySelector('[data-media-query]').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); load(); } };
    root.querySelector('[data-media-upload]').onchange = async e => {
      msg.textContent = '正在上传…'; e.target.disabled = true;
      try { await ctx.uploadFiles(e.target.files); msg.textContent = '上传完成，可重复使用'; await load(); }
      catch (err) { msg.textContent = err.message; }
      finally { e.target.disabled = false; e.target.value = ''; }
    };
    await load();
  }
  function picker(ctx, callback) {
    const overlay = document.createElement('div'); overlay.className = 'media-picker';
    overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-label','选择图片');
    overlay.innerHTML = '<div class="media-picker-panel"><button type="button" class="btn btn--sm" data-close>关闭媒体库</button><div data-body></div></div>';
    const previous = document.activeElement;
    const close = () => { overlay.remove(); document.removeEventListener('keydown', escape); if (previous) previous.focus(); };
    const escape = e => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } };
    document.addEventListener('keydown', escape); document.body.append(overlay);
    overlay.querySelector('[data-close]').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-close]').focus();
    mediaView(overlay.querySelector('[data-body]'), ctx, r => { callback(r); close(); });
  }
  function attach(ctx, recovered) {
    if (active) active.dispose();
    const form = document.getElementById('mform');
    const { name, cfg } = ctx;
    const row = ctx.row && ctx.row.id ? ctx.row : null;
    const state = { form, dirty:false, stopped:false }; active = state;
    let draftId = recovered ? recovered.id : null, timer = null, chain = Promise.resolve();
    const mode = document.createElement('div'); mode.className = 'f full';
    mode.innerHTML = `<label>正文排版</label><select name="content_format"><option value="plain">纯文本（兼容原有文章）</option><option value="markdown">图文排版（标题、加粗、列表、链接、图片）</option></select><p class="editor-note">工具栏会插入排版标记，点击「预览文章」查看读者效果。自动保存只写入私人草稿，不改变线上内容。</p>`;
    form.querySelector('.fgrid').prepend(mode);
    mode.querySelector('select').value = (row && row.content_format) || 'markdown';
    const actions = document.createElement('div'); actions.className = 'editor-actions';
    actions.innerHTML = '<span class="editor-status" role="status">尚未修改</span><button type="button" class="btn btn--sm" data-draft>保存草稿</button><button type="button" class="btn btn--sm" data-preview>预览文章</button>'+(row?'<button type="button" class="btn btn--sm" data-content-history>历史版本</button>':'');
    form.querySelector('.actions').before(actions);
    const status = actions.querySelector('.editor-status');
    const preview = document.createElement('div'); preview.className = 'editor-preview'; preview.hidden = true; actions.after(preview);
    const saveButton = form.querySelector('button[type=submit]');
    function labelSave() {
      const isPublic = name === 'news' ? form.elements.visible.checked : form.elements.status.value === 'approved';
      const scheduled=form.elements.scheduled_at && new Date(form.elements.scheduled_at.value).getTime()>Date.now();
      saveButton.textContent = isPublic ? (scheduled?'保存定时发布':'保存并公开发布') : '按所选状态保存';
    }
    if (name === 'news' && !row && !recovered) form.elements.visible.checked = false;
    labelSave();
    saveButton.title = '按表单中的发布状态保存；草稿请使用左侧保存草稿';
    function collect() {
      const body = {};
      for (const f of cfg.fields) {
        if (f.type === 'check') body[f.k] = form.querySelector(`[name="${f.k}"]`).checked ? 1 : 0;
        else if (f.type === 'image' || f.type === 'images') {
          const imgs = [...form.querySelectorAll(`.imgs[data-field="${f.k}"] .im`)].map(x => x.dataset.src);
          body[f.k] = f.type === 'image' ? (imgs[0] || '') : imgs;
        } else body[f.k] = form.querySelector(`[name="${f.k}"]`).value;
      }
      body.content_format = form.elements.content_format.value;
      if(body.scheduled_at)body.scheduled_at=new Date(body.scheduled_at).toISOString();
      return body;
    }
    function showPreview() {
      const b = collect();
      const langs = name === 'news' ? [['中文',b.title,b.content],['English',b.title_en,b.content_en]] : [['中文',b.title_zh,b.content_zh],['English',b.title_en,b.content_en]];
      preview.innerHTML = '<p class="editor-preview-label">文章预览 · 尚未提交发布</p>' + langs.filter(x=>x[1] || x[2]).map(([label,title,body]) => `<p class="editor-preview-label">${label}</p><h2 class="editor-preview-title">${esc(title || '未命名文章')}</h2>${render(body,b.content_format)}`).join('');
      // Frontend media paths are relative to the site root, the editor lives in /admin/.
      preview.querySelectorAll('img').forEach(img => { const src = img.getAttribute('src'); img.src = ctx.toAdminPath(src); });
      preview.querySelectorAll('a').forEach(a => { a.target = '_blank'; const href = a.getAttribute('href'); if (!/^https?:/i.test(href) && !href.startsWith('#')) a.href = '../' + href; });
    }
    function saveDraft() {
      clearTimeout(timer);
      const body = collect(), snapshot = JSON.stringify(body);
      chain = chain.catch(() => {}).then(async () => {
        status.textContent = '正在保存草稿…';
        const payload = { kind:name, ref_id:row ? row.id : null, payload:body };
        const r = draftId ? await ctx.put('/api/admin/drafts/' + draftId,payload) : await ctx.post('/api/admin/drafts',payload);
        draftId = r.id;
        if (snapshot === JSON.stringify(collect())) state.dirty = false;
        status.textContent = '草稿已保存 · ' + new Date().toLocaleTimeString();
      });
      chain.catch(e => { state.dirty = true; status.textContent = '草稿未保存：' + e.message; });
      return chain;
    }
    function changed() {
      if (state.stopped) return;
      labelSave();
      state.dirty = true; status.textContent = '有修改，稍后自动保存…';
      clearTimeout(timer); timer = setTimeout(() => { if (form.isConnected && !state.stopped) saveDraft(); },1500);
      if (!preview.hidden) showPreview();
    }
    form.addEventListener('input',changed); form.addEventListener('change',changed);
    const observer = new MutationObserver(changed);
    form.querySelectorAll('.imgs').forEach(el => observer.observe(el,{childList:true}));
    state.dispose = () => { clearTimeout(timer); observer.disconnect(); state.stopped = true; };
    actions.querySelector('[data-draft]').onclick = () => saveDraft().catch(()=>{});
    actions.querySelector('[data-preview]').onclick = () => { preview.hidden = !preview.hidden; if (!preview.hidden) showPreview(); };
    const historyButton=actions.querySelector('[data-content-history]');
    if(historyButton)historyButton.onclick=async()=>{
      try{
        const data=await ctx.api('/api/admin/content-versions?'+new URLSearchParams({kind:name,id:row.id}));
        const overlay=document.createElement('div');overlay.className='media-picker';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','文章历史版本');
        overlay.innerHTML=`<div class="media-picker-panel"><div class="topbar"><h3>历史版本</h3><button type="button" class="btn btn--sm" data-close>关闭</button></div><p class="editor-note">载入历史版本后先检查内容，再保存草稿或发布；不会直接替换线上文章。</p><div data-versions></div></div>`;
        const versions=data.versions.length?data.versions:[{id:0,author:'',created_at:'当前版本',payload:data.current}];
        overlay.querySelector('[data-versions]').innerHTML=versions.map((v,i)=>`<div class="msgcard"><b>${esc(v.payload.title||v.payload.title_zh||v.payload.title_en||'未命名文章')}</b><p class="meta">${esc(v.created_at)} · ${esc(v.author)} · #${v.id}</p><button type="button" class="btn btn--sm" data-load-version="${i}">载入编辑器</button></div>`).join('');
        overlay.querySelector('[data-close]').onclick=()=>overlay.remove();document.body.append(overlay);
        overlay.querySelectorAll('[data-load-version]').forEach(b=>b.onclick=()=>{
          if(state.dirty&&!confirm('当前还有未保存修改，确定载入历史版本？'))return;
          const version=versions[Number(b.dataset.loadVersion)];overlay.remove();ctx.openForm(name,{...data.current,...version.payload,id:row.id});
        });
      }catch(e){status.textContent=e.message;}
    };
    const bodyFields = name === 'news' ? ['content','content_en'] : ['content_zh','content_en'];
    bodyFields.forEach(field => {
      const input = form.elements[field]; input.classList.add('editor-text');
      const toolbar = document.createElement('div'); toolbar.className = 'editor-toolbar';
      toolbar.innerHTML = ['小标题','加粗','列表','链接','插入图片'].map((label,i)=>`<button type="button" data-tool="${i}">${label}</button>`).join('');
      input.before(toolbar);
      function insert(text, line) {
        const start = input.selectionStart, end = input.selectionEnd;
        const prefix = line && start > 0 && input.value[start-1] !== '\n' ? '\n\n' : '';
        input.setRangeText(prefix + text + (line ? '\n\n' : ''),start,end,'end');
        mode.querySelector('select').value = 'markdown'; input.focus(); changed();
      }
      toolbar.onclick = e => {
        const b = e.target.closest('[data-tool]'); if (!b) return;
        const selection = input.value.slice(input.selectionStart,input.selectionEnd);
        switch (Number(b.dataset.tool)) {
          case 0: insert('## ' + (selection || '小标题'),true); break;
          case 1: insert('**' + (selection || '重点文字') + '**'); break;
          case 2: insert((selection || '列表内容').split('\n').map(x=>'- '+x).join('\n'),true); break;
          case 3: { const url = prompt('链接地址（https://…）'); if (url) { const safe = TPContent.safeUrl(url); if (safe) insert('['+(selection || '链接文字').replace(/[\[\]]/g,'')+']('+safe+')'); else alert('请填写有效的 http 或 https 链接'); } break; }
          case 4: picker(ctx,r=>insert('!['+(r.alt || '').replace(/[\[\]\n]/g,'')+']('+r.path+')',true)); break;
        }
      };
    });
    // Also reuse library images for article covers and post galleries.
    form.querySelectorAll('.imgs').forEach(box => {
      const button = document.createElement('button'); button.type='button'; button.className='btn btn--sm'; button.textContent='从媒体库选择';
      box.after(button);
      button.onclick = () => picker(ctx,r=>{
        const div=document.createElement('div'); div.className='im'; div.dataset.src=r.path;
        div.innerHTML=`<img src="${esc(ctx.toAdminPath(r.path))}" alt="${esc(r.alt)}"><button type="button" class="x">×</button>`;
        if (box.dataset.single) box.replaceChildren(div); else box.append(div);
        changed();
      });
    });
    form.addEventListener('submit',async e=>{
      e.preventDefault(); e.stopImmediatePropagation();
      saveButton.disabled=true; state.stopped=true; clearTimeout(timer);
      try {
        await saveDraft();
        const body=collect();
        if (row) await ctx.put(cfg.api+'/'+row.id,body); else await ctx.post(cfg.api,body);
        state.dirty=false; state.dispose();
        try { if (draftId) await ctx.api('/api/admin/drafts/'+draftId,{method:'DELETE'}); }
        catch (_) { ctx.toast('内容已保存，旧草稿仍在草稿箱，请手动清理'); }
        document.getElementById('modal-bg').classList.remove('open'); ctx.toast('内容已保存，按所选状态展示'); ctx.go(name);
      } catch(err) { status.textContent='未提交：'+err.message; state.stopped=false; saveButton.disabled=false; }
    },true);
    if (recovered) status.textContent='已恢复服务器草稿，可继续编辑或提交';
  }
  async function draftsView(root,ctx) {
    root.innerHTML='<h2>文章草稿</h2><p class="editor-note">自动保存的私人草稿；修改已发布文章时，线上版本保持不变。草稿最多显示最近 200 条。</p><div data-drafts>正在读取…</div>';
    try {
      const drafts=await ctx.api('/api/admin/drafts');
      root.querySelector('[data-drafts]').innerHTML=drafts.length?drafts.map(d=>`<div class="msgcard"><b>${esc(d.payload.title || d.payload.title_zh || d.payload.title_en || '未命名草稿')}</b><p class="meta">${d.kind==='news'?'资讯文章':'平台内容'} · ${d.ref_id ? '修改已有内容 #'+d.ref_id : '新内容'} · ${esc(d.updated_at)}</p><div class="rowbtns"><button class="btn btn--sm" data-open-draft="${d.id}">继续编辑</button><button class="btn btn--sm btn--danger" data-remove-draft="${d.id}">删除草稿</button></div></div>`).join(''):'<p class="empty">还没有草稿。到「资讯管理」或「内容审核」创建文章即可。</p>';
      root.querySelectorAll('[data-open-draft]').forEach(b=>b.onclick=async()=>{
        const d=drafts.find(x=>x.id===Number(b.dataset.openDraft));
        let original=null;
        if(d.ref_id){const rows=await ctx.api('/api/admin/'+d.kind);original=rows.find(x=>x.id===d.ref_id);if(!original){alert('原内容已删除，请保留草稿文字后重新创建');return;}}
        await ctx.loadTaxonomy();
        ctx.openForm(d.kind,{...(original || {}),...d.payload,id:d.ref_id},d);
      });
      root.querySelectorAll('[data-remove-draft]').forEach(b=>b.onclick=async()=>{
        if(!confirm('删除此草稿？线上文章不受影响。'))return;
        try {await ctx.api('/api/admin/drafts/'+b.dataset.removeDraft,{method:'DELETE'});draftsView(root,ctx);}catch(e){alert(e.message);}
      });
    } catch(e){root.querySelector('[data-drafts]').textContent=e.message;}
  }
  function attachMediaFields(ctx) {
    document.querySelectorAll('#mform .imgs').forEach(box=>{
      const button=document.createElement('button');button.type='button';button.className='btn btn--sm';button.textContent='从媒体库选择';box.after(button);
      button.onclick=()=>picker(ctx,r=>{
        const div=document.createElement('div');div.className='im';div.dataset.src=r.path;
        div.innerHTML=`<img src="${esc(ctx.toAdminPath(r.path))}" alt="${esc(r.alt)}"><button type="button" class="x">×</button>`;
        if(box.dataset.single)box.replaceChildren(div);else box.append(div);
      });
    });
  }
  window.TPEditor={attach,mediaView,draftsView,attachMediaFields};
})();
