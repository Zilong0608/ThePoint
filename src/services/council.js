'use strict';
const {intersectsPoint}=require('../domain/council-geometry');
const SOURCES={
  addresses:'https://services.arcgis.com/xdsHIIxuCWByZiCB/arcgis/rest/services/LINZ_NZ_Addresses/FeatureServer/0',
  parcels:'https://services.arcgis.com/xdsHIIxuCWByZiCB/arcgis/rest/services/LINZ_NZ_Primary_Parcels/FeatureServer/0',
  zones:'https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services/Unitary_Plan_Base_Zone/FeatureServer/0',
  changes:'https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services/RPC_PROD_Plan_Change_Property_Summary/FeatureServer/0',
  precincts:'https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services/Precincts/FeatureServer/0',
  designations:'https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services/Designation/FeatureServer/0',
  floodplains:'https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services/Flood_Plains/FeatureServer/0',
  floodprone:'https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services/Flood_Prone_Areas/FeatureServer/0',
  flowpaths:'https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services/Overland_Flow_Paths/FeatureServer/0',
  stormwater:'https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services/Stormwater_Pipe/FeatureServer/0',
  heights:'https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services/Height_Variation_Control/FeatureServer/0',
  planchanges:'https://mapspublic.aucklandcouncil.govt.nz/arcgis/rest/services/UnitaryPlan/UnitaryPlanAppealsandModifications/MapServer/5',
  planareas:'https://mapspublic.aucklandcouncil.govt.nz/arcgis/rest/services/LiveMaps/Planning/MapServer/3',
  water:'https://mapspublic.aucklandcouncil.govt.nz/arcgis/rest/services/LiveMaps/UndergroundServices/MapServer/52',
  wastewater:'https://mapspublic.aucklandcouncil.govt.nz/arcgis/rest/services/LiveMaps/UndergroundServices/MapServer/5'
};
const PLANNING_LAYERS=Object.keys(SOURCES).filter(name=>!['addresses','parcels'].includes(name));
const FIELDS={floodplains:'OBJECTID,Hazard,YEAR_PRODUCED,RAINFALL_EVENT,CLIMATE_CHANGE_ADJUSTED,DEVELOPMENT_SCENARIO,PDF_Link,Published_Date',floodprone:'OBJECTID,FPA_ID,Depth100y,MaxDepth,VALIDATIONSTATE',flowpaths:'OBJECTID,CatchmentAreaGroup',stormwater:'OBJECTID,SW_GIS_ID,SW_DIAMETER_MM,SW_MATERIAL,SW_STATUS,SW_DEPTH_DOWNSTREAM_M,SW_DEPTH_UPSTREAM_M',heights:'OBJECTID,TYPE,SCHEDULE,NAME,VERSIONSTATUS',planchanges:'OBJECTID,TYPE,NUMBER,MAPLAYER,DATENOTIFIED,DOCUMENTURL,STATUS',planareas:'OBJECTID,PlanTitle,PlanType,Status,DocumentLink,YearAdopted,PlanReference,Location',water:'OBJECTID,COMPKEY,STATUS,MATERIAL,NOM_DIA_MM',wastewater:'OBJECTID,COMPKEY,STATUS,NOM_DIA_MM'};
function point(lat,lng){
  if(typeof lat!=='number'||typeof lng!=='number'||!Number.isFinite(lat)||!Number.isFinite(lng)||lat< -37.35||lat> -35.8||lng<174||lng>175.65)throw Object.assign(new Error('Outside Auckland query coverage'),{status:400});
  return {latitude:lat,longitude:lng};
}
function ringsFor(geometry){
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  return polygons.flatMap(polygon=>polygon.map((ring,index)=>{
    let area=0;for(let i=0;i<ring.length-1;i++)area+=ring[i][0]*ring[i+1][1]-ring[i+1][0]*ring[i][1];
    // Esri exterior rings are clockwise; GeoJSON exterior rings are counterclockwise.
    return (index===0?area>0:area<0)?[...ring].reverse():ring;
  }));
}
function createCouncilService({fetcher=fetch}={}){
  const cache=new Map(),running=new Map();let pending=0,cacheBytes=0;
  function evict(key){const entry=cache.get(key);if(entry){cacheBytes-=entry.bytes;cache.delete(key);}}
  let activeFetches=0;const waiters=[];
  async function json(url){
    if(activeFetches>=4)await new Promise((resolve,reject)=>{if(waiters.length>=64)return reject(Error('Source queue full'));waiters.push(resolve);});
    else activeFetches++;
    try{
    const r=await fetcher(url,{signal:AbortSignal.timeout(12000),redirect:'error',headers:{Accept:'application/json'}});
    if(!r.ok)throw Error('Source unavailable');
    const raw=await r.text();if(raw.length>4000000)throw Error('Source response too large');
    const b=JSON.parse(raw);if(b.error||b.status==='error'||b.exceptions)throw Error('Source unavailable');return b;
    }finally{const next=waiters.shift();if(next)next();else activeFetches--;}
  }
  async function cached(id,fn){
    const old=cache.get(id);if(old&&old.expires>Date.now())return old.value;
    if(running.has(id))return running.get(id);
    const metadata=id.startsWith('metadata:');
    if(!metadata&&pending>=6)throw Object.assign(Error('Busy'),{status:429});
    if(!metadata)pending++;const job=fn().then(value=>{const bytes=Buffer.byteLength(JSON.stringify(value));evict(id);if(bytes<=8*1024*1024){while(cache.size>=200||cacheBytes+bytes>24*1024*1024)evict(cache.keys().next().value);const incomplete=Object.keys(SOURCES).some(name=>value[name]?.status==='unavailable');cacheBytes+=bytes;cache.set(id,{value,bytes,expires:Date.now()+(incomplete?5000:metadata?3600000:60000)});}return value;}).finally(()=>{if(!metadata)pending--;running.delete(id);});running.set(id,job);return job;
  }
  async function queryFeatures(name,params){
    const url=new URL(SOURCES[name]+'/query');
    Object.entries({f:'geojson',where:'1=1',outFields:'*',outSR:'4326',returnGeometry:'true',resultRecordCount:'21',...params}).forEach(([k,v])=>url.searchParams.set(k,v));
    const b=await json(url);if(b.type!=='FeatureCollection'||!Array.isArray(b.features))throw Error('Invalid source response');return b;
  }
  async function parcelFeatures(lat,lng,parcelId){
    // Spatial ID queries avoid a slow combined geometry/output-projection query.
    const url=new URL(SOURCES.parcels+'/query');
    url.search=new URLSearchParams({f:'json',where:parcelId?'id='+parcelId:'1=1',geometry:JSON.stringify({x:lng,y:lat,spatialReference:{wkid:4326}}),geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',returnIdsOnly:'true'});
    const ids=await json(url);
    if(!Array.isArray(ids.objectIds)||ids.objectIds.some(id=>!Number.isSafeInteger(id)||id<0))throw Error('Invalid parcel index');
    if(!ids.objectIds.length)return {type:'FeatureCollection',features:[]};
    const result=await queryFeatures('parcels',{objectIds:ids.objectIds.slice(0,20).join(','),where:parcelId?'id='+parcelId:'1=1'});
    return {...result,exceededTransferLimit:ids.objectIds.length>20||result.exceededTransferLimit};
  }
  async function addresses(query){
    query=String(query||'').trim().replace(/\s+/g,' ');
    if(query.length<5||query.length>160)throw Object.assign(Error('Enter 5–160 characters'),{status:400});
    const number=query.match(/^(?:[\w-]+\/)?(\d+)[a-z]?\s+/i);
    if(!number)throw Object.assign(Error('Enter a street number and street name'),{status:400});
    return cached('address:'+query.toLowerCase(),async()=>{
      // Quote SQL literals and escape LIKE wildcards; never interpolate arbitrary filter syntax.
      const text=query.replace(/'/g,"''").replace(/[%_\\]/g,' ');
      const b=await queryFeatures('addresses',{where:'address_number='+Number(number[1])+" AND UPPER(full_address) LIKE '%"+text.toUpperCase()+"%' AND territorial_authority='Auckland' AND address_lifecycle='Current'",outFields:'address_id,full_address'});
      return {source:'https://data.linz.govt.nz/layer/123113-nz-addresses/',fetched_at:new Date().toISOString(),items:b.features.flatMap(f=>{
        const c=f.geometry?.coordinates,p=f.properties||{};
        if(f.geometry?.type!=='Point'||!Array.isArray(c))return [];
        try{point(c[1],c[0]);}catch{return [];}
        return [{id:String(p.address_id||f.id||''),label:String(p.full_address||''),latitude:c[1],longitude:c[0]}];
      }).slice(0,20),truncated:!!(b.exceededTransferLimit||b.properties?.exceededTransferLimit)||b.features.length>20};
    });
  }
  async function arcgis(name,lat,lng,geometry){
    const source=SOURCES[name],fetched_at=new Date().toISOString();
    try{
      const url=new URL(source+'/query');
      const spatial=geometry?{rings:ringsFor(geometry),spatialReference:{wkid:4326}}:{x:lng,y:lat,spatialReference:{wkid:4326}};
      const params={f:'geojson',where:'1=1',outFields:FIELDS[name]||'*',outSR:'4326',inSR:'4326',returnGeometry:'true',geometry:JSON.stringify(spatial),geometryType:geometry?'esriGeometryPolygon':'esriGeometryPoint',spatialRel:'esriSpatialRelIntersects',resultRecordCount:'100'};
      // Only simplify returned display geometry, never the parcel or query geometry.
      const simplified=['planchanges','planareas','floodplains'].includes(name);
      if(simplified)Object.assign(params,{maxAllowableOffset:'0.00001',geometryPrecision:'6'});
      Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
      const b=await json(url);if(b.type!=='FeatureCollection'||!Array.isArray(b.features))throw Error('Invalid source response');
      const meta=await cached('metadata:'+name,()=>json(new URL(source+'?f=json'))).catch(()=>null);
      const features=b.features.map(f=>({...f,contains_query_point:!simplified&&['Polygon','MultiPolygon'].includes(f.geometry?.type)?intersectsPoint(f.geometry,lng,lat):null,original_properties:f.properties||{},properties:Object.fromEntries(Object.entries(f.properties||{}).map(([key,value])=>{
        const domain=meta?.fields?.find(field=>field.name===key)?.domain?.codedValues;
        const label=domain?.find(item=>item.code===value)?.name;
        return [key,label?String(value)+' — '+label:value];
      }))}));
      const edited=meta?.editingInfo?.dataLastEditDate;
      return {status:'ok',source,fetched_at,geometry_simplified:simplified,version:'Published service — verify each record status',source_updated_at:typeof edited==='number'?new Date(edited).toISOString():null,truncated:!!(b.exceededTransferLimit||b.properties?.exceededTransferLimit)||b.features.length>=100,features};
    }catch{return {status:'unavailable',source,fetched_at,features:[],source_updated_at:null};}
  }
  async function lookup(lat,lng,parcelId,{autoParcel=false}={}){
    point(lat,lng);
    if(parcelId!==undefined&&!/^\d{1,12}$/.test(String(parcelId)))throw Object.assign(Error('Invalid parcel'),{status:400});
    return cached([lat,lng,parcelId||'',autoParcel?'auto':'manual'].join(':'),async()=>{
      // A slow parcel source must not delay starting independent point-layer requests.
      const names=PLANNING_LAYERS;
      const pointLayers=parcelId||autoParcel?null:Promise.all(names.map(name=>arcgis(name,lat,lng)));
      let parcels={status:'unavailable',source:'https://data.linz.govt.nz/layer/50772-nz-primary-parcels/',fetched_at:new Date().toISOString(),features:[]};
      try{
        const b=await parcelFeatures(lat,lng,parcelId);
        const meta=await cached('metadata:parcels',()=>json(new URL(SOURCES.parcels+'?f=json'))).catch(()=>null);
        const edited=meta?.editingInfo?.dataLastEditDate;
        parcels={...parcels,status:'ok',features:b.features,fetched_at:new Date().toISOString(),source_updated_at:typeof edited==='number'?new Date(edited).toISOString():null,truncated:!!(b.exceededTransferLimit||b.properties?.exceededTransferLimit)||b.features.length>20};
      }catch{}
      const candidate=parcels.status==='ok'&&!parcels.truncated&&parcels.features.length===1?parcels.features[0]:null;
      const eligible=candidate&&['Polygon','MultiPolygon'].includes(candidate.geometry?.type)&&/^\d{1,12}$/.test(String(candidate.properties?.id))&&String(candidate.properties?.parcel_intent||'').trim()&&!/road|railway|water|lake|river|seabed|foreshore/i.test(String(candidate.properties?.parcel_intent||''));
      const automatic=!parcelId&&autoParcel&&eligible;
      const selected=parcelId?parcels.features.find(f=>String(f.properties?.id)===String(parcelId)):automatic?candidate:null;
      // No silent fallback to a point if a selected parcel cannot be retrieved.
      if(parcelId&&!selected)throw Object.assign(Error('Selected parcel could not be verified'),{status:503});
      const geometry=selected?.geometry;
      if(geometry&&!['Polygon','MultiPolygon'].includes(geometry.type))throw Object.assign(Error('Invalid parcel geometry'),{status:503});
      const planning=await (pointLayers||Promise.all(names.map(name=>arcgis(name,lat,lng,geometry))));
      return {point:{latitude:lat,longitude:lng},mode:geometry?'parcel':'point',selection:automatic?'unique_primary_parcel':parcelId?'manual':'point',parcel_id:selected?String(selected.properties.id):null,parcels,...Object.fromEntries(names.map((name,index)=>[name,planning[index]]))};
    });
  }
  return {addresses,lookup,configured:true};
}
module.exports={createCouncilService,point,SOURCES,ringsFor,PLANNING_LAYERS};
