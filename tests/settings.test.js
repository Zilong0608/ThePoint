const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const createSettings=require('../src/config/settings');

test('site URL uses saved settings, explicit environment, then Render HTTPS URL',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT)');
    const environment={RENDER_EXTERNAL_URL:'https://thepoint-test.onrender.com'};
    const get=createSettings(db,environment);
    assert.equal(get('site_url'),environment.RENDER_EXTERNAL_URL);
    environment.PUBLIC_SITE_URL='https://example.co.nz';
    assert.equal(get('site_url'),environment.PUBLIC_SITE_URL);
    db.prepare('INSERT INTO settings VALUES(?,?)').run('site_url','https://www.example.co.nz');
    assert.equal(get('site_url'),'https://www.example.co.nz');
    assert.equal(get('smtp_host'),'');
    delete environment.PUBLIC_SITE_URL;delete environment.RENDER_EXTERNAL_URL;
    db.exec('DELETE FROM settings');assert.equal(get('site_url'),'');
  }finally{db.close();}
});
