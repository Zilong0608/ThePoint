const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createGeocoder}=require('../src/services/geocoding');
const {normalizeProperty}=require('../src/domain/property');

test('map coordinates are paired, bounded and cleared when the address changes',()=>{
  const previous={address:'22 Library Lane',suburb:'Albany',city:'Auckland',latitude:-36.72,longitude:174.7};
  assert.equal(normalizeProperty({title:'New title'},previous).latitude,undefined);
  assert.deepEqual(Object.assign({},normalizeProperty({address:'New address'},previous),{updated_at:''}),{address:'New address',latitude:null,longitude:null,bond:null,available_from:'',updated_at:''});
  for(const pair of [{latitude:91,longitude:174},{latitude:-36,longitude:181},{latitude:NaN,longitude:174},{latitude:-36,longitude:null},{latitude:0,longitude:Infinity}])assert.throws(()=>normalizeProperty(pair),/经纬度/);
  assert.equal(normalizeProperty({latitude:0,longitude:0}).latitude,0);
  assert.equal(normalizeProperty({address:'New',latitude:-36.7,longitude:174.6},previous).longitude,174.6);
});

test('address lookup restricts to NZ, caches results and combines concurrent duplicates',async()=>{
  const db=new DatabaseSync(':memory:');let requests=0;
  const lookup=createGeocoder({db,fetcher:async(url,options)=>{
    requests++;assert.equal(url.searchParams.get('bbox'),'165,-48,180,-33');assert.equal(url.searchParams.get('limit'),'5');assert.match(options.headers['User-Agent'],/ThePoint/);
    await new Promise(r=>setTimeout(r,10));
    return {ok:true,json:async()=>({features:[
      {geometry:{type:'Point',coordinates:[174.7,-36.72]},properties:{housenumber:'22',street:'Library Lane',city:'Auckland',countrycode:'NZ'}},
      {geometry:{type:'Point',coordinates:[174.6,-36.7]},properties:{name:'Albany',countrycode:'NZ'}},
      {geometry:{type:'Point',coordinates:[174.7,-36.7]},properties:{name:'Library Lane',type:'street',countrycode:'NZ'}},
      {geometry:{type:'Point',coordinates:[-73,42]},properties:{name:'Albany',countrycode:'US'}},
      {geometry:{type:'Point',coordinates:[174.5,-36.8]},properties:{countrycode:'AU'}},
      {geometry:{type:'LineString',coordinates:[174.7,-36.7]},properties:{}}
    ]})};
  }});
  try{
    const [a,b]=await Promise.all([lookup('22 Library Lane, Albany'),lookup(' 22  Library Lane, Albany ')]);
    assert.equal(requests,1);assert.deepEqual(a,b);assert.equal(a.length,3);assert.equal(a[0].precision,'address');assert.equal(a[1].precision,'area');assert.equal(a[2].precision,'street');
    await lookup('22 library lane, albany');assert.equal(requests,1);
    await assert.rejects(()=>lookup(''),/有效/);
    await assert.rejects(()=>lookup('a'.repeat(241)),/有效/);
  }finally{db.close();}
});

test('geocoding failures are retryable and request starts are throttled',async()=>{
  const db=new DatabaseSync(':memory:');let calls=0;const starts=[];
  const lookup=createGeocoder({db,fetcher:async()=>{starts.push(Date.now());calls++;return {ok:calls>1,json:async()=>({features:[]})};}});
  try{
    await assert.rejects(()=>lookup('first address'),/暂时不可用/);
    assert.deepEqual(await lookup('first address'),[]);
    assert.ok(starts[1]-starts[0]>=1000);
    await lookup('first address');assert.equal(calls,2);
  }finally{db.close();}
});
