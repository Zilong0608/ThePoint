'use strict';
const environmentKeys={
  site_url:'PUBLIC_SITE_URL',
  smtp_host:'SMTP_HOST',
  smtp_port:'SMTP_PORT',
  smtp_user:'SMTP_USER',
  smtp_pass:'SMTP_PASS',
  smtp_from:'SMTP_FROM'
};

module.exports=function createSettings(db,environment=process.env){
  return function getSetting(key){
    const row=db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    if(row?.value)return row.value;
    const value=environment[environmentKeys[key]];
    if(value)return value;
    // Render supplies its own HTTPS URL after deployment. Never trust the Host header.
    return key==='site_url'?(environment.RENDER_EXTERNAL_URL||''):'';
  };
};
