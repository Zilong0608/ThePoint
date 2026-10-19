'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../public/assets/js/council-content');
const text=html=>html.replace(/<[^>]*>/g,'');
const paragraph='Land with a zoning outside the urban environment is excluded from intensification (including rezoning) aspects of Plan Change 120: Future Urban, Rural, Residential – Rural and Coastal Settlement, Green Infrastructure Corridor and all zones in the Hauraki Gulf Islands District Plan. Land within settlements with a population less than 5000 people in the 2018 census is excluded from intensification rezoning aspects of Plan Change 120. All properties may be subject to the significant risk from natural hazards purpose of Plan Change 120 and this may include a rezoning proposal.';
test('Chinese planning summaries translate zones, operative status and the supplied PC120 note without exposing system fields',()=>{
  const zh=create('zh'),zone=zh.feature('zones',{properties:{ZONE:'3 — Rural - Countryside Living Zone',VERSIONSTATUS:'4 — Operative',OBJECTID:8921,GlobalID:'internal-id'}},0);
  assert.match(zone,/乡村区：田园生活/);assert.match(zone,/已生效/);assert.doesNotMatch(text(zone),/[A-Za-z]/);assert.doesNotMatch(zone,/OBJECTID|GlobalID|internal-id/);
  const summary=zh.feature('changes',{properties:{Zone1:'- Rural - Countryside Living Zone',Label1:paragraph}},0);
  assert.match(summary,/不纳入第120号规划变更的加密开发/);assert.match(summary,/所有物业仍可能受到/);assert.match(summary,/自然灾害风险/);assert.doesNotMatch(text(summary),/[A-Za-z]/);
});
test('unknown Chinese translations stay explicit rather than inventing a planning conclusion',()=>{
  const zh=create('zh');assert.match(zh.explanation('A new restriction not yet reviewed'),/尚无经核实的中文译文/);assert.match(zh.zone('New zone'),/尚待核实/);assert.match(zh.status('New status'),/尚待核实/);
  assert.doesNotMatch(text(zh.feature('changes',{properties:{Label1:'<img src=x onerror=alert(1)>'}},0)),/[A-Za-z]/);
});
test('English summaries retain official English notes and never fall back to Chinese values',()=>{
  const en=create('en');assert.equal(en.explanation(paragraph),paragraph);
  assert.doesNotMatch(en.feature('zones',{properties:{ZONE:'中文分区',VERSIONSTATUS:'中文状态'}},0),/[\u3400-\u9fff]/);
  assert.doesNotMatch(en.feature('changes',{properties:{Label1:'中文说明'}},0),/[\u3400-\u9fff]/);
  assert.doesNotMatch(en.feature('changes',{properties:{Label1:'<img src=x onerror=alert(1)>'}},0),/<img/);
});
test('related planning records show localized explanations without claiming their absence is an all-clear',()=>{
  for(const name of ['precincts','designations']){
    const zh=create('zh').feature(name,{properties:{PRECINCT:'87 — Albany Centre',NAME:'Original English name',VERSIONSTATUS:'4 — Operative'}},0);
    assert.match(zh,/已生效/);assert.doesNotMatch(text(zh),/[A-Za-z]/);
    const en=create('en').feature(name,{properties:{VERSIONSTATUS:'4 — Operative'}},0);assert.doesNotMatch(text(en),/[\u3400-\u9fff]/);
  }
});
test('hazard and utility labels remain localized and do not turn source intersections into safety findings',()=>{
  for(const name of ['floodplains','floodprone','flowpaths','stormwater','water','wastewater','heights']){
    const zh=create('zh'),markup=zh.feature(name,{properties:{SW_DIAMETER_MM:200,VERSIONSTATUS:'4 — Operative'}},0);assert.doesNotMatch(text(markup),/[A-Za-z]/);assert.ok(zh.layerInfo[name].note.length);
    assert.doesNotMatch(create('en').feature(name,{properties:{}},0),/[\u3400-\u9fff]/);
  }
  const zh=create('zh').feature('planchanges',{properties:{NUMBER:'PC 120',STATUS:'5 — Proposed'}},0);assert.match(zh,/第120号规划变更/);assert.match(zh,/拟议中/);assert.doesNotMatch(text(zh),/[A-Za-z]/);
});
