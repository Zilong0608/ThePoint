const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const initializeSchema=require('../src/database/schema');
const initializeBaseline=require('../src/database/bootstrap');

test('normal startup creates taxonomy and administrator without demo business content',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    initializeSchema(db);initializeBaseline(db);
    for(const table of ['properties','agents','news','users','vendors','posts','services','partners'])assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0,table);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM admins').get().n,1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM sections').get().n,10);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sections WHERE slug='trades'").get().n,1);
    const categories=db.prepare('SELECT COUNT(*) n FROM categories').get().n;
    initializeSchema(db);initializeBaseline(db);
    // 二次启动必须幂等:板块与分类都不能被重复插入
    assert.equal(db.prepare('SELECT COUNT(*) n FROM sections').get().n,10);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sections WHERE slug='trades'").get().n,1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM categories').get().n,categories);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM admins').get().n,1);
  }finally{db.close();}
});
