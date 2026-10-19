'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateCoverage,intersectsPoint,intersectsGeometry,bounds}=require('../src/domain/council-geometry');
const square=(w,s,e,n)=>({type:'Polygon',coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]});
test('planning coverage validates closed bounded geometry and computes its actual extent',()=>{
  const p=square(174.6,-36.8,174.8,-36.6);assert.deepEqual(validateCoverage(p).bounds,[174.6,-36.8,174.8,-36.6]);
  for(const invalid of [{type:'Point',coordinates:[174.7,-36.7]},square(0,0,1,1),{type:'Polygon',coordinates:[[[174.6,-36.8],[174.8,-36.8],[174.8,-36.6],[174.6,-36.7]]]},square(174.6,-36.8,174.6,-36.7)])assert.throws(()=>validateCoverage(invalid));
});
test('document scope honours holes, multipart coverage, crossing polygons and shared boundaries',()=>{
  const outer=square(174.6,-36.8,174.8,-36.6),hole=square(174.65,-36.75,174.75,-36.65);
  const donut={type:'Polygon',coordinates:[outer.coordinates[0],hole.coordinates[0]]};
  assert.equal(intersectsPoint(donut,174.7,-36.7),false);assert.equal(intersectsPoint(donut,174.62,-36.7),true);
  assert.equal(intersectsGeometry(donut,square(174.68,-36.73,174.72,-36.67)),false);
  assert.equal(intersectsGeometry(outer,square(174.8,-36.75,174.9,-36.65)),true);
  assert.equal(intersectsGeometry(square(174.6,-36.75,174.9,-36.7),square(174.7,-36.8,174.8,-36.65)),true);
  const multi={type:'MultiPolygon',coordinates:[outer.coordinates,square(175,-36.8,175.1,-36.7).coordinates]};
  assert.equal(intersectsPoint(multi,175.05,-36.75),true);assert.deepEqual(bounds(multi),[174.6,-36.8,175.1,-36.6]);
});
