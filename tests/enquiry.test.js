const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const initializeSchema=require('../src/database/schema');
const {INTENTS,resolveIntent,validateEnquiry}=require('../src/domain/enquiry');

const bad=(body,intent,text)=>assert.throws(()=>validateEnquiry(body,intent),e=>e.status===400&&(!text||e.message.includes(text)),JSON.stringify(body));

test('咨询方式只接受白名单内的值',()=>{
  for(const i of INTENTS)assert.equal(resolveIntent({intent:i}),i);
  assert.throws(()=>resolveIntent({intent:'drop table'}),e=>e.status===400);
  assert.throws(()=>resolveIntent({intent:'__proto__'}),e=>e.status===400);
});

test('旧前台只发 type=viewing 时仍按预约看房处理',()=>{
  assert.equal(resolveIntent({type:'viewing'}),'viewing');
  assert.equal(resolveIntent({type:'general'}),'');
  assert.equal(resolveIntent({}),'');
  // intent 优先于 type:同一个房源页既可能问问题也可能要回电
  assert.equal(resolveIntent({type:'viewing',intent:'callback'}),'callback');
});

test('全名是硬要求,一个字的称呼不算',()=>{
  bad({name:'',message:'想问问'},'question','全名');
  bad({name:' ',message:'想问问'},'question','全名');
  bad({name:'王',message:'想问问'},'question','全名');
  validateEnquiry({name:'王小明',message:'想问问'},'question');
  validateEnquiry({name:'Jo Li',message:'hi'},'question');
});

test('咨询问题必须写清问的是什么,其余三种来意不强制',()=>{
  bad({name:'王小明',message:''},'question','问题');
  bad({name:'王小明'},'','问题');                                  // 没选来意的旧表单沿用原规则
  validateEnquiry({name:'王小明',phone:'021',message:''},'callback');
  validateEnquiry({name:'王小明',email:'a@b.co',message:''},'info_pack');
  validateEnquiry({name:'王小明',phone:'021',message:''},'viewing');
});

test('要求回电必须留电话;看房与索取资料至少留一种联系方式',()=>{
  bad({name:'王小明',email:'a@b.co'},'callback','电话');
  validateEnquiry({name:'王小明',phone:'021 123'},'callback');
  bad({name:'王小明'},'viewing','电话或邮箱');
  bad({name:'王小明'},'info_pack','电话或邮箱');
  validateEnquiry({name:'王小明',email:'a@b.co'},'viewing');
  validateEnquiry({name:'王小明',phone:'021'},'info_pack');
});

test('订阅只要邮箱,不受全名与留言的约束',()=>{
  validateEnquiry({type:'subscribe',email:'a@b.co'},'');
  bad({type:'subscribe',email:''},'','邮箱');
});

test('enquiries 表迁移出 intent 列,且重复启动不报错',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    initializeSchema(db);
    const cols=db.prepare('PRAGMA table_info(enquiries)').all().map(c=>c.name);
    assert.ok(cols.includes('intent'),'缺少 intent 列');
    initializeSchema(db);
    assert.equal(db.prepare('PRAGMA table_info(enquiries)').all().filter(c=>c.name==='intent').length,1);
    // 新列可写可读,默认空字符串而不是 NULL
    db.prepare("INSERT INTO enquiries (type,name,message) VALUES ('general','王小明','问问')").run();
    assert.equal(db.prepare('SELECT intent FROM enquiries').get().intent,'');
    db.prepare("INSERT INTO enquiries (type,intent,name,phone) VALUES ('property','callback','李四','021')").run();
    assert.equal(db.prepare("SELECT COUNT(*) n FROM enquiries WHERE intent='callback'").get().n,1);
  }finally{db.close();}
});
