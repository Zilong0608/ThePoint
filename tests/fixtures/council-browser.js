'use strict';
// Browser-only source responses. Never imported by the application or business DB.
module.exports='('+function(){
  const original=window.fetch;
  const polygon={type:'Polygon',coordinates:[[[174.69,-36.73],[174.71,-36.73],[174.71,-36.71],[174.69,-36.71],[174.69,-36.73]]]};
  const feature={type:'Feature',original_properties:{id:12,VERSIONSTATUS:4},properties:{id:12,parcel_intent:'Fee Simple Title',appellation:'Browser fixture',NAME:'<img src=x onerror=alert(1)>',ZONE:'3 — Rural - Countryside Living Zone',VERSIONSTATUS:'4 — Operative'},geometry:polygon,contains_query_point:true};
  const result=(name,features=[],status='ok')=>({status,source:name==='parcels'?'https://data.linz.govt.nz/layer/50772-nz-primary-parcels/':'https://services1.arcgis.com/test',features});
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__sharedQuery=text;}}});
  window.fetch=async(url,...args)=>{
    const path=String(url);
    if(path==='/api/council/config')return new Response(JSON.stringify({addresses_configured:true}));
    if(path.startsWith('/api/council/addresses'))return new Response(JSON.stringify({items:[{label:'Test fixture address',latitude:-36.72,longitude:174.7}]}));
    if(path.startsWith('/api/council/lookup')){
      const selected=path.includes('parcel=12')||path.includes('auto=1');
      return new Response(JSON.stringify({mode:selected?'parcel':'point',selection:path.includes('parcel=12')?'manual':'unique_primary_parcel',parcel_id:selected?'12':null,
        parcels:result('parcels',[feature]),zones:result('zones',[feature]),changes:result('changes',[],'unavailable'),
        precincts:result('precincts',[feature]),designations:result('designations'),
        planchanges:result('planchanges',[{...feature,properties:{NUMBER:'PC 120',STATUS:'5 — Proposed',DOCUMENTURL:'https://www.aucklandcouncil.govt.nz/plan.pdf'}}]),planareas:result('planareas'),
        floodplains:result('floodplains',[feature]),floodprone:result('floodprone',[],'unavailable'),flowpaths:result('flowpaths',[{...feature,geometry:{type:'LineString',coordinates:[[174.69,-36.73],[174.71,-36.71]]}}]),stormwater:result('stormwater'),water:result('water'),wastewater:result('wastewater'),heights:result('heights'),
        reference_documents:[{title:'区域参考文件',title_en:'Regional reference document',date:'2024-03-14',url:'https://www.aucklandcouncil.govt.nz/reference.pdf'}],documents:[]}));
    }
    return original(url,...args);
  };
}.toString()+')();';
