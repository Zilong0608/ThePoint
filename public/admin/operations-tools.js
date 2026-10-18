(function () {
  'use strict';
  const esc=TPContent.esc;
  const labels={new:'待联系',contacted:'已联系',scheduled:'已预约',closed:'已结束'};
  const filters={q:'',status:''};
  async function enquiries(root,ctx){
    const panel=document.createElement('div');root.replaceChildren(panel);
    panel.innerHTML=`<h2>客户跟进</h2><p class="sub">跟踪留言和预约，分配现有管理员，保存内部备注与处理记录。状态和备注不会公开给访客。</p>
      <form class="lead-filters"><input name="q" placeholder="搜索姓名、电话、邮箱、房源或留言" value="${esc(filters.q)}"><select name="status"><option value="">全部状态</option>${Object.entries(labels).map(([k,v])=>`<option value="${k}"${filters.status===k?' selected':''}>${v}</option>`).join('')}</select><button class="btn btn--sm btn--solid" type="submit">筛选</button></form><p data-lead-message role="status" class="editor-note"></p><div data-leads>加载中…</div>`;
    const list=panel.querySelector('[data-leads]'),filter=panel.querySelector('form');let generation=0;
    let owners;
    try{owners=await ctx.api('/api/admin/enquiry-owners');}catch(e){list.textContent=e.message;return;}
    async function load(){
      const token=++generation;filters.q=filter.elements.q.value.trim();filters.status=filter.elements.status.value;
      panel.querySelector('[data-lead-message]').textContent='正在读取…';
      try{
        const rows=await ctx.api('/api/admin/enquiries?'+new URLSearchParams(filters));
        if(token!==generation||!panel.isConnected)return;
        panel.querySelector('[data-lead-message]').textContent=`共 ${rows.length} 条`;
        list.innerHTML=rows.length?rows.map(r=>`<article class="msgcard${r.is_read?'':' unread'}" data-lead="${r.id}">
          <div class="mh"><div><span class="tag">${ctx.TYPE_LABEL[r.type]||esc(r.type)}</span> <b>${esc(r.name||'未留名')}</b> <span class="tag lead-badge">${labels[r.lead_status]||'待联系'}</span></div><span class="meta">${esc(r.created_at)}</span></div>
          <p class="meta">${[r.phone,r.email].filter(Boolean).map(esc).join(' · ')}</p>
          ${r.property_title?`<p class="meta">房源：${esc(r.property_title)}</p>`:''}${r.agent_name?`<p class="meta">负责专家：${esc(r.agent_name)}</p>`:''}${r.vendor_name?`<p class="meta">入驻方：${esc(r.vendor_name)}</p>`:''}
          ${r.viewing_at?`<p class="viewing-request">意向看房时间：${esc(r.viewing_at.replace('T',' '))}（新西兰时间） · <span class="lead-viewing-state">${labels[r.lead_status]||'待联系'}</span></p>`:''}
          ${r.source?`<p class="meta">来源：${esc(ctx.SRC_LABEL[r.source]||r.source)}${ctx.utmText(r.utm)}</p>`:''}
          ${r.message?`<p>${esc(r.message)}</p>`:''}
          <form class="followup-form"><div class="followup-grid"><label>跟进状态<select name="lead_status">${Object.entries(labels).map(([k,v])=>`<option value="${k}"${r.lead_status===k?' selected':''}>${v}</option>`).join('')}</select></label><label>后台负责人<select name="assignee_id"><option value="">未分配</option>${owners.map(o=>`<option value="${o.id}"${r.assignee_id===o.id?' selected':''}>${esc(o.username)}</option>`).join('')}</select></label></div>
          <label>追加内部备注<textarea name="note" rows="2" maxlength="2000" placeholder="记录联系结果、客户需求或下次跟进事项；已有记录会保留"></textarea></label>
          <div class="rowbtns lead-actions"><button class="btn btn--sm btn--solid" type="submit">保存跟进</button><button class="btn btn--sm" type="button" data-history>查看记录</button>${!r.is_read?'<button class="btn btn--sm" type="button" data-read>标为已读</button>':''}<button class="btn btn--sm btn--danger" type="button" data-delete>删除</button></div><p class="editor-note" data-feedback role="status"></p></form>
          <div class="followup-history" hidden></div></article>`).join(''):'<div class="empty">没有符合条件的留言。</div>';
        list.querySelectorAll('[data-lead]').forEach(card=>{
          const row=rows.find(r=>r.id===Number(card.dataset.lead)),form=card.querySelector('form'),feedback=form.querySelector('[data-feedback]'),history=card.querySelector('.followup-history');
          async function showHistory(){
            history.hidden=false;history.textContent='读取跟进记录…';
            try{const notes=await ctx.api('/api/admin/enquiries/'+row.id+'/notes');history.innerHTML=notes.length?notes.map(n=>`<div class="followup-event"><div class="meta">${esc(n.author)} · ${esc(n.created_at)}</div><p class="meta">${esc(n.detail)}</p>${n.body?`<p>${esc(n.body)}</p>`:''}</div>`).join(''):'<p class="meta">还没有跟进记录。</p>';}catch(e){history.textContent=e.message;}
          }
          form.addEventListener('submit',async e=>{
            e.preventDefault();const button=form.querySelector('button[type=submit]');button.disabled=true;feedback.textContent='保存中…';
            try{
              const status=form.elements.lead_status.value;
              const result=await ctx.put('/api/admin/enquiries/'+row.id+'/follow-up',{version:row.followup_version||0,lead_status:status,assignee_id:form.elements.assignee_id.value||null,note:form.elements.note.value});
              row.followup_version=result.version;row.lead_status=status;form.elements.note.value='';card.querySelector('.lead-badge').textContent=labels[status];const viewing=card.querySelector('.lead-viewing-state');if(viewing)viewing.textContent=labels[status];
              card.classList.remove('unread');const read=card.querySelector('[data-read]');if(read)read.remove();feedback.textContent='已保存，记录已保留。';ctx.refreshBadge();await showHistory();
            }catch(err){feedback.textContent=err.message;}finally{button.disabled=false;}
          });
          card.querySelector('[data-history]').onclick=()=>{if(history.hidden)showHistory();else history.hidden=true;};
          const read=card.querySelector('[data-read]');if(read)read.onclick=async()=>{try{await ctx.put('/api/admin/enquiries/'+row.id+'/read',{});card.classList.remove('unread');read.remove();ctx.refreshBadge();}catch(e){feedback.textContent=e.message;}};
          card.querySelector('[data-delete]').onclick=async()=>{if(!confirm('删除这条留言及其内部跟进记录？此操作不可恢复。'))return;try{await ctx.del('/api/admin/enquiries/'+row.id);card.remove();ctx.refreshBadge();panel.querySelector('[data-lead-message]').textContent=`共 ${list.querySelectorAll('[data-lead]').length} 条`;}catch(e){feedback.textContent=e.message;}};
        });ctx.refreshBadge();
      }catch(e){panel.querySelector('[data-lead-message]').textContent=e.message;}
    }
    filter.addEventListener('submit',e=>{e.preventDefault();if([...list.querySelectorAll('textarea')].some(el=>el.value.trim())&&!confirm('筛选会离开当前列表，有未保存备注，仍继续？'))return;load();});
    await load();
  }
  const fields={name_zh:'中文名称',name_en:'英文名称',section_id:'板块',category_id:'分类',tagline_zh:'中文标语',tagline_en:'英文标语',intro_zh:'中文介绍',intro_en:'英文介绍',phone:'电话',email:'邮箱',wechat:'微信',website:'官网',logo:'Logo / 头像',photos:'展示图片'};
  function revisionBlock(v,ctx){
    const r=v.pending_revision;if(!r)return '';
    const post=ctx.kind==='posts',noun=post?'内容':'资料',attr=post?'data-post-revision':'data-revision';
    const allowed=post?v.status==='approved':v.status==='approved';
    const allFields={...fields,title_zh:'中文标题',title_en:'英文标题',content_zh:'中文正文',content_en:'英文正文',price_label:'价格显示',price_value:'价格数值',images:'内容图片',location:'地点',contact_phone:'联系电话',contact_wechat:'联系微信',contact_email:'联系邮箱',event_time:'活动时间',video_url:'视频链接',content_format:'正文格式'};
    const value=(field,val)=>{
      if(field==='section_id')return esc((ctx.sections.find(s=>s.id===Number(val))||{}).name_zh||'未选择');
      if(field==='category_id')return esc((ctx.categories.find(s=>s.id===Number(val))||{}).name_zh||'未选择');
      if(field==='logo'||field==='photos'||field==='images'){
        let imgs=field==='logo'?(val?[val]:[]):[];if(field==='photos'||field==='images'){try{imgs=Array.isArray(val)?val:JSON.parse(val||'[]');}catch(_){}}
        return imgs.length?imgs.map(src=>`<img class="revision-image" src="${esc(ctx.toAdminPath(src))}" alt="资料图片" loading="lazy">`).join(''):'<span class="meta">无图片</span>';
      }
      return esc(val == null || val===''?'（空）':val);
    };
    return `<section class="vendor-revision"><h4>${noun}修改待审核 · 版本 #${r.id}</h4><p class="meta">${esc(r.created_at)} 提交。左侧为当前线上内容，右侧为申请内容；审核期间原版本继续展示。</p>
      <div class="revision-table"><table><thead><tr><th>字段</th><th>当前线上</th><th>申请修改</th></tr></thead><tbody>${Object.keys(r.payload).map(k=>`<tr><th>${allFields[k]||esc(k)}</th><td>${value(k,v[k])}</td><td>${value(k,r.payload[k])}</td></tr>`).join('')}</tbody></table></div>
      <div class="rowbtns lead-actions"><button class="btn btn--sm btn--solid" ${attr}-approve="${r.id}"${!allowed?' disabled':''}>通过${noun}修改</button><button class="btn btn--sm btn--danger" ${attr}-reject="${r.id}">驳回${noun}修改</button></div></section>`;
  }
  async function staff(root,ctx){
    const names={admin:'管理员',editor:'编辑',reviewer:'审核',support:'客服'};
    root.innerHTML='<h2>后台员工</h2><p class="sub">管理员管理账号和系统；编辑维护内容；审核处理内容及商家审核；客服处理客户跟进。停用、改角色或重置密码会立即撤销该账号的登录。</p><div data-staff-list>读取中…</div><div class="msgcard"><h3>新增后台账号</h3><form data-new-staff class="followup-form"><div class="followup-grid"><label>账号<input name="username" required pattern="[A-Za-z0-9_-]{3,40}" autocomplete="off"></label><label>初始密码（至少 10 位）<input name="password" type="password" required minlength="10" autocomplete="new-password"></label><label>角色<select name="role">'+Object.entries(names).reverse().map(([k,v])=>`<option value="${k}">${v}</option>`).join('')+'</select></label></div><button class="btn btn--solid btn--sm" type="submit">创建账号</button><p data-staff-message role="status"></p></form></div>';
    const target=root.querySelector('[data-staff-list]'),form=root.querySelector('[data-new-staff]');
    form.method='post';
    form.onsubmit=async e=>{e.preventDefault();const b={};new FormData(form).forEach((v,k)=>b[k]=v);try{await ctx.post('/api/admin/staff',b);ctx.toast('后台账号已创建');if(form.isConnected)staff(root,ctx);}catch(err){form.querySelector('[data-staff-message]').textContent=err.message;}};
    try{
      const rows=await ctx.api('/api/admin/staff');
      target.innerHTML=rows.map(r=>`<div class="msgcard"><b>${esc(r.username)}</b><form data-staff-id="${r.id}" class="followup-form"><div class="followup-grid"><label>角色<select name="role">${Object.entries(names).map(([k,v])=>`<option value="${k}"${r.role===k?' selected':''}>${v}</option>`).join('')}</select></label><label>状态<select name="status"><option value="active"${r.status==='active'?' selected':''}>正常</option><option value="disabled"${r.status==='disabled'?' selected':''}>停用</option></select></label><label>重置密码（留空不变）<input name="new_password" type="password" minlength="10" autocomplete="new-password"></label></div><button type="submit" class="btn btn--sm">保存员工设置</button><p role="status"></p></form></div>`).join('');
      target.querySelectorAll('form').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const b={};new FormData(f).forEach((v,k)=>b[k]=v);try{await ctx.put('/api/admin/staff/'+f.dataset.staffId,b);f.elements.new_password.value='';f.querySelector('p').textContent='已保存，账号原登录已失效。';}catch(err){f.querySelector('p').textContent=err.message;}});
    }catch(e){target.textContent=e.message;}
  }
  window.TPOperations={enquiries,revisionBlock,staff};
})();
