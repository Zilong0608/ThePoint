'use strict';
// Small, bounded, staff-supplied WGS84 coverage polygons. No inferred plan extents.
function validateCoverage(input){
  if(input===null||input===undefined||input==='')return null;
  const geometry=typeof input==='string'?JSON.parse(input):input;
  if(!geometry||!['Polygon','MultiPolygon'].includes(geometry.type)||!Array.isArray(geometry.coordinates))throw Error('Invalid coverage geometry');
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  if(!polygons.length||polygons.length>100)throw Error('Invalid polygon count');
  let count=0,west=Infinity,south=Infinity,east=-Infinity,north=-Infinity;
  for(const polygon of polygons){
    if(!Array.isArray(polygon)||!polygon.length||polygon.length>100)throw Error('Invalid rings');
    for(const ring of polygon){
      if(!Array.isArray(ring)||ring.length<4)throw Error('Invalid ring');
      for(const p of ring){
        if(++count>5000||!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='number'||!Number.isFinite(v))||p[0]<174||p[0]>175.65||p[1]<-37.35||p[1]>-35.8)throw Error('Invalid coverage coordinates');
        west=Math.min(west,p[0]);east=Math.max(east,p[0]);south=Math.min(south,p[1]);north=Math.max(north,p[1]);
      }
      if(ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])throw Error('Ring must close');
      let area=0;for(let i=0;i<ring.length-1;i++)area+=ring[i][0]*ring[i+1][1]-ring[i+1][0]*ring[i][1];
      if(Math.abs(area)<1e-12)throw Error('Degenerate ring');
    }
  }
  return {geometry:{type:geometry.type,coordinates:geometry.coordinates},bounds:[west,south,east,north]};
}
function ringState(x,y,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [ax,ay]=ring[j],[bx,by]=ring[i],cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax);
    if(Math.abs(cross)<1e-12&&x>=Math.min(ax,bx)&&x<=Math.max(ax,bx)&&y>=Math.min(ay,by)&&y<=Math.max(ay,by))return 0;
    if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
  }
  return inside?1:-1;
}
function intersectsPoint(geometry,lng,lat){
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  return polygons.some(rings=>{
    const outer=ringState(lng,lat,rings[0]);if(outer===-1)return false;if(outer===0)return true;
    for(const hole of rings.slice(1)){const state=ringState(lng,lat,hole);if(state===0)return true;if(state===1)return false;}
    return true;
  });
}
function polygonList(geometry){return geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;}
function bounds(geometry){
  const pairs=polygonList(geometry).flat(2);let west=Infinity,south=Infinity,east=-Infinity,north=-Infinity;
  for(const [x,y]of pairs){west=Math.min(west,x);east=Math.max(east,x);south=Math.min(south,y);north=Math.max(north,y);}
  return [west,south,east,north];
}
function intersectSegments(a,b,c,d){
  const turn=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  const on=(p,q,r)=>Math.abs(turn(p,q,r))<1e-12&&r[0]>=Math.min(p[0],q[0])&&r[0]<=Math.max(p[0],q[0])&&r[1]>=Math.min(p[1],q[1])&&r[1]<=Math.max(p[1],q[1]);
  const t1=turn(a,b,c),t2=turn(a,b,d),t3=turn(c,d,a),t4=turn(c,d,b);
  return ((t1>0&&t2<0||t1<0&&t2>0)&&(t3>0&&t4<0||t3<0&&t4>0))||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
}
function intersectsGeometry(a,b){
  const [aw,as,ae,an]=bounds(a),[bw,bs,be,bn]=bounds(b);if(ae<bw||be<aw||an<bs||bn<as)return false;
  const pa=polygonList(a),pb=polygonList(b);
  const points=polygons=>polygons.reduce((sum,p)=>sum+p.reduce((n,r)=>n+r.length,0),0);
  if(points(pa)*points(pb)>1000000)throw Error('Coverage intersection requires further verification');
  if(pa.some(p=>p[0].some(([x,y])=>intersectsPoint(b,x,y)))||pb.some(p=>p[0].some(([x,y])=>intersectsPoint(a,x,y))))return true;
  for(const ra of pa.flat())for(const rb of pb.flat())for(let i=1;i<ra.length;i++)for(let j=1;j<rb.length;j++)if(intersectSegments(ra[i-1],ra[i],rb[j-1],rb[j]))return true;
  return false;
}
module.exports={validateCoverage,intersectsPoint,bounds,intersectsGeometry};
