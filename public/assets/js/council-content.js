(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();else root.TPCouncilContent=factory();
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const zones={
    'Residential - Single House Zone':'住宅区：独立住宅',
    'Residential - Mixed Housing Suburban Zone':'住宅区：混合住宅郊区',
    'Residential - Mixed Housing Urban Zone':'住宅区：混合住宅城市区',
    'Residential - Terrace Housing and Apartment Building Zone':'住宅区：联排住宅及公寓',
    'Residential - Terrace Housing and Apartment Buildings Zone':'住宅区：联排住宅及公寓',
    'Residential - Large Lot Zone':'住宅区：大地块住宅',
    'Residential - Rural and Coastal Settlement Zone':'住宅区：乡村及沿海聚落',
    'Residential - Low Density Residential Zone':'住宅区：低密度住宅',
    'Two-Storey Single Dwelling Residential Area':'两层独立住宅区',
    'Two-Storey Medium Density Residential Area':'两层中密度住宅区',
    'Future Urban Zone':'未来城市区',
    'Rural - Countryside Living Zone':'乡村区：田园生活',
    'Rural - Mixed Rural Zone':'乡村区：混合乡村',
    'Rural - Rural Coastal Zone':'乡村区：乡村沿海',
    'Rural - Rural Conservation Zone':'乡村区：乡村保护',
    'Rural - Rural Production Zone':'乡村区：乡村生产',
    'Rural - Waitakere Foothills Zone':'乡村区：怀塔克雷山麓',
    'Rural - Waitakere Ranges Zone':'乡村区：怀塔克雷山脉',
    'Business - Business Park Zone':'商业区：商务园区',
    'Business - City Centre Zone':'商业区：市中心',
    'Business - General Business Zone':'商业区：一般商业',
    'Business - Heavy Industry Zone':'商业区：重工业',
    'Business - Light Industry Zone':'商业区：轻工业',
    'Business - Local Centre Zone':'商业区：本地中心',
    'Business - Metropolitan Centre Zone':'商业区：都市中心',
    'Business - Mixed Use Zone':'商业区：混合用途',
    'Business - Neighbourhood Centre Zone':'商业区：邻里中心',
    'Business - Town Centre Zone':'商业区：城镇中心',
    'Coastal - Coastal Transition Zone':'沿海区：沿海过渡',
    'Coastal - Defence Zone':'沿海区：国防',
    'Coastal - Ferry Terminal Zone':'沿海区：渡轮码头',
    'Coastal - General Coastal Marine Zone':'沿海区：一般沿海海域',
    'Coastal - Marina Zone':'沿海区：游艇码头',
    'Coastal - Minor Port Zone':'沿海区：小型港口',
    'Coastal - Mooring Zone':'沿海区：船舶系泊',
    'Open Space - Civic Spaces Zone':'开放空间区：市民空间',
    'Open Space - Community Zone':'开放空间区：社区',
    'Open Space - Conservation Zone':'开放空间区：保护',
    'Open Space - Informal Recreation Zone':'开放空间区：日常休闲',
    'Open Space - Sport and Active Recreation Zone':'开放空间区：运动及户外活动',
    'Special Purpose - Airports and Airfields Zone':'特殊用途区：机场及飞行场',
    'Special Purpose - Cemetery Zone':'特殊用途区：墓地',
    'Special Purpose - Healthcare Facility and Hospital Zone':'特殊用途区：医疗设施及医院',
    'Special Purpose - Landfill Zone':'特殊用途区：垃圾填埋场',
    'Special Purpose - Major Recreation Facility Zone':'特殊用途区：大型休闲设施',
    'Special Purpose - Māori Purpose Zone':'特殊用途区：毛利用途',
    'Special Purpose - Quarry Zone':'特殊用途区：采石场',
    'Special Purpose - School Zone':'特殊用途区：学校',
    'Special Purpose - Tertiary Education Zone':'特殊用途区：高等教育',
    'Ardmore Airport':'阿德莫尔机场',
    'Ardmore Airport Residential':'阿德莫尔机场住宅区',
    'Hauraki Gulf Islands':'豪拉基湾岛屿',
    'Green Infrastructure Corridor':'绿色基础设施走廊',
    'Strategic Transport Corridor Zone':'战略交通走廊区',
    'Road':'道路','Water':'水域','DELETED':'已删除记录'
  };
  const statuses={Operative:'已生效',Proposed:'拟议中',Decision:'已作出决定','Subject to Appeal':'上诉中',Confirmed:'已确认',Notified:'已公告',Lodged:'已提交',Effective:'已生效','Immediate Legal Effect':'具有即时法律效力','Awaiting approval from Minister of Conservation':'等待自然保护部长批准',Established:'已确立',NPSUD:'城市发展国家政策声明','Staff Recommendation (Case)':'工作人员建议','Recommendation (IHP)':'独立听证小组建议'};
  const excluded='Land with a zoning outside the urban environment is excluded from intensification (including rezoning) aspects of Plan Change 120: Future Urban, Rural, Residential – Rural and Coastal Settlement, Green Infrastructure Corridor and all zones in the Hauraki Gulf Islands District Plan. Land within settlements with a population less than 5000 people in the 2018 census is excluded from intensification rezoning aspects of Plan Change 120. All properties may be subject to the significant risk from natural hazards purpose of Plan Change 120 and this may include a rezoning proposal.';
  const normalize=value=>String(value??'').normalize('NFKC').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
  const excludedZh='官方摘要说明：未来城市区、乡村区、乡村及沿海聚落住宅区、绿色基础设施走廊，以及豪拉基湾岛屿地区计划中的各分区，属于城市环境以外的土地，不纳入第120号规划变更的加密开发及相关重新分区内容。按2018年人口普查人口少于5000人的聚落，也不纳入该加密重新分区内容。但是，所有物业仍可能受到该规划变更中重大自然灾害风险相关内容的影响，其中可能包含重新分区提议。';
  function create(lang){
    const en=lang==='en',t=(zh,eng)=>en?eng:zh;
    const decoded=value=>String(value??'').replace(/^\s*\d+\s*—\s*/,'').replace(/^\s*-\s*/,'').trim();
    const zone=value=>en?(/[\u3400-\u9fff]/.test(decoded(value))?'English zoning name unavailable':decoded(value)||'Zoning not supplied'):(zones[decoded(value)]||'该分区的中文名称尚待核实');
    const status=value=>en?(/[\u3400-\u9fff]/.test(decoded(value))?'English status unavailable':decoded(value)||'Status not supplied'):(statuses[decoded(value)]||'状态尚待核实');
    const layerInfo={
      floodplains:{title:t('洪泛区','Flood plains'),note:t('官方模型中的洪泛范围。相交不表示整块地都会淹水，未相交也不表示没有洪水风险。','Official modelled flood extent. An intersection does not mean the whole parcel floods; no intersection does not establish no flood risk.')},
      floodprone:{title:t('易积水区','Flood-prone areas'),note:t('低洼或出口受阻时可能积水的范围。模型数值属于该记录，不能直接当成住宅位置的实际水深。','Areas that may pond in depressions or with blocked outlets. Model values belong to the record and are not actual flood depths at a dwelling.')},
      flowpaths:{title:t('地表径流路径','Overland flow paths'),note:t('官方推算的地表排水路径，线条不代表实际水流宽度。地块相交并不等于建筑受淹结论。','Officially mapped surface runoff routes. Lines do not represent flow width, and parcel intersections are not a building flood assessment.')},
      stormwater:{title:t('雨水管网','Stormwater pipes'),note:t('仅展示官方雨水管线图示位置，不包含完整供水、污水网络；不能证明可接入、管网容量或施工净距。','Indicative official stormwater pipe locations only, not a complete water/wastewater network. This does not establish connection rights, capacity or construction clearances.')},
      water:{title:t('本地供水管网','Local water pipes'),note:t('仅为官方本地供水管线图示位置，不包含完整传输网络。不能证明供水容量、接入权利或施工净距。','Indicative official local water pipe locations, not the complete transmission network. This does not establish capacity, connection rights or construction clearances.')},
      wastewater:{title:t('本地污水管网','Local wastewater pipes'),note:t('仅为官方本地污水管线图示位置，不包含完整传输网络。不能证明排污容量、接入权利或施工净距。','Indicative official local wastewater pipe locations, not the complete transmission network. This does not establish capacity, connection rights or construction clearances.')},
      heights:{title:t('附加高度控制','Additional height controls'),note:t('来源描述包含拟议统一规划背景，须结合该记录状态及正文核实。这里不是对这块地可建高度的计算。','The source description includes proposed-plan context. Verify record status and plan text. This is not a calculated allowable height for the site.')}
    };
    function explanation(value){
      if(en)return /[\u3400-\u9fff]/.test(String(value))?'An English version of this source note is not available.':String(value);
      if(normalize(value)===normalize(excluded))return excludedZh;
      if(!/[A-Za-z]/.test(String(value)))return String(value);
      return '这条官方说明尚无经核实的中文译文。可下载官方原始记录核对，不能据此认定没有规划限制。';
    }
    const rawButton=(name,index)=>`<button type="button" class="research-raw" data-source-record="${name}:${index}">${t('下载官方原始记录','Download original source record')}</button>`;
    function feature(name,f,index){
      const p=f.properties||{};
      if(name==='planchanges'){
        const number=String(p.NUMBER||''),match=number.match(/^(?:PC|Plan Change)\s*(\d+)\b/i);
        const heading=match?t(`第${match[1]}号规划变更`,`Plan Change ${match[1]}`):t('规划变更记录','Plan change record');
        const revised='PC 120 - Some parts have immediate legal effect. Some parts apply to Auckland-wide provisions. Some parts are excluded from zone and/or other mapping proposals. Withdrawn in part 27/08/2026. Public notice and proposed amendments to PC120: 27/08/26';
        const note=en?number:normalize(number)===normalize(revised)?'官方记录说明：第120号规划变更的部分内容具有即时法律效力，部分条款涉及全奥克兰，部分不涉及分区或其他地图提议。部分内容于2026年8月27日撤回，并于同日公告拟议修订。请核对具体条文、撤回范围及最新公告。':'详细中文说明尚待核实，请查看对应官方文件或下载原始记录。';
        return `<section class="research-record"><h4>${escape(heading)}</h4><p><b>${t('记录状态：','Record status: ')}</b> <span>${escape(status(p.STATUS))}</span></p><p>${escape(note)}</p>${rawButton(name,index)}</section>`;
      }
      if(name==='planareas'){
        const names={'Silverdale West Dairy Flat Structure Plan':'银谷西部与奶牛场结构规划'},states={Adopted:'已通过',Draft:'草案',Proposed:'拟议中',Completed:'已完成','In progress':'进行中','draft in progress':'草案编制中（来源项目记录，最新状态待核实）'};
        const title=en?(p.PlanTitle||'Planning area record'):(names[p.PlanTitle]||'官方规划范围记录');
        return `<section class="research-record"><h4>${escape(title)} ${index+1}</h4>${p.Status?`<p>${t('来源记录状态：','Source record status: ')}${escape(en?p.Status:states[p.Status]||'状态待核实')}</p>`:''}${/^\d{4}$/.test(String(p.YearAdopted))?`<p>${t('来源记录通过年份：','Source-recorded adoption year: ')}${p.YearAdopted}</p>`:''}<p>${t('此图层可能保留较早的项目阶段，须另行核实文件最新状态。范围相交不等于现行规则或开发许可。','This layer may retain an older project stage. Verify the document’s latest status separately. Intersection does not establish operative rules or development permission.')}</p>${rawButton(name,index)}</section>`;
      }
      if(layerInfo[name]){
        const rows=[];
        if(name==='heights'){
          const height=decoded(p.TYPE),match=height.match(/^(\d+(?:\.\d+)?)m\s*\/\s*(\d+) storeys$/);
          rows.push(`<p>${t('记录状态：','Record status: ')}${escape(status(p.VERSIONSTATUS))}</p>`);
          if(match)rows.push(`<p>${t('官方控制记录：','Source control: ')}${match[1]} ${t('米','metres')} / ${match[2]} ${t('层','storeys')}</p>`);
        }
        if(['stormwater','water','wastewater'].includes(name)){
          const diameter=f.original_properties?.SW_DIAMETER_MM??p.SW_DIAMETER_MM??f.original_properties?.NOM_DIA_MM??p.NOM_DIA_MM;
          if(typeof diameter==='number'&&diameter>0)rows.push(`<p>${t('记录管径：','Recorded pipe diameter: ')}${diameter} ${t('毫米','mm')}</p>`);
        }
        return `<section class="research-record"><h4>${layerInfo[name].title} · ${t('记录','Record')} ${index+1}</h4>${rows.join('')}${rawButton(name,index)}</section>`;
      }
      if(name==='precincts'||name==='designations'){
        const heading=name==='precincts'?t('特别规划区记录','Precinct record'):t('指定用途记录','Designation record');
        const identity=en?String(p.PRECINCT||p.NAME||heading):heading;
        return `<section class="research-record"><h4>${escape(identity)} ${index+1}</h4><p><b>${t('官方记录状态：','Source record status: ')}</b>${escape(status(p.VERSIONSTATUS))}</p><p>${name==='precincts'?t('此范围可能有特别规划区或子区规则，需要结合对应条文核实。','This extent may have precinct or sub-precinct rules. Verify the corresponding plan text.'):t('此范围涉及官方指定用途记录，需核实指定机构、用途、条件及最新状态。','This extent intersects a designation record. Verify the requiring authority, purpose, conditions and latest status.')}</p>${rawButton(name,index)}</section>`;
      }
      if(name==='zones')return `<section class="research-record"><h4>${escape(zone(p.ZONE))}</h4><p><b>${t('官方记录状态：','Source record status: ')}</b> <span>${escape(status(p.VERSIONSTATUS))}</span></p><p>${t('土地分区描述该位置适用的用途类别，不代表已经获得开发或分割许可。','Zoning describes the land-use category at this location; it does not grant development or subdivision permission.')}</p>${rawButton(name,index)}</section>`;
      const zoneRows=Object.entries(p).filter(([key,value])=>/^Zone\d+$/.test(key)&&value).map(([,value])=>`<li>${escape(zone(value))}</li>`).join('');
      const notes=Object.entries(p).filter(([key,value])=>/^Label\d+$/.test(key)&&value).map(([,value])=>`<p>${escape(explanation(value))}</p>`).join('');
      const note=t('以下为官方说明的中文参考译文，不取代官方原文。','The following text is supplied by the official source.');
      return `<section class="research-record"><h4>${t('相交范围内的规划摘要','Planning summary in the intersecting extent')}</h4>${p.FORMATTEDADDRESS?`<p>${t('摘要对应地址：','Summary address: ')}${escape(p.FORMATTEDADDRESS)}</p>`:''}${p.PROPERTYID?`<p>${t('物业编号：','Property ID: ')}${escape(p.PROPERTYID)}</p>`:''}<p class="research-meta">${t('相交可能包含边界接触，须核对摘要地址和物业编号，不能将相邻物业的摘要当作本物业规则。','Intersections may include boundary touches. Check the summary address and property ID; a neighbouring property’s summary is not this property’s rule.')}</p>${zoneRows?`<p><b>${t('摘要列出的分区','Zoning listed in this summary')}</b></p><ul>${zoneRows}</ul>`:''}${notes?`<p class="research-meta">${note}</p>${notes}`:`<p>${t('该记录未提供可展示的文字说明，请核实官方记录。','This record contains no displayable explanation. Check the original source record.')}</p>`}${rawButton(name,index)}</section>`;
    }
    function overview(result){
      const pointZones=result.zones.features.filter(f=>f.contains_query_point!==false);
      const available=result.zones.status==='ok'&&pointZones.length;
      const types=available?[...new Set(pointZones.map(f=>zone(f.properties?.ZONE)))].join(t('、',', ')):t('暂未取得地址点所在分区资料','Address-point zoning information unavailable');
      return `<article class="research-overview"><h3>${t('这次查询告诉你什么','What this query tells you')}</h3><p class="research-zone-name">${escape(types)}</p><ul><li>${result.mode==='parcel'?t('已查询所选主地块相交的规划图层。','Planning layers were queried against the selected primary parcel.'):t('目前查询的是地址点位，不能代表整块物业范围。','This is an address-point query, not a whole-property assessment.')}</li><li>${result.mode==='parcel'?t('已取得所选主地块边界；主地块不等于完整产权范围，仍需核实关联产权。','The selected primary parcel boundary is available. A primary parcel is not a complete title boundary; verify associated titles.'):result.parcels.status==='ok'&&result.parcels.features.length?t('已取得候选地块，请核实后选择对应地块。','Candidate parcels are available. Verify and select the correct parcel.'):t('尚未确认地块边界，不能据此判断土地面积或可分割范围。','Parcel boundaries are unconfirmed. Land area and subdivision extent cannot be established from this result.')}</li><li>${result.planchanges?t('同时查询官方通用规划变更图层和第120号摘要，仍需核对完整目录及最新文件。','Both the general official plan-change layer and PC120 summary are queried. Verify the full register and latest documents.'):t('仅提供第120号规划变更的公开摘要，并非所有规划变更。','Only the published PC120 summary is included, not every plan change.')}</li></ul></article>`;
    }
    return {zone,status,explanation,feature,overview,t,layerInfo};
  }
  return {create};
});
