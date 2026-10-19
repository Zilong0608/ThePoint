'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const express=require('express'),{DatabaseSync}=require('node:sqlite');
const {createCouncilService,point,ringsFor,SOURCES,PLANNING_LAYERS}=require('../src/services/council');
const register=require('../src/routes/council');
const feature=(properties,geometry={type:'Point',coordinates:[174.7,-36.72]})=>({type:'Feature',properties,geometry});
const polygon={type:'Polygon',coordinates:[[[174.69,-36.73],[174.71,-36.73],[174.71,-36.71],[174.69,-36.71],[174.69,-36.73]]]};
function response(body){return {ok:true,text:async()=>JSON.stringify(body)};}
test('Council point validation refuses missing, non-finite and out-of-coverage locations',()=>{
  for(const p of [[null,174],[NaN,174],[0,0],[-40,174],[-36,'174'],[-36,Infinity]])assert.throws(()=>point(...p));
  assert.deepEqual(point(-36.72,174.7),{latitude:-36.72,longitude:174.7});
});
test('official address search validates and escapes input, restricts Auckland, deduplicates concurrent calls',async()=>{
  let requests=0;
  const s=createCouncilService({fetcher:async u=>{requests++;assert.equal(u.origin,new URL(SOURCES.addresses).origin);const sql=u.searchParams.get('where');assert.ok(sql.includes('address_number=22'));assert.ok(sql.includes("territorial_authority='Auckland'"));assert.ok(sql.includes("O''NEIL"));assert.ok(!sql.includes('%;'));await new Promise(r=>setTimeout(r,5));return response({type:'FeatureCollection',properties:{exceededTransferLimit:true},features:[feature({address_id:1,full_address:"22 O'Neil Road, Auckland"}),feature({address_id:2},{type:'Point',coordinates:[0,0]})]});}});
  await assert.rejects(()=>s.addresses('Albany'),{status:400});
  const [a,b]=await Promise.all([s.addresses("22 O'Neil Road"),s.addresses("22 O'Neil Road")]);assert.deepEqual(a,b);assert.equal(a.items.length,1);assert.equal(a.truncated,true);await s.addresses("22 O'Neil Road");assert.equal(requests,1);
});
test('source failures stay unavailable, while a valid empty result remains distinct',async()=>{
  const s=createCouncilService({fetcher:async u=>u.href.startsWith(SOURCES.zones)?response({type:'FeatureCollection',features:[]}):response({status:'error',messages:['offline']})});
  const r=await s.lookup(-36.72,174.7);assert.equal(r.mode,'point');assert.equal(r.parcels.status,'unavailable');assert.equal(r.zones.status,'ok');assert.deepEqual(r.zones.features,[]);assert.equal(r.changes.status,'unavailable');
});
test('point planning requests start without waiting for a slow parcel service',async()=>{
  let release;const parcelWait=new Promise(resolve=>release=resolve),started=new Set();
  const s=createCouncilService({fetcher:async u=>{
    if(u.href.startsWith(SOURCES.parcels)){await parcelWait;return response({status:'error'});}
    if(u.pathname.endsWith('/query')){started.add(u.href.startsWith(SOURCES.zones)?'zones':'changes');return response({type:'FeatureCollection',features:[]});}
    return response({});
  }});
  const lookup=s.lookup(-36.72,174.7);
  try{await new Promise(resolve=>setImmediate(resolve));assert.deepEqual([...started].sort(),['changes','zones']);}
  finally{release();await lookup;}
});
test('verified parcel query intersects the entire polygon and decodes official version domains',async()=>{
  let polygonQueries=0;
  const s=createCouncilService({fetcher:async u=>{
    if(!u.pathname.endsWith('/query'))return response({editingInfo:{dataLastEditDate:1000},fields:[{name:'VERSIONSTATUS',domain:{codedValues:[{code:4,name:'Operative'}]}}]});
    if(u.href.startsWith(SOURCES.parcels)){assert.equal(u.searchParams.get('where'),'id=12');if(u.searchParams.get('returnIdsOnly')==='true')return response({objectIds:[123]});assert.equal(u.searchParams.get('objectIds'),'123');assert.equal(u.searchParams.has('geometry'),false);return response({type:'FeatureCollection',features:[feature({id:12,appellation:'Test fixture parcel'},polygon)]});}
    assert.equal(u.searchParams.get('geometryType'),'esriGeometryPolygon');assert.equal(u.searchParams.get('spatialRel'),'esriSpatialRelIntersects');assert.ok(JSON.parse(u.searchParams.get('geometry')).rings.length);polygonQueries++;
    return response({type:'FeatureCollection',features:[feature({VERSIONSTATUS:4},polygon)]});
  }});
  const r=await s.lookup(-36.72,174.7,'12');assert.equal(r.mode,'parcel');assert.equal(polygonQueries,PLANNING_LAYERS.length);assert.equal(r.zones.features[0].properties.VERSIONSTATUS,'4 — Operative');assert.equal(r.zones.source_updated_at,new Date(1000).toISOString());
  const unavailable=createCouncilService({fetcher:async()=>response({type:'FeatureCollection',features:[]})});await assert.rejects(()=>unavailable.lookup(-36.72,174.7,'12'),{status:503});
  await assert.rejects(()=>s.lookup(-36.72,174.7,'1 OR 1=1'),{status:400});
});
test('Esri conversion reverses outer rings and holes without mutating GeoJSON',()=>{
  const before=JSON.stringify(polygon),rings=ringsFor(polygon);assert.deepEqual(rings[0],polygon.coordinates[0].slice().reverse());assert.equal(JSON.stringify(polygon),before);
});
test('automatic selection uses one non-road primary parcel and preserves manual choice for ambiguous results',async()=>{
  for(const [count,intent,expected]of [[1,'Fee Simple Title','parcel'],[1,'Road','point'],[2,'Fee Simple Title','point'],[1,'','point']]){
    const types=[];const s=createCouncilService({fetcher:async u=>{
      if(!u.pathname.endsWith('/query'))return response({});
      if(u.href.startsWith(SOURCES.parcels))return u.searchParams.get('returnIdsOnly')==='true'?response({objectIds:Array.from({length:count},(_,i)=>i+1)}):response({type:'FeatureCollection',features:Array.from({length:count},(_,i)=>feature({id:i+1,parcel_intent:intent},polygon))});
      types.push(u.searchParams.get('geometryType'));return response({type:'FeatureCollection',features:[]});
    }});
    const r=await s.lookup(-36.72,174.7,undefined,{autoParcel:true});assert.equal(r.mode,expected);assert.equal(r.selection,expected==='parcel'?'unique_primary_parcel':'point');assert.ok(types.every(t=>t===(expected==='parcel'?'esriGeometryPolygon':'esriGeometryPoint')));
  }
});
test('parcel index validation distinguishes empty coverage from a malformed upstream result',async()=>{
  for(const ids of [[],['invalid'],[-1]]){
    let geometryQueries=0;
    const s=createCouncilService({fetcher:async u=>{
      if(u.href.startsWith(SOURCES.parcels)){
        if(!u.pathname.endsWith('/query'))return response({});
        if(u.searchParams.get('returnIdsOnly')==='true')return response({objectIds:ids});
        geometryQueries++;throw Error('Unexpected geometry query');
      }
      return u.pathname.endsWith('/query')?response({type:'FeatureCollection',features:[]}):response({});
    }});
    const result=await s.lookup(-36.72,174.7);assert.equal(result.parcels.status,ids.length?'unavailable':'ok');assert.equal(geometryQueries,0);
  }
});
test('planning document APIs require administrator, reject non-official links and only publish matched coverage',async()=>{
  const db=new DatabaseSync(':memory:'),app=express();app.use(express.json());
  register({app,db,requireAuth:(req,res,next)=>req.headers.authorization==='admin'?next():res.sendStatus(403),service:{configured:true,lookup:async(lat,lng)=>({point:point(lat,lng)}),addresses:async()=>({items:[]})}});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
  const body={title:'Test fixture only',title_en:'Test fixture only',kind:'structure_plan',stage:'adopted',url:'https://www.aucklandcouncil.govt.nz/test.pdf',west:174.6,south:-36.8,east:174.8,north:-36.6,visible:true};
  const post=b=>fetch(base+'/api/admin/council-documents',{method:'POST',headers:{Authorization:'admin','Content-Type':'application/json'},body:JSON.stringify(b)});
  try{
    assert.equal((await fetch(base+'/api/admin/council-documents')).status,403);
    for(const url of ['javascript:alert(1)','https://aucklandcouncil.govt.nz.evil.example/test','http://www.aucklandcouncil.govt.nz/test'])assert.equal((await post({...body,url})).status,400);
    assert.equal((await post({...body,west:174.9})).status,400);assert.equal((await post(body)).status,201);
    await post({...body,visible:false});
    const r=await(await fetch(base+'/api/council/lookup?lat=-36.72&lng=174.7')).json();assert.equal(r.documents.length,1);
    const outside=await(await fetch(base+'/api/council/lookup?lat=-36.9&lng=174.7')).json();assert.equal(outside.documents.length,0);
    assert.equal((await fetch(base+'/api/council/lookup?lat=&lng=174.7')).status,400);
    const library=await(await fetch(base+'/api/council/documents?q=Test')).json();assert.equal(library.items.length,1);assert.equal(library.scope,'catalogue_not_property_match');
    assert.equal((await post({...body,document_date:'2026-02-30'})).status,400);
    assert.equal((await post({...body,url:'https://user:password@www.aucklandcouncil.govt.nz/test.pdf'})).status,400);
    const coverage={type:'Polygon',coordinates:[[[174.6,-36.8],[174.8,-36.8],[174.6,-36.6],[174.6,-36.8]]]};
    const created=await(await post({...body,title:'Polygon fixture',geometry:coverage})).json();
    const before=await(await fetch(base+'/api/admin/council-documents',{headers:{Authorization:'admin'}})).json();const row=before.find(d=>d.id===created.id);
    const excluded=await(await fetch(base+'/api/council/lookup?lat=-36.61&lng=174.79')).json();assert.ok(!excluded.documents.some(d=>d.id===created.id));
    const update=b=>fetch(base+'/api/admin/council-documents/'+created.id,{method:'PUT',headers:{Authorization:'admin','Content-Type':'application/json'},body:JSON.stringify(b)});
    assert.equal((await update({...body,geometry:coverage,version:'old'})).status,409);
    assert.equal((await update({...body,geometry:coverage,version:row.updated_at})).status,200);
    assert.equal((await update({...body,geometry:coverage,version:row.updated_at})).status,409);
  }finally{await new Promise(r=>server.close(r));db.close();}
});
