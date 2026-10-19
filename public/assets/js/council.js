(function(){
  'use strict';
  const sharedLanguage=new URLSearchParams(location.search).get('lang');
  if(['zh','en'].includes(sharedLanguage)&&sharedLanguage!==window.TP.lang){window.TP.setLang(sharedLanguage);return;}
  const en=window.TP?.lang==='en',esc=window.TP.esc,$=id=>document.getElementById(id),tr=(zh,eng)=>en?eng:zh;
  const content=window.TPCouncilContent.create(en?'en':'zh');
  const put=(id,zh,eng)=>$(id).textContent=tr(zh,eng);
  document.title=tr('物业资料查询 · THE POINT','Property research · THE POINT');
  document.querySelector('.council-page > .eyebrow').textContent=tr('THE POINT · 奥克兰','THE POINT · AUCKLAND');
  document.querySelector('.footer-bottom a[href="privacy.html"]').textContent=tr('隐私政策','Privacy');
  put('research-title','看清一块地，再做下一步。','Understand the land. Plan your next step.');
  put('research-intro','奥克兰物业资料查询 · 官方来源、地图展示、规划文件。','Auckland property research · Official sources, map layers and planning documents.');
  put('address-label','输入门牌号和街道名查询；多个结果时请选择具体地址','Enter a street number and street; select an address if several match');
  put('address-submit','查询地址','Find address');
  put('research-instruction','唯一相交主地块会自动用于查询；多个地块时请核实后选择。主地块不等于完整产权范围。也可直接点击地图查询。','A unique intersecting primary parcel is queried automatically; choose explicitly when several parcels match. A primary parcel is not a complete title boundary. You can also click the map.');
  put('research-retry','重新查询','Retry');
  put('report-locate','定位所查范围','Locate query extent');put('report-print','打印／保存为文档','Print / Save as PDF');put('report-share','复制查询链接','Copy query link');put('report-download','下载本次资料','Download this query');
  put('library-title','规划文件资料库','Planning document library');put('library-note','按标题或地区关键词查阅本站已收录的公开文件。资料库结果不代表文件适用于当前物业。','Browse catalogued public documents by title or area keyword. Library results do not establish applicability to the selected property.');put('library-label','地区或文件名称','Area or document title');put('library-submit','搜索文件','Search documents');
  put('research-note-title','如何理解这些资料','Understanding these results');
  put('research-note-text','本页仅提供资料参考，不构成可开发性或可分割性的结论。工作版本、拟议变更、已通过规划和现行规则会有所不同，必须结合官方计划正文核实。土地分区不等于开发许可；总体规划和结构规划也不等于现行土地分区。主地块可能包含道路、水域等，并不等于完整产权范围；公寓、交叉租赁和多地块物业需额外核实。','This is reference information, not a development or subdivision assessment. Working versions, proposed changes, adopted plans and operative rules differ; verify against the official plan text. Zoning is not development approval, and a master or structure plan is not operative zoning. Primary parcels may include roads or water and are not a complete title boundary. Apartments, cross leases and properties spanning multiple parcels require further checks.');
  put('research-privacy','提交地址或点击地图后，相关地址或坐标将通过本站发送给新西兰土地信息局和奥克兰市议会查询。地图底图由开放街图提供。','Submitted addresses and map coordinates are sent through this site to LINZ / Auckland Council. The basemap is provided by OpenStreetMap.');
  put('official-viewer','官方统一规划地图与原文','Official Unitary Plan viewer and documents');
  put('map-legend','蓝色边界为地块，金色为分区，紫色为规划变更，绿色为特别规划区，红色为指定用途。青蓝色为洪水或径流资料，灰色为雨水管线，玫红色为高度控制；各图层可单独开关。','Blue boundary: parcel; gold: zoning; purple: plan change; green: precinct; red: designation. Cyan/blue: flood and runoff layers; grey: stormwater pipes; rose: height controls. Toggle layers individually.');
  put('selected-address','选择地址或地图位置','Choose an address or map location');
  $('research-address').placeholder=tr('例如：门牌号 + 街道 + Albany','Street number + street + suburb');
  let map,marker,last,epoch=0,searchEpoch=0,lastResult=null;
  let mapReady;
  const layers={};
  const layerNames={parcels:tr('地块边界','Parcel boundaries'),zones:tr('土地分区','Zoning'),changes:tr('第120号规划摘要','PC120 summary'),planchanges:tr('通用规划变更','General plan changes'),planareas:tr('官方规划范围与文件','Official planning areas and documents'),precincts:tr('特别规划区','Precincts'),designations:tr('指定用途','Designations'),...Object.fromEntries(Object.entries(content.layerInfo).map(([key,value])=>[key,value.title]))};
  const displayNames={...layerNames,documents:tr('规划文件与区域参考','Planning documents and regional references')};
  const coreLayers=['parcels','zones','planchanges'];
  let selected=new Set(coreLayers);
  try{const saved=JSON.parse(localStorage.getItem('council-display-layers'));if(Array.isArray(saved))selected=new Set(saved.filter(name=>Object.hasOwn(displayNames,name)));}catch{}
  const options=document.createElement('details');options.className='research-display-options';options.id='research-display-options';
  options.innerHTML=`<summary id="display-summary"></summary><p>${tr('勾选想看的资料，地图和下方结果会同步显示。未勾选不代表没有相关风险或限制。','Choose the information to display on the map and in the results. Unselected categories do not establish the absence of risks or restrictions.')}</p><fieldset><legend>${tr('显示资料','Information to display')}</legend><div class="research-display-grid">${Object.entries(displayNames).map(([name,label])=>`<label><input type="checkbox" data-display-layer="${name}"${selected.has(name)?' checked':''}>${esc(label)}</label>`).join('')}</div></fieldset><div class="research-tools"><button type="button" class="btn btn--sm" id="display-core">${tr('仅显示核心资料','Core information only')}</button><button type="button" class="btn btn--sm" id="display-all">${tr('全部显示','Show all')}</button><button type="button" class="btn btn--sm" id="display-none">${tr('全部取消','Clear selection')}</button></div>`;
  $('research-layer-status').before(options);
  function updateSelection(){
    $('display-summary').textContent=tr(`\u9009\u62e9\u60f3\u770b\u7684\u8d44\u6599\uff08\u5df2\u9009 ${selected.size} \u9879\uff09`,`Choose information (${selected.size} selected)`);
    options.querySelectorAll('[data-display-layer]').forEach(input=>input.checked=selected.has(input.dataset.displayLayer));
    try{localStorage.setItem('council-display-layers',JSON.stringify([...selected]));}catch{}
    if(lastResult)refreshResult(lastResult);
    Object.entries(layers).forEach(([name,layer])=>{if(selected.has(name)){if(!map.hasLayer(layer))map.addLayer(layer);}else if(map.hasLayer(layer))map.removeLayer(layer);});
  }
  options.onchange=event=>{const name=event.target.dataset.displayLayer;if(!name)return;event.target.checked?selected.add(name):selected.delete(name);updateSelection();};
  $('display-core').onclick=()=>{selected=new Set(coreLayers);updateSelection();};
  $('display-all').onclick=()=>{selected=new Set(Object.keys(displayNames));updateSelection();};
  $('display-none').onclick=()=>{selected.clear();updateSelection();};
  updateSelection();
  function showLocation(lat,lng,label){
    if(!map)return;
    map.invalidateSize();map.setView([lat,lng],18);
    if(marker)marker.remove();
    const text=document.createElement('span');text.textContent=label||`${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    marker=L.marker([lat,lng]).addTo(map).bindPopup(text).openPopup();
  }
  function drawResult(result){
    if(!map||!result)return;
    for(const name of Object.keys(layerNames)){
      const layer=layers[name],source=result[name];if(!layer||!source)continue;layer.clearLayers();
      if(source.status==='ok'&&source.features.length){
        layer.addData({type:'FeatureCollection',features:source.features});
        if(selected.has(name)&&!map.hasLayer(layer))map.addLayer(layer);
      }
    }
    if(result.mode==='parcel'&&layers.parcels.getBounds().isValid())map.fitBounds(layers.parcels.getBounds(),{padding:[24,24],maxZoom:18});
  }
  const errorMessage=status=>status===400?tr('请输入门牌号及街道名（例如 104/22 Library Lane），或在奥克兰范围内选点。','Enter a street number and street name (for example 104/22 Library Lane), or choose a point within Auckland.'):status===429?tr('查询较多，请一分钟后重试。','Too many requests. Try again in one minute.'):tr('官方资料暂时不可用，请稍后重试。','Official information is temporarily unavailable. Please retry later.');
  async function api(path,signal){const timeout=AbortSignal.timeout(path.includes('/lookup')?60000:20000);const r=await fetch(path,{signal:signal?AbortSignal.any([signal,timeout]):timeout});if(!r.ok)throw Object.assign(Error(errorMessage(r.status)),{status:r.status});return r.json();}
  function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='aucklandcouncil.govt.nz'||u.hostname.endsWith('.aucklandcouncil.govt.nz')||u.hostname==='data.linz.govt.nz'||u.hostname==='services.arcgis.com'||u.hostname==='services1.arcgis.com'||u.hostname==='aucklandcouncil.maps.arcgis.com'||u.hostname==='experience.arcgis.com')?u.href:null;}catch{return null;}}
  const link=(url,label)=>safeUrl(url)?`<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${esc(label)}</a>`:'';
  function metadata(r){return `<details class="research-source"><summary>${tr('来源与更新时间','Source and dates')}</summary><p class="research-meta">${link(r.source,tr('官方数据源','Official source'))}${r.fetched_at?' · '+esc(tr('查询时间：','Retrieved: ')+new Date(r.fetched_at).toLocaleString(en?'en-NZ':'zh-CN')):''}</p><p class="research-meta">${r.source_updated_at?esc(tr('来源记录的资料修改时间：','Source-reported data modification: ')+new Date(r.source_updated_at).toLocaleString(en?'en-NZ':'zh-CN')):tr('来源更新时间：未提供；查询时间不等于资料更新时间。','Source update time: not supplied. Retrieval time is not the source update time.')}</p></details><p class="research-meta">${r.source?.includes('linz.govt.nz')?tr('© 新西兰土地信息局 · 知识共享署名4.0许可','© LINZ · CC BY 4.0'):tr('© 奥克兰市议会','© Auckland Council')+' · '+link('https://www.aucklandcouncil.govt.nz/geospatial/how-to-use-council-open-data/Pages/user-licence-auckland-council-open-data.aspx',tr('资料使用条款','Data terms'))}</p>`;}
  function parcelCard(p){
    const rows=p.features.slice(0,20).map((f,index)=>{const properties=f.properties||{},area=Number(properties.survey_area??properties.calc_area);return `<section class="research-record"><h4>${tr('候选地块','Candidate parcel')} ${index+1}</h4>${parcelFacts(properties)}<p>${tr('地块编号：','Parcel ID: ')}${esc(properties.id??tr('未提供','Not supplied'))}</p>${Number.isFinite(area)&&area>0?`<p>${tr('官方记录面积：','Source-recorded area: ')}${area.toLocaleString(en?'en-NZ':'zh-CN')} ${tr('平方米','m²')}</p>`:''}<p>${tr('法定描述和关联产权编号请在官方原始记录中核对。','Verify the legal description and associated title IDs in the original source record.')}</p><button type="button" class="btn btn--sm" data-parcel="${esc(properties.id)}">${tr('使用此地块查询','Query this parcel')}</button><button type="button" class="research-raw" data-source-record="parcels:${index}">${tr('下载官方原始记录','Download original source record')}</button></section>`;}).join('');
    return `<article class="research-card"><h3>${tr('地块边界与法定描述','Parcels and legal descriptions')}</h3>${p.status!=='ok'?`<p class="research-warning">${tr('暂时无法取得官方地块边界，不能确认土地范围、面积或法定描述。其他已返回的资料仍可查看。','Official parcel boundaries are temporarily unavailable. Extent, area and legal descriptions cannot be confirmed. Other returned information remains available.')}</p>`:rows||`<p>${tr('未找到相交地块，请核实地址位置。','No intersecting parcel was found. Check the location.')}</p>`}${p.truncated?`<p class="research-warning">${tr('候选地块超过显示上限，结果可能不完整。','The parcel result limit was reached. Results may be incomplete.')}</p>`:''}${metadata(p)}</article>`;
  }
  function documentsCard(documents,catalog=false){
    const stages={draft:tr('草案','Draft'),consultation:tr('征询中','In consultation'),adopted:tr('已通过','Adopted'),unknown:tr('待核实','Unverified')};
    return `<article class="research-card"><h3>${tr('总体、结构及其他规划文件','Master, structure and other planning documents')}</h3><p>${catalog?tr('以下仅为资料库收录文件，没有匹配当前物业范围。','These are catalogued documents; no property-coverage match has been performed.'):tr('文件按后台标注范围匹配，是否适用仍需核实原文。已通过的规划文件也不等于现行土地分区。','Documents are matched using staff-defined coverage. Verify applicability in the original. An adopted planning document is not the same as operative zoning.')}</p>${documents.length?documents.map(d=>{const title=en?d.title_en:d.title;const valid=title&&(en?!/[\u3400-\u9fff]/.test(title):/[\u3400-\u9fff]/.test(title));return `<p>${link(d.url,valid?title:tr('查看官方规划文件（中文标题待补充）','View official planning document (English title unavailable)'))} · ${esc(stages[d.stage]||stages.unknown)}${d.document_date?' · '+esc(d.document_date):''}${d.coverage_kind==='unverified_overlap'?` <strong>${tr('范围相交尚待核实','Coverage overlap requires verification')}</strong>`:''}</p>`;}).join(''):`<p>${tr('尚未收录此位置经核实的规划文件。这是本站资料待补充，不代表当地没有规划。','No verified document is catalogued for this location yet. This is a gap in this site’s records, not evidence that no plan exists.')}</p>`}</article>`;
  }
  function referenceCard(documents){
    if(!documents.length)return '';
    return `<article class="research-card"><h3>${tr('奥克兰区域规划参考资料','Auckland regional planning references')}</h3><p class="research-warning">${tr('以下是已核实来源的区域参考文件，不是此物业的适用规划匹配结果。文件日期不代表当前状态，请核实最新版本及适用边界。','These are verified regional source documents, not property-applicable matches. Document dates do not establish current status. Verify the latest version and applicability boundaries.')}</p>${documents.map(d=>`<p>${link(d.url,en?d.title_en:d.title)} · ${esc(d.date)}</p>`).join('')}</article>`;
  }
  function controlCard(name,source){
    if(!source)return '';
    const groups=[];
    source.features.forEach((f,index)=>{const key=name==='planchanges'?JSON.stringify([f.properties?.NUMBER,f.properties?.STATUS,f.properties?.DOCUMENTURL,f.properties?.MAPLAYER]):String(index);const group=groups.find(g=>g.key===key);if(group)group.indices.push(index);else groups.push({key,feature:f,index,indices:[index]});});
    const records=groups.map(g=>{
      const p=g.feature.properties||{},reference=name==='planareas'?(lastResult?.reference_documents||[]).find(d=>d.source_titles?.includes(p.PlanTitle)):null;
      const url=reference?.url||p.DocumentURL||p.DOCUMENTURL||p.DocumentLink||p.PDF_Link;
      return content.feature(name,g.feature,g.index)+(g.indices.length>1?`<p class="research-meta">${tr(`同一变更返回${g.indices.length}个空间片段，地图保留全部范围。`,`This change returned ${g.indices.length} spatial parts; all are retained on the map.`)}</p>`+g.indices.slice(1).map(index=>`<button type="button" class="research-raw" data-source-record="${name}:${index}">${tr('下载其他空间记录','Download additional spatial record')} ${index+1}</button>`).join(''):'')+link(url,reference?tr('已核实的对应参考文件（仍需核实最新版本）','Verified related reference document (check the latest version)'):tr('对应官方文件','Related official document'));
    }).join('');
    return `<article class="research-card" data-layer-card="${name}"><h3>${layerNames[name]}</h3>${content.layerInfo[name]?`<p>${content.layerInfo[name].note}</p>`:''}${source.status!=='ok'?`<p class="research-warning">${tr('官方图层暂不可用，本项结论未知。','The official layer is unavailable. This result is unknown.')}</p>`:source.features.length?`<p class="research-hit">${tr('查到相交记录：','Intersecting records: ')}${source.features.length}</p>`+(groups.length>3?`<details><summary>${tr('查看相交记录','View intersecting records')} (${source.features.length})</summary>${records}</details>`:records):`<p>${name==='planareas'?tr('本次官方规划范围图层未返回相交项目，不代表没有其他规划文件。','The official planning-area layer returned no intersecting project. Other planning documents may still exist.'):tr('本次查询未返回相交记录，不代表不存在其他风险或限制。','No intersecting records were returned. Other risks or restrictions may still apply.')}</p>`}${source.geometry_simplified?`<p class="research-meta">${tr('地图展示图形经过适当简化；相交查询仍使用官方范围，图形不能用于测量。','Display geometry is simplified. Intersection queries use the official extent; display shapes are not for measurement.')}</p>`:''}${source.truncated?`<p class="research-warning">${tr('返回数量达到上限，资料可能不完整。','The result limit was reached. Information may be incomplete.')}</p>`:''}${metadata(source)}</article>`;
  }
  function parcelFacts(p){
    const match=String(p.appellation||'').match(/^Lot (\d+) DP (\d+)$/);
    const description=en?p.appellation:match?`第${match[1]}号地段；测量图号：DP ${match[2]}`:tr('法定描述原文见下载记录','See the downloaded source record');
    const titles=String(p.titles||'').split(',').map(v=>v.trim()).filter(v=>/^[A-Za-z0-9./-]+$/.test(v));
    return `<p><b>${tr('法定地块描述：','Legal parcel description: ')}</b>${esc(description||tr('未提供','Not supplied'))}</p>${titles.length?`<p>${tr('关联产权编号：','Associated title IDs: ')}${esc(titles.slice(0,6).join('、'))}${titles.length>6?tr(`（共${titles.length}个，完整列表见下载记录）`,` (${titles.length} total; full list in the source download)`):''}</p>`:''}`;
  }
  function riskGroup(r){
    const names=['floodplains','floodprone','flowpaths','stormwater','water','wastewater'].filter(name=>r[name]&&selected.has(name));
    if(!names.length)return '';
    const hits=names.filter(name=>r[name].status==='ok'&&r[name].features.length).length,unknown=names.filter(name=>r[name].status!=='ok').length;
    const heading=hits?tr(`${hits}项资料有相交记录`,`${hits} layers have intersecting records`):tr('未返回相交记录，不代表无风险','No intersecting records; not a no-risk finding');
    return `<details class="research-group" id="research-risks"${hits||unknown?' open':''}><summary>${tr('自然灾害与管网资料','Natural hazards and utility networks')} · ${heading}${unknown?tr(`；${unknown}项未知`,`; ${unknown} unknown`):''}</summary><p class="research-warning">${tr('以下仅是官方图层的相交查询，不是洪水概率、保险、工程或可开发性评估。未覆盖全部传输管网及私有设施。','These are official-layer intersection queries, not flood probability, insurance, engineering or development assessments. Not all transmission networks or private assets are covered.')}</p>${names.map(name=>controlCard(name,r[name])).join('')}</details>`;
  }
  function renderResult(r){
    if(!selected.size)return `<p class="research-empty-selection">${tr('尚未选择资料，请在上方勾选要查看的项目。','No information selected. Choose categories above.')}</p>`;
    const planning=['zones','planchanges','changes','precincts','designations','heights'].filter(name=>selected.has(name)&&r[name]);
    const sections=[];
    if(selected.has('parcels'))sections.push(['research-parcel',tr('地块','Parcel'),parcelCard(r.parcels)]);
    if(planning.length)sections.push(['research-planning',tr('规划','Planning'),planning.map(name=>['zones','changes'].includes(name)?card(name,r[name]):controlCard(name,r[name])).join('')]);
    const risks=riskGroup(r);
    if(risks)sections.push(['research-risks',tr('风险与管网','Hazards and utilities'),risks]);
    const docs=(selected.has('planareas')?controlCard('planareas',r.planareas):'')+(selected.has('documents')?documentsCard(r.documents)+referenceCard(r.reference_documents||[])+`<article class="research-card"><h3>${tr('其他规划变更','Other plan changes')}</h3><p>${tr('本页可能未涵盖全部规划变更。总目录不是本物业的适用规划匹配结果，请核实最新文件及适用范围。','This page may not include every plan change. The register is not a property applicability match; verify current documents and boundaries.')}</p>${link('https://new.aucklandcouncil.govt.nz/en/plans-policies-bylaws-reports-projects/our-plans-strategies/unitary-plan/auckland-unitary-plan-modifications/proposed-plan-changes.html',tr('查看官方规划变更总目录','View the official plan-change register'))}</article>`:'');
    if(docs)sections.push(['research-documents',tr('规划文件','Documents'),docs]);
    return (coreLayers.every(name=>selected.has(name))?content.overview(r):'')+`<nav class="research-jump" aria-label="${tr('查询结果分类','Query result sections')}">${sections.map(([id,label])=>`<a href="#${id}">${label}</a>`).join('')}</nav>`+sections.map(([id,label,html])=>id==='research-risks'?html:`<section id="${id}">${html}</section>`).join('');
  }
  function refreshResult(r){
      $('research-layer-status').innerHTML=Object.keys(layerNames).filter(name=>r[name]&&selected.has(name)).map(name=>{const source=r[name],ok=source.status==='ok';return `<span class="research-layer-state ${ok&&source.features.length?'has-data':'no-data'}"><b>${layerNames[name]}</b> · ${ok?(source.features.length?tr('已显示 ','Shown: ')+source.features.length:tr('未返回相交记录','No intersecting records')):tr('服务暂时不可用','Source unavailable')}</span>`;}).join('');
    $('research-results').innerHTML=renderResult(r);
      $('research-results').querySelectorAll('[data-source-record]').forEach(button=>button.onclick=()=>{const [name,index]=button.dataset.sourceRecord.split(':');const record=r[name]?.features[Number(index)];if(!record)return;const {original_properties,contains_query_point,...feature}=record;const original=original_properties?{...feature,properties:original_properties}:feature;const blob=new Blob([JSON.stringify({source:r[name].source,fetched_at:r[name].fetched_at,geometry_simplified:!!r[name].geometry_simplified,record:original},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='official-'+name+'-'+index+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    $('research-results').querySelectorAll('[data-parcel]').forEach(button=>button.onclick=()=>lookup(last.lat,last.lng,last.label,button.dataset.parcel));
  }
  function downloadReport(){
    if(!lastResult)return;
    const data={displayed_categories:[...selected],label:last.label||'',retrieved_at:new Date().toISOString(),...lastResult};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='thepoint-property-research.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $('report-download').onclick=downloadReport;
  $('report-locate').onclick=()=>{if(lastResult?.mode==='parcel'&&layers.parcels?.getBounds().isValid())map.fitBounds(layers.parcels.getBounds(),{padding:[24,24],maxZoom:18});else if(last)showLocation(last.lat,last.lng,last.label);};
  $('report-share').onclick=async()=>{if(!last)return;const url=new URL('council.html',location.href);url.search=new URLSearchParams({lat:last.lat,lng:last.lng,...(lastResult?.parcel_id?{parcel:lastResult.parcel_id}:{}),...(last.label?{address:last.label}:{}),lang:en?'en':'zh'});try{await navigator.clipboard.writeText(url.href);$('report-feedback').textContent=tr('已复制链接。接收方打开后点击“查询此位置”即可重新获取资料。','Link copied. The recipient can click “Query this location” to retrieve fresh information.');}catch{$('report-feedback').textContent=tr('无法自动复制，请复制此链接：','Copy this link: ')+url.href;}};
  let printState=[];
  window.addEventListener('beforeprint',()=>{if(printState.length)return;printState=[...document.querySelectorAll('#research-results details')].map(d=>[d,d.open]);printState.forEach(([d])=>d.open=true);});
  window.addEventListener('afterprint',()=>{printState.forEach(([d,open])=>d.open=open);printState=[];});
  $('report-print').onclick=()=>window.print();
  let libraryEpoch=0;
  $('library-form').onsubmit=async event=>{
    event.preventDefault();const token=++libraryEpoch;$('library-status').textContent=tr('正在读取文件…','Loading documents…');
    try{const r=await api('/api/council/documents?'+new URLSearchParams({q:$('library-query').value.trim()}));if(token!==libraryEpoch)return;$('library-results').innerHTML=(r.items.length?documentsCard(r.items,true):'')+referenceCard(r.reference_documents||[]);$('library-status').textContent=r.items.length||r.reference_documents?.length?(r.truncated?tr('结果较多，请细化关键词。','More results exist. Refine your keywords.'):tr('以下仅是资料库检索结果，不是物业范围匹配。','These are catalogue results, not property-coverage matches.')):tr('未找到已收录文件，不代表当地没有规划。','No catalogued document matched. This does not mean no plan exists.');}catch(e){if(token===libraryEpoch)$('library-status').textContent=e.message;}
  };
  function card(name,r){
    const title=name==='zones'?tr('土地分区','Zoning'):tr('第120号规划变更公开摘要','PC120 published plan change summary');
    if(r.status!=='ok')return `<article class="research-card"><h3>${title}</h3><p class="research-warning">${tr('官方数据源暂时不可用。这不代表此处没有分区或规划变更。','The official source is unavailable. This does not mean there is no zoning or plan change here.')}</p>${metadata(r)}</article>`;
    const main=r.features.flatMap((f,index)=>f.contains_query_point!==false?[content.feature(name,f,index)]:[]).join('');
    const other=r.features.flatMap((f,index)=>f.contains_query_point===false?[content.feature(name,f,index)]:[]).join('');
    const records=main+(other?`<details class="research-other"><summary>${tr('与地块相交的其他范围记录','Other records intersecting the parcel')} (${r.features.filter(f=>f.contains_query_point===false).length})</summary><p class="research-warning">${tr('以下范围不包含地址点，可能只是地块边界接触，也可能覆盖地块其他部分。不能直接当作地址点所在分区或本物业适用规则。','These extents do not contain the address point. They may only touch the parcel boundary or cover another part of it. They are not automatically the address-point zoning or applicable property rules.')}</p>${other}</details>`:'');
    return `<article class="research-card"><h3>${title}</h3><p class="research-warning">${name==='zones'?tr('来源为奥克兰市议会发布的统一规划基础分区。请核实每条记录的状态及计划正文。','Source: Council’s published Unitary Plan Base Zone. Verify each record’s version status and the official plan text.'):tr('此图层仅涵盖第120号规划变更的公开摘要，不包含所有规划变更，也不代表已生效规则。须核实最新修订、决定、上诉及生效状态。','This layer covers Council’s published PC120 summary only, not all plan changes or operative rules. Verify the latest revisions, decisions, appeals and operative status.')}</p>${records||'<p>'+tr('本次查询没有返回相交记录，不能据此认定没有规划限制。','No intersecting records were returned. This does not establish the absence of planning restrictions.')+'</p>'}${r.truncated?'<p class="research-warning">'+tr('返回数量已达上限，资料可能不完整。','The result limit was reached; results may be incomplete.')+'</p>':''}${metadata(r)}</article>`;
  }
  async function lookup(lat,lng,label,parcel){
    const token=++epoch;last={lat,lng,label,parcel};$('research-retry').hidden=true;
    lastResult=null;
    $('report-tools').hidden=true;$('report-feedback').textContent='';
    $('research-layer-status').textContent=tr('已选位置，正在加载边界、分区及第120号规划图层…','Location selected. Loading parcel, zoning and PC120 layers…');
    $('research-results').replaceChildren();$('research-status').textContent=tr('正在查询官方资料…','Querying official sources…');
    document.querySelector('.research-panel').setAttribute('aria-busy','true');
    $('selected-address').textContent=label||`${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    showLocation(lat,lng,label);
    Object.values(layers).forEach(l=>l.clearLayers());
    try{
      const r=await api('/api/council/lookup?'+new URLSearchParams({lat,lng,auto:'1',...(parcel?{parcel}: {})}));if(token!==epoch)return;
      lastResult=r;
      $('report-tools').hidden=false;
      $('research-status').textContent=(r.selection==='unique_primary_parcel'?tr('已自动采用唯一相交主地块。','The unique intersecting primary parcel was selected automatically. '):'')+(r.mode==='parcel'?tr('当前查询所选主地块的相交图层，含边界接触，不代表覆盖比例或完整产权范围。','Query: layers intersecting the selected primary parcel, including boundary touches. This is not a coverage percentage or complete title extent.'):tr('当前仅为点位查询。请核实并选择下方地块，不能将点位资料当成整块物业资料。','Point query only. Verify and select a parcel below before assessing a whole property.'));
      refreshResult(r);
      drawResult(r);

      if(Object.keys(layerNames).some(name=>r[name]?.status==='unavailable'))$('research-retry').hidden=false;
    }catch(e){if(token!==epoch)return;$('research-status').textContent=e.message;$('research-layer-status').textContent=tr('资料加载失败；地图上的标记仅表示选中的位置。','Information failed to load. The marker shows the selected location only.');$('research-retry').hidden=false;}
    finally{if(token===epoch)document.querySelector('.research-panel').setAttribute('aria-busy','false');}
  }
  $('research-retry').onclick=()=>last&&lookup(last.lat,last.lng,last.label,last.parcel);
  const initialAddress=new URLSearchParams(location.search).get('address');if(initialAddress)$('research-address').value=initialAddress.slice(0,160);
  const sharedParams=new URLSearchParams(location.search),sharedLat=Number(sharedParams.get('lat')),sharedLng=Number(sharedParams.get('lng')),sharedParcel=sharedParams.get('parcel');
  if(sharedParams.get('lat')?.trim()&&sharedParams.get('lng')?.trim()&&Number.isFinite(sharedLat)&&Number.isFinite(sharedLng)&&sharedLat>=-37.35&&sharedLat<=-35.8&&sharedLng>=174&&sharedLng<=175.65&&(!sharedParcel||/^\d{1,12}$/.test(sharedParcel))){
    const button=document.createElement('button');button.type='button';button.className='btn btn--sm';button.textContent=tr('查询此位置','Query this location');button.onclick=async()=>{await mapReady;lookup(sharedLat,sharedLng,initialAddress||'',sharedParcel||undefined);};$('address-results').append(button);
  }
  let searchController;
  async function selectAddress(item){
    const selection=++searchEpoch;$('address-results').replaceChildren();$('research-address').value=item.label;
    $('address-submit').disabled=false;
    await mapReady;
    if(selection!==searchEpoch)return;
    document.querySelector('.research-layout').scrollIntoView({behavior:'smooth',block:'start'});
    lookup(item.latitude,item.longitude,item.label);
  }
  $('address-search').onsubmit=async e=>{
    e.preventDefault();const token=++searchEpoch;searchController?.abort();searchController=new AbortController();$('address-results').textContent=tr('正在查找地址…','Looking up addresses…');$('address-submit').disabled=true;
    try{const r=await api('/api/council/addresses?'+new URLSearchParams({q:$('research-address').value.trim()}),searchController.signal);if(token!==searchEpoch)return;
      const box=$('address-results');box.replaceChildren();
      if(!r.items.length)box.textContent=tr('未找到奥克兰匹配地址，请使用完整街道地址或在地图选点。','No Auckland address matched. Enter a full street address or choose a map point.');
      else if(r.items.length===1&&!r.truncated){await selectAddress(r.items[0]);}
      else{box.className='research-candidates';const instruction=document.createElement('p');instruction.textContent=tr('找到多个地址，请点击其中一个，地图才会显示对应资料。','Several addresses matched. Select one below to show its map and information.');box.append(instruction);r.items.slice(0,20).forEach(item=>{const b=document.createElement('button');b.type='button';b.textContent=tr('查看地图与规划：','Show map and planning: ')+item.label;b.onclick=()=>selectAddress(item);box.append(b);});if(r.truncated){const p=document.createElement('p');p.textContent=tr('匹配较多，请填写更完整的地址。','More matches exist. Enter a more specific address.');box.append(p);}}
    }catch(e){if(token===searchEpoch)$('address-results').textContent=e.name==='AbortError'?'':e.message;}finally{if(token===searchEpoch)$('address-submit').disabled=false;}
  };
  async function init(){
    try{const config=await api('/api/council/config');$('research-config').textContent=config.addresses_configured?tr('地址和地块来源：新西兰土地信息局；目前仅覆盖奥克兰。','Addresses and parcels: LINZ · Auckland only.'):tr('地址和地块服务待配置，仍可在地图上查询市议会点位资料。','Address and parcel search awaits LINZ configuration. You can still click the map to query Council point information.');$('research-address').disabled=!config.addresses_configured;$('address-submit').disabled=!config.addresses_configured;}catch(e){$('research-config').textContent=e.message;}
    try{
      if(!window.L)throw Error(tr('地图组件未能加载，请刷新页面。','The map component could not load. Refresh the page.'));
      const config=await api('/api/map-config');
      map=L.map('research-map',{scrollWheelZoom:false,zoomControl:false}).setView([-36.79,174.73],11);
      L.control.zoom({zoomInTitle:tr('放大','Zoom in'),zoomOutTitle:tr('缩小','Zoom out')}).addTo(map);
      $('research-map').setAttribute('aria-label',tr('物业资料地图','Property research map'));
      const credit=config.attribution||'© OpenStreetMap contributors';
      const tile=L.tileLayer(config.tile_url,{maxZoom:19,attribution:esc(en?credit:credit.replace('OpenStreetMap contributors','开放街图贡献者'))+` · <a href="https://www.openstreetmap.org/copyright">${tr('地图许可','Map licence')}</a>`}).addTo(map);
      tile.on('tileerror',()=>put('research-map-status','底图暂时不可用，请稍后重试。','Basemap unavailable. Please retry later.'));tile.on('tileload',()=>$('research-map-status').textContent='');
      const colors={parcels:'#2475ad',zones:'#ac7e25',changes:'#844b9b',planchanges:'#693687',planareas:'#526e41',precincts:'#2d8456',designations:'#b44739',floodplains:'#007ba7',floodprone:'#384cbd',flowpaths:'#008b99',stormwater:'#48565d',water:'#0076bb',wastewater:'#9b6340',heights:'#994c72'},names={...layerNames,zones:tr('分区（请核实版本状态）','Zoning (verify version status)')},control={};
      Object.keys(colors).forEach((name,index)=>{const pane='research-'+name;map.createPane(pane);map.getPane(pane).style.zIndex=String(430-index*10);layers[name]=L.geoJSON(null,{pane,style:{color:colors[name],weight:name==='parcels'?4:3,fillOpacity:name==='zones'?.28:.08,dashArray:['changes','planchanges'].includes(name)?'8 5':undefined},onEachFeature:(f,l)=>{
        const div=document.createElement('div'),label=document.createElement('p'),button=document.createElement('button');label.textContent=name==='zones'?content.zone(f.properties?.ZONE):names[name];button.type='button';button.textContent=tr('查看记录详情','View record details');button.onclick=()=>{const i=lastResult?.[name]?.features.indexOf(f),action=document.querySelector(`[data-source-record="${name}:${i}"]`);if(!action)return;const target=action.closest('.research-record')||action.closest('[data-layer-card]');let ancestor=target?.parentElement;while(ancestor){if(ancestor.tagName==='DETAILS')ancestor.open=true;ancestor=ancestor.parentElement;}target?.scrollIntoView({behavior:'smooth',block:'center'});};div.append(label,button);l.bindPopup(div);
      }});if(selected.has(name))layers[name].addTo(map);control[`<span class="research-swatch" style="background:${colors[name]}"></span>${esc(names[name])}`]=layers[name];});
      document.querySelector('.leaflet-control-layers-toggle')?.setAttribute('title',tr('切换图层','Toggle layers'));
      map.on('click',e=>lookup(e.latlng.lat,e.latlng.lng));
      if(last)showLocation(last.lat,last.lng,last.label);
      drawResult(lastResult);
    }catch(e){$('research-map-status').textContent=e.message;}
  }
  mapReady=init();
})();
