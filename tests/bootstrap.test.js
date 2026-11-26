const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const initializeSchema=require('../src/database/schema');
const initializeBaseline=require('../src/database/bootstrap');

const boot=db=>{initializeSchema(db);initializeBaseline(db);};

test('normal startup creates taxonomy and administrator without demo business content',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    boot(db);
    // 需要真人真料才有意义的表,启动时一律不造假数据
    for(const table of ['news','users','vendors','posts','services'])assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0,table);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM admins').get().n,1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM sections').get().n,10);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sections WHERE slug='trades'").get().n,1);
    const categories=db.prepare('SELECT COUNT(*) n FROM categories').get().n;
    boot(db);
    // 二次启动必须幂等:板块与分类都不能被重复插入
    assert.equal(db.prepare('SELECT COUNT(*) n FROM sections').get().n,10);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sections WHERE slug='trades'").get().n,1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM categories').get().n,categories);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM admins').get().n,1);
  }finally{db.close();}
});

test('首批真实内容写入一次,配图走随代码发布的 public/media',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    boot(db);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM agents').get().n,6);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM partners').get().n,12);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM properties').get().n,3);
    // 姓名未定的那位不能出现在正式站上
    assert.deepEqual(db.prepare('SELECT name FROM agents WHERE visible=0').all().map(r=>r.name),['金融顾问(姓名待补充)']);
    // 房源要挂到正确的专家身上,不能假设 id 顺序
    assert.deepEqual(
      db.prepare('SELECT p.title,a.name FROM properties p JOIN agents a ON a.id=p.agent_id ORDER BY p.id').all().map(r=>({title:r.title,name:r.name})),
      [{title:'Albany 精品公寓',name:'Celia Wang'},
       {title:'Albany 双拼地块',name:'Rod Macfarlane'},
       {title:'Dairy Flat 庄园别墅',name:'Celia Wang'}]);
    // 配图一律指向随代码发布的 public/media,不依赖持久化磁盘上的 uploads
    const paths=[
      ...db.prepare("SELECT photo p FROM agents").all().map(r=>r.p),
      ...db.prepare('SELECT logo p FROM partners').all().map(r=>r.p),
      ...db.prepare('SELECT images p FROM properties').all().flatMap(r=>JSON.parse(r.p))
    ];
    assert.equal(paths.length,21);
    for(const p of paths)assert.match(p,/^media\/[\w.-]+$/,p);
    // 房源所在地区要进地区列表,否则前台筛选里挑不到
    for(const s of ['Albany','Dairy Flat'])assert.equal(db.prepare('SELECT COUNT(*) n FROM suburbs WHERE name=?').get(s).n,1,s);
  }finally{db.close();}
});

test('后台删改过的内容,下次部署不会被塞回来',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    boot(db);
    db.prepare("DELETE FROM agents WHERE name='Nik Butler'").run();
    db.prepare('DELETE FROM partners WHERE id<=3').run();
    db.prepare("UPDATE properties SET title='改过的标题' WHERE id=1").run();
    db.prepare('DELETE FROM properties WHERE id=3').run();
    boot(db);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM agents WHERE name='Nik Butler'").get().n,0,'删掉的专家复活了');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM agents').get().n,5);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM partners').get().n,9);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM properties').get().n,2);
    assert.equal(db.prepare('SELECT title FROM properties WHERE id=1').get().title,'改过的标题');
  }finally{db.close();}
});

test('库里已有自己的内容时,一条种子都不写',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    initializeSchema(db);
    db.prepare("INSERT INTO agents (name) VALUES ('姑姑自己录的')").run();
    db.prepare("INSERT INTO partners (name) VALUES ('自己录的伙伴')").run();
    db.prepare("INSERT INTO properties (title) VALUES ('自己录的房源')").run();
    initializeBaseline(db);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM agents').get().n,1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM partners').get().n,1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM properties').get().n,1);
  }finally{db.close();}
});
