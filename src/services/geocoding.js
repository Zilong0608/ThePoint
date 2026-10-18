'use strict';

// Only staff-triggered address lookups use this service. Public searches read saved pins.
function createGeocoder({db,fetcher=fetch,endpoint=process.env.GEOCODER_URL||'https://photon.komoot.io/api/'}){
  db.exec('CREATE TABLE IF NOT EXISTS geocode_cache (query TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at INTEGER NOT NULL)');
  let tail=Promise.resolve(),lastStarted=0,pending=0;
  const inflight=new Map();
  return async function geocode(value){
    const query=String(value||'').trim().replace(/\s+/g,' ');
    if(query.length<3||query.length>240){const e=new Error('请填写有效的地址或地区（3–240 个字符）');e.status=400;throw e;}
    const key=query.toLowerCase();
    const cached=db.prepare('SELECT payload FROM geocode_cache WHERE query=? AND fetched_at>?').get(key,Date.now()-30*86400000);
    if(cached)return JSON.parse(cached.payload);
    if(inflight.has(key))return inflight.get(key);
    if(pending>=5){const e=new Error('定位请求较多，请稍后再试');e.status=429;throw e;}
    pending++;
    const job=tail.catch(()=>{}).then(async()=>{
      const wait=1100-(Date.now()-lastStarted);if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
      lastStarted=Date.now();
      const url=new URL(endpoint);url.searchParams.set('q',query);url.searchParams.set('limit','5');url.searchParams.set('lang','en');url.searchParams.set('bbox','165,-48,180,-33');
      const response=await fetcher(url,{headers:{'User-Agent':'ThePoint-PropertyEditor/1.0','Accept':'application/json'},signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('地址定位服务暂时不可用，请稍后重试或在地图上手动选点');
      const body=await response.json();
      const items=(Array.isArray(body.features)?body.features:[]).flatMap(feature=>{
        const p=feature.properties||{},c=feature.geometry?.coordinates;
        if(feature.geometry?.type!=='Point'||!Array.isArray(c)||!Number.isFinite(c[0])||!Number.isFinite(c[1])||c[0]<165||c[0]>180||c[1]<-48||c[1]>-33)return [];
        if(p.countrycode && String(p.countrycode).toUpperCase()!=='NZ')return [];
        const label=[p.name,[p.housenumber,p.street].filter(Boolean).join(' '),p.suburb,p.district,p.city,p.state,p.country].filter(Boolean);
        return [{latitude:c[1],longitude:c[0],label:[...new Set(label)].join(', '),precision:p.housenumber?'address':p.street||p.type==='street'?'street':'area'}];
      });
      db.prepare('INSERT OR REPLACE INTO geocode_cache(query,payload,fetched_at) VALUES(?,?,?)').run(key,JSON.stringify(items),Date.now());
      return items;
    }).finally(()=>{pending--;inflight.delete(key);});
    tail=job;inflight.set(key,job);return job;
  };
}
module.exports={createGeocoder};
