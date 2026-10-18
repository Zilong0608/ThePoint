/* ============================================================
   THE POINT 一点 · 后端服务
   Express + node:sqlite + Multer 图片上传
   启动: npm start  →  http://localhost:3000
   管理后台: http://localhost:3000/admin/  (默认 admin / thepoint2026)
   ============================================================ */
const express = require('express');
const { DatabaseSync } = require('node:sqlite'); // Node 22.13+ 内置,无需编译
const multer = require('multer');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { validateViewing } = require('./domain/property');
const { normalizeSchedule } = require('./domain/publication');
const {createBackup}=require('../scripts/backup');
const adminPolicy=require('./security/admin-policy');
const {detailHtml}=require('./services/seo');
const {createGeocoder}=require('./services/geocoding');

const PORT = process.env.PORT || 3000;
const {PUBLIC_DIR:ROOT,DATA_DIR,UPLOAD_DIR}=require('./config/paths');
const initializeSchema=require('./database/schema');
const initializeBaseline=require('./database/bootstrap');
const {hashPassword,verifyPassword}=require('./security/passwords');
const secureCookie=process.env.COOKIE_SECURE==='1'?'; Secure':'';
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ---------------- 数据库 ---------------- */
const db = new DatabaseSync(path.join(DATA_DIR, 'data.sqlite'));
db.exec('PRAGMA journal_mode = WAL;');
const geocode=createGeocoder({db});

initializeSchema(db);
initializeBaseline(db);

/* ---------------- 登录失败限流(内存计数,单进程足够) ----------------
   同一 IP + 同一账号连续失败 N 次后锁定一段时间,防止无限撞密码。
   成功登录立即清零。 */
const LOGIN_MAX_FAIL = 6;              /* 连续失败上限 */
const LOGIN_LOCK_MS = 15 * 60 * 1000;  /* 锁定 15 分钟 */
const loginFails = new Map();
const clientIp = req => req.ip || req.socket.remoteAddress || 'unknown';
function loginKey(req, who) { return clientIp(req) + '|' + String(who || '').toLowerCase(); }
/* 返回剩余锁定秒数;0 表示未锁 */
function loginLocked(key) {
  const r = loginFails.get(key);
  if (!r || r.until <= Date.now()) return 0;
  return Math.ceil((r.until - Date.now()) / 1000);
}
function loginFailed(key) {
  const r = loginFails.get(key) || { n: 0, until: 0 };
  r.n += 1;
  if (r.n >= LOGIN_MAX_FAIL) { r.until = Date.now() + LOGIN_LOCK_MS; r.n = 0; }
  loginFails.set(key, r);
}
const loginOk = key => loginFails.delete(key);
/* 定期清掉过期条目,别让这个 Map 无限长大 */
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of loginFails) if (v.until && v.until <= now) loginFails.delete(k);
}, 30 * 60 * 1000).unref();

/* ---------------- 手工新增地区时补入筛选列表 ---------------- */
const ensureSuburb = name => {
  name = String(name || '').trim();
  if (name) db.prepare('INSERT OR IGNORE INTO suburbs (name, sort_order) VALUES (?, 999)').run(name);
};
/* ---------------- App ---------------- */
const app = express();
if(process.env.TRUST_PROXY==='1')app.set('trust proxy',1);
app.use(express.json({ limit: '2mb' }));
const recentErrors=[];
const backupState={enabled:process.env.TP_AUTO_BACKUP!=='0',last:null,error:''};
function runBackup(){
  try{backupState.last=createBackup({dataDir:DATA_DIR});backupState.error='';return backupState.last;}
  catch(e){backupState.error=e.message;throw e;}
}
app.get('/healthz',(req,res)=>{
  try{db.prepare('SELECT 1').get();res.json({ok:true});}catch(_){res.status(503).json({ok:false});}
});

/* 阻止直接下载敏感文件 */
app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  if (p.startsWith('/data.sqlite') || p === '/server.js' || p.startsWith('/node_modules') || p === '/package.json' || p === '/package-lock.json' || p.endsWith('.md')) {
    return res.status(404).end();
  }
  next();
});

/* ---------------- 会话(SQLite 持久化,重启不掉线) ---------------- */
const ADMIN_TTL = 1000 * 60 * 60 * 12;      // 管理员 12 小时
const USER_TTL = 1000 * 60 * 60 * 24 * 30;  // 用户记住登录 30 天

function createSession(kind, refId, ttl) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token,kind,ref_id,expires) VALUES (?,?,?,?)')
    .run(token, kind, refId, Date.now() + ttl);
  return token;
}
function getSessionRow(kind, token, ttl) {
  if (!token) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE token=? AND kind=?').get(token, kind);
  if (!row) return null;
  if (row.expires < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    return null;
  }
  db.prepare('UPDATE sessions SET expires=? WHERE token=?').run(Date.now() + ttl, token); // 滑动续期
  return row;
}
const destroySession = token => { if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token); };
db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
db.prepare('DELETE FROM password_resets WHERE expires < ?').run(Date.now());
setInterval(() => {
  try {
    db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    db.prepare('DELETE FROM password_resets WHERE expires < ?').run(Date.now());
  } catch (e) {}
}, 6 * 3600 * 1000).unref();

/* ---------------- 站点设置 + 通知 ---------------- */
const getSetting = require('./config/settings')(db);

/* ---------------- 邮件发送(SMTP)----------------
   后台「设置」里填好 SMTP 即自动生效;没配置时静默跳过,站内通知不受影响。 */
let _mailer = null, _mailerKey = '';
function getMailer() {
  const host = getSetting('smtp_host');
  if (!host) return null;
  const port = Number(getSetting('smtp_port')) || 465;
  const user = getSetting('smtp_user'), pass = getSetting('smtp_pass');
  /* 配置改过就重建,免得保存了新设置还在用旧连接 */
  const key = [host, port, user, pass].join('|');
  if (_mailer && key === _mailerKey) return _mailer;
  _mailer = nodemailer.createTransport({
    host, port,
    secure: port === 465,                 /* 465 走 SMTPS,587/25 走 STARTTLS */
    auth: user ? { user, pass } : undefined
  });
  _mailerKey = key;
  return _mailer;
}
/* 统一的邮件外观:与站点同一套克制的排版 */
function mailHtml(title, body, link, linkLabel) {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<div style="margin:0;padding:32px 16px;background:#f4f3f1;font-family:-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e1da">
    <div style="padding:26px 32px;border-bottom:1px solid #e5e1da">
      <span style="font-size:13px;letter-spacing:.22em;color:#9a8763;text-transform:uppercase">THE POINT 一点</span>
    </div>
    <div style="padding:30px 32px">
      <h1 style="margin:0 0 16px;font-size:19px;font-weight:600;color:#2b2b2b">${esc(title)}</h1>
      <p style="margin:0;font-size:14px;line-height:1.75;color:#5a5750;white-space:pre-wrap">${esc(body)}</p>
      ${link ? `<p style="margin:26px 0 0">
        <a href="${esc(link)}" style="display:inline-block;padding:11px 26px;background:#2b2b2b;color:#fff;text-decoration:none;font-size:14px">${esc(linkLabel || '查看详情')}</a>
      </p>
      <p style="margin:18px 0 0;font-size:12px;color:#9b978f;word-break:break-all">按钮打不开可复制此链接:<br>${esc(link)}</p>` : ''}
    </div>
    <div style="padding:18px 32px;border-top:1px solid #e5e1da;font-size:12px;color:#9b978f">
      本邮件由系统自动发送,请勿直接回复。
    </div>
  </div>
</div>`;
}
async function mailSend({ to, subject, text, html }) {
  const t = getMailer();
  if (!t) throw new Error('尚未配置 SMTP');
  const from = getSetting('smtp_from') || getSetting('smtp_user') || 'no-reply@localhost';
  return t.sendMail({ from, to, subject, text, html });
}


const setSetting = (k, v) => db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v ?? ''));

/* 站内通知;SMTP 配置后可在此接入邮件(接口已预留) */
function notify(userId, n) {
  if (!userId) return;
  db.prepare('INSERT INTO notifications (user_id,type,title_zh,title_en,body_zh,body_en,link) VALUES (?,?,?,?,?,?,?)')
    .run(userId, n.type || 'system', n.title_zh || '', n.title_en || '', n.body_zh || '', n.body_en || '', n.link || '');
  sendMail(userId, n); // 无 SMTP 配置时为空操作
}
function sendMail(userId, n) {
  /* 站内通知的同时发一封邮件。需在后台「设置」里配好 SMTP 并打开开关;
     任何失败只记日志,绝不影响站内通知本身。 */
  try {
    if (getSetting('notify_email_enabled') !== '1' || !getSetting('smtp_host')) return;
    const u = db.prepare('SELECT email FROM users WHERE id=?').get(userId);
    if (!u || !u.email) return;
    const base = (getSetting('site_url') || '').replace(/[/]+$/, '');
    const link = n.link && base ? base + '/' + String(n.link).replace(/^[/]+/, '') : '';
    mailSend({
      to: u.email,
      subject: n.title_zh || '一点通知',
      text: [n.title_zh, n.body_zh, link].filter(Boolean).join('\n\n'),
      html: mailHtml(n.title_zh || '一点通知', n.body_zh || '', link, '前往查看')
    }).catch(e => console.error('通知邮件发送失败:', e.message));
  } catch (e) { console.error('sendMail:', e.message); }
}

/* 管理员操作留痕(谁 / 何时 / 对谁 / 做了什么) */
function alog(req, action, targetType, targetId, targetLabel, detail) {
  try {
    db.prepare('INSERT INTO admin_logs (admin,action,target_type,target_id,target_label,detail) VALUES (?,?,?,?,?,?)')
      .run((req.admin && req.admin.username) || 'admin', action, targetType || '', targetId ?? null,
        String(targetLabel || '').slice(0, 200), String(detail || '').slice(0, 500));
  } catch (e) { console.error('alog:', e.message); }
}
/* 踢下线:删除某用户全部会话 */
const kickUser = userId => db.prepare("DELETE FROM sessions WHERE kind='user' AND ref_id=?").run(userId);

function getToken(req) {
  const c = req.headers.cookie || '';
  const m = c.match(/(?:^|;\s*)tp_sid=([a-f0-9]{48})/);
  return m ? m[1] : null;
}
function requireAuth(req, res, next) {
  const s = getSessionRow('admin', getToken(req), ADMIN_TTL);
  if (!s) return res.status(401).json({ error: '未登录' });
  const adm = db.prepare('SELECT id,username,role,status FROM admins WHERE id=?').get(s.ref_id);
  if (!adm||adm.status!=='active') return res.status(401).json({ error: '未登录' });
  if(!adminPolicy.allowed(adm.role,req.method,req.path))return res.status(403).json({error:'当前后台角色没有此操作权限'});
  if(adm.role==='editor'&&req.method!=='GET'&&/^\/api\/admin\/posts\/\d+$/.test(req.path)){
    const target=db.prepare('SELECT user_id FROM posts WHERE id=?').get(Number(req.path.split('/').pop()));
    if(target&&target.user_id)return res.status(403).json({error:'用户发布内容需由审核人员或管理员处理'});
  }
  req.admin = { id: adm.id, username: adm.username, role:adm.role };
  next();
}

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const key = loginKey(req, username);
  const wait = loginLocked(key);
  if (wait) return res.status(429).json({ error: '登录失败次数过多,请 ' + Math.ceil(wait / 60) + ' 分钟后再试' });
  const row = db.prepare('SELECT * FROM admins WHERE username=?').get(String(username || ''));
  if (!row || row.status!=='active' || !verifyPassword(String(password || ''), row.salt, row.password_hash)) {
    loginFailed(key);
    return res.status(401).json({ error: '账号或密码错误' });
  }
  loginOk(key);
  const token = createSession('admin', row.id, ADMIN_TTL);
  res.setHeader('Set-Cookie', `tp_sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${ADMIN_TTL / 1000}${secureCookie}`);
  res.json({ ok: true, username: row.username, role:row.role });
});
app.post('/api/admin/logout', (req, res) => {
  destroySession(getToken(req));
  res.setHeader('Set-Cookie', 'tp_sid=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/admin/me', requireAuth, (req, res) => res.json(req.admin));
app.get('/api/admin/staff',requireAuth,(req,res)=>res.json(db.prepare('SELECT id,username,role,status FROM admins ORDER BY id').all()));
app.post('/api/admin/staff',requireAuth,(req,res)=>{
  const b=req.body||{},username=String(b.username||'').trim(),pw=String(b.password||'');
  if(!/^[a-zA-Z0-9_-]{3,40}$/.test(username)||pw.length<10||!adminPolicy.roles.includes(b.role))return res.status(400).json({error:'账号需 3–40 位字母、数字或下划线，密码至少 10 位，并选择有效角色'});
  if(db.prepare('SELECT id FROM admins WHERE username=?').get(username))return res.status(400).json({error:'后台账号已存在'});
  const {salt,hash}=hashPassword(pw);const r=db.prepare('INSERT INTO admins (username,password_hash,salt,role) VALUES (?,?,?,?)').run(username,hash,salt,b.role);
  alog(req,'staff_create','admin',Number(r.lastInsertRowid),username,b.role);res.json({ok:true,id:Number(r.lastInsertRowid)});
});
app.put('/api/admin/staff/:id',requireAuth,(req,res)=>{
  const old=db.prepare('SELECT id,username,role,status FROM admins WHERE id=?').get(Number(req.params.id)),b=req.body||{};
  if(!old)return res.status(404).json({error:'后台账号不存在'});
  const role=b.role||old.role,status=b.status||old.status,pw=String(b.new_password||'');
  if(!adminPolicy.roles.includes(role)||!['active','disabled'].includes(status)||(pw&&pw.length<10))return res.status(400).json({error:'角色、状态无效或新密码少于 10 位'});
  if(old.id===req.admin.id&&(role!==old.role||status!=='active'))return res.status(400).json({error:'不能在当前会话降级或停用自己的账号，请由另一位管理员处理'});
  db.exec('BEGIN IMMEDIATE');
  try{
    if(old.role==='admin'&&old.status==='active'&&(role!=='admin'||status!=='active')&&db.prepare("SELECT COUNT(*) c FROM admins WHERE role='admin' AND status='active'").get().c<=1){db.exec('ROLLBACK');return res.status(400).json({error:'必须保留至少一个正常管理员'});}
    db.prepare('UPDATE admins SET role=?,status=? WHERE id=?').run(role,status,old.id);
    if(pw){const {salt,hash}=hashPassword(pw);db.prepare('UPDATE admins SET salt=?,password_hash=? WHERE id=?').run(salt,hash,old.id);}
    db.prepare("DELETE FROM sessions WHERE kind='admin' AND ref_id=?").run(old.id);
    alog(req,'staff_update','admin',old.id,old.username,`角色 ${role}；状态 ${status}${pw?'；重置密码':''}`);db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  res.json({ok:true});
});
app.post('/api/admin/change-password', requireAuth, (req, res) => {
  const { old_password, new_password } = req.body || {};
  const row = db.prepare('SELECT * FROM admins WHERE username=?').get(req.admin.username);
  if (!verifyPassword(String(old_password || ''), row.salt, row.password_hash)) {
    return res.status(400).json({ error: '原密码错误' });
  }
  if (!new_password || String(new_password).length < 6) return res.status(400).json({ error: '新密码至少 6 位' });
  const { salt, hash } = hashPassword(String(new_password));
  db.prepare('UPDATE admins SET password_hash=?, salt=? WHERE id=?').run(hash, salt, row.id);
  db.prepare("DELETE FROM sessions WHERE kind='admin' AND ref_id=?").run(row.id);
  res.json({ ok: true });
});

/* ============================================================
   用户账号体系(统一账号:普通用户 / 入驻方)
   ============================================================ */
function getUserToken(req) {
  const c = req.headers.cookie || '';
  const m = c.match(/(?:^|;\s*)tp_uid=([a-f0-9]{48})/);
  return m ? m[1] : null;
}
function currentUser(req) {
  const s = getSessionRow('user', getUserToken(req), USER_TTL);
  if (!s) return null;
  const u = db.prepare('SELECT id,email,name,phone,wechat,avatar,status FROM users WHERE id=?').get(s.ref_id);
  return (u && u.status === 'active') ? u : null;
}
function requireUser(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: '请先登录' });
  req.user = u;
  next();
}
const vendorOf = userId => db.prepare('SELECT * FROM vendors WHERE user_id=?').get(userId) || null;
function publicVendor(v) {
  if (!v) return null;
  let photos = [];
  try { photos = JSON.parse(v.photos || '[]'); } catch (e) {}
  const { user_id, apply_message, review_note, ...rest } = v;
  return { ...rest, photos };
}

app.post('/api/auth/register', (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: '邮箱格式不正确' });
  if (!b.password || String(b.password).length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return res.status(400).json({ error: '该邮箱已注册' });
  const { salt, hash } = hashPassword(String(b.password));
  const info = db.prepare('INSERT INTO users (email,password_hash,salt,name,phone) VALUES (?,?,?,?,?)')
    .run(email, hash, salt, String(b.name || '').slice(0, 100), String(b.phone || '').slice(0, 50));
  const token = createSession('user', info.lastInsertRowid, USER_TTL);
  res.setHeader('Set-Cookie', `tp_uid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${USER_TTL / 1000}${secureCookie}`);
  notify(info.lastInsertRowid, {
    type: 'system',
    title_zh: '欢迎来到一点', title_en: 'Welcome to The Point',
    body_zh: '您现在可以在「集市」发布二手闲置;商家与顾问可申请入驻,获得专属主页。',
    body_en: 'You can now post in the Marketplace. Businesses and advisors may apply to become a provider.',
    link: 'join.html'
  });
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.post('/api/auth/login', (req, res) => {
  const b = req.body || {};
  const key = loginKey(req, b.email);
  const wait = loginLocked(key);
  if (wait) return res.status(429).json({ error: '登录失败次数过多,请 ' + Math.ceil(wait / 60) + ' 分钟后再试' });
  const row = db.prepare('SELECT * FROM users WHERE email=?').get(String(b.email || '').trim().toLowerCase());
  if (!row || !verifyPassword(String(b.password || ''), row.salt, row.password_hash)) {
    loginFailed(key);
    return res.status(401).json({ error: '邮箱或密码错误' });
  }
  loginOk(key);
  if (row.status !== 'active') return res.status(403).json({ error: '账号已被停用,请联系管理员' });
  const token = createSession('user', row.id, USER_TTL);
  res.setHeader('Set-Cookie', `tp_uid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${USER_TTL / 1000}${secureCookie}`);
  res.json({ ok: true, name: row.name, email: row.email });
});
/* ---------- 忘记密码:申请重置 / 校验链接 / 提交新密码 ---------- */
const RESET_TTL = 60 * 60 * 1000;   /* 重置链接 1 小时内有效 */
const resetDigest = token => 'sha256:' + crypto.createHash('sha256').update(String(token)).digest('hex');
const resetRow = token => db.prepare('SELECT * FROM password_resets WHERE token IN (?,?)').get(resetDigest(token),String(token));
app.post('/api/auth/forgot', (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  /* 无论邮箱是否注册过都返回成功 —— 否则这个接口就成了「哪些邮箱注册过」的探测器 */
  const base=(getSetting('site_url') || process.env.PUBLIC_SITE_URL || '').replace(/\/$/,'');
  const available=!!getSetting('smtp_host') && /^https?:\/\//i.test(base);
  const done = () => res.json({ ok: true, delivery_available:available });
  const throttle=loginKey(req,'password-recovery');
  if(loginLocked(throttle))return done();
  loginFailed(throttle);
  if(!available)return done();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return done();
  const u = db.prepare('SELECT id,email,name,status FROM users WHERE email=?').get(email);
  if (!u || u.status !== 'active') return done();
  /* 限流:同一账号 5 分钟内只发一封,防止被人拿来轰炸别人的邮箱 */
  const recent = db.prepare("SELECT COUNT(*) c FROM password_resets WHERE user_id=? AND created_at > datetime('now','localtime','-5 minutes')").get(u.id).c;
  if (recent) return done();
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO password_resets (token,user_id,expires) VALUES (?,?,?)').run(resetDigest(token), u.id, Date.now() + RESET_TTL);
  const link = `${base}/reset.html?token=${token}`;
  const body = `您好${u.name ? ' ' + u.name : ''},\n\n我们收到了重置「一点」账号密码的请求。点击下面的按钮设置新密码,链接 1 小时内有效。\n\n如果这不是您本人操作,忽略本邮件即可,您的密码不会有任何变化。`;
  mailSend({
    to: u.email, subject: '重置您的一点账号密码',
    text: body + '\n\n' + link,
    html: mailHtml('重置密码', body, link, '设置新密码')
  }).catch(e => console.error('忘记密码邮件发送失败:', e.message));
  done();
});
/* 打开重置页时先校验一次,免得用户填完才被告知链接过期 */
app.get('/api/auth/reset-check', (req, res) => {
  const r = resetRow(String(req.query.token || ''));
  const u=r?db.prepare('SELECT status FROM users WHERE id=?').get(r.user_id):null;
  res.json({ valid: !!(r && u && u.status==='active' && !r.used && r.expires >= Date.now()) });
});
app.post('/api/auth/reset', (req, res) => {
  const b = req.body || {};
  const pw = String(b.new_password || '');
  if (pw.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  const r = resetRow(String(b.token || ''));
  if (!r || r.used || r.expires < Date.now()) return res.status(400).json({ error: '链接无效或已过期,请重新申请' });
  const u = db.prepare('SELECT id,email,status FROM users WHERE id=?').get(r.user_id);
  if (!u || u.status!=='active') return res.status(400).json({ error: '账号不可用，请联系平台' });
  const { salt, hash } = hashPassword(pw);
  db.exec('BEGIN IMMEDIATE');
  try {
    const claimed=db.prepare('UPDATE password_resets SET used=1 WHERE token=? AND used=0 AND expires>=?').run(r.token,Date.now());
    if(!claimed.changes){db.exec('ROLLBACK');return res.status(400).json({error:'链接无效或已使用'});}
    db.prepare('UPDATE users SET password_hash=?, salt=? WHERE id=?').run(hash, salt, u.id);
  /* 用过即废;并作废该账号其它未使用的重置链接 */
  db.prepare('UPDATE password_resets SET used=1 WHERE user_id=?').run(u.id);
  /* 改完密码踢掉全部旧会话,别人就算偷到 cookie 也失效 */
  kickUser(u.id);
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  destroySession(getUserToken(req));
  res.setHeader('Set-Cookie', 'tp_uid=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/auth/me', requireUser, (req, res) => {
  const v = vendorOf(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND is_read=0').get(req.user.id).c;
  res.json({
    ...req.user, unread_notifications: unread,
    vendor: v ? { id: v.id, status: v.status, verified: v.verified, name_zh: v.name_zh, name_en: v.name_en } : null
  });
});
/* ---------- 站内通知 ---------- */
app.get('/api/my/notifications', requireUser, (req, res) => {
  res.json(db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50').all(req.user.id));
});
app.put('/api/my/notifications/read-all', requireUser, (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(req.user.id);
  res.json({ ok: true });
});
app.put('/api/my/notifications/:id/read', requireUser, (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});
app.put('/api/auth/profile', requireUser, (req, res) => {
  const b = req.body || {};
  db.prepare('UPDATE users SET name=?, phone=?, wechat=?, avatar=? WHERE id=?')
    .run(String(b.name ?? req.user.name).slice(0, 100), String(b.phone ?? req.user.phone).slice(0, 50),
      String(b.wechat ?? req.user.wechat).slice(0, 100), String(b.avatar ?? req.user.avatar).slice(0, 300), req.user.id);
  res.json({ ok: true });
});
app.post('/api/auth/change-password', requireUser, (req, res) => {
  const { old_password, new_password } = req.body || {};
  const row = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!verifyPassword(String(old_password || ''), row.salt, row.password_hash)) {
    return res.status(400).json({ error: '原密码错误' });
  }
  if (!new_password || String(new_password).length < 6) return res.status(400).json({ error: '新密码至少 6 位' });
  const { salt, hash } = hashPassword(String(new_password));
  db.prepare('UPDATE users SET password_hash=?, salt=? WHERE id=?').run(hash, salt, row.id);
  db.prepare('UPDATE password_resets SET used=1 WHERE user_id=?').run(row.id);
  kickUser(row.id);
  res.json({ ok: true });
});

/* ---------------- 图片上传 ---------------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    cb(null, /^image\/(jpe?g|png|webp|gif|avif)$/.test(file.mimetype));
  }
});
function imageType(b) {
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return ['jpg', 'image/jpeg'];
  if (b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && b.toString('ascii',12,16) === 'IHDR') return ['png', 'image/png'];
  if (/^GIF8[79]a$/.test(b.toString('ascii',0,6)) && b.length >= 13) return ['gif', 'image/gif'];
  if (b.length >= 20 && b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WEBP') return ['webp', 'image/webp'];
  if (b.length >= 24 && b.toString('ascii',4,8) === 'ftyp' && /avif|avis/.test(b.toString('ascii',8,32))) return ['avif', 'image/avif'];
  return null;
}
/* 将已有本地图片纳入媒体库；不移动文件，重复启动不会重复登记。 */
for (const [folder, prefix] of [[path.join(ROOT,'media'),'media'],[UPLOAD_DIR,'uploads']]) {
  if (!fs.existsSync(folder)) continue;
  for (const filename of fs.readdirSync(folder)) {
    if (!/^[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp|gif|avif)$/i.test(filename)) continue;
    const target = path.join(folder,filename), stat = fs.statSync(target);
    if (!stat.isFile()) continue;
    const fd = fs.openSync(target,'r'), header = Buffer.alloc(32);
    try { fs.readSync(fd,header,0,32,0); } finally { fs.closeSync(fd); }
    const type = imageType(header);
    if (type) db.prepare("INSERT OR IGNORE INTO media_files (path,original_name,mime,size,owner_kind) VALUES (?,?,?,?,'system')")
      .run(prefix+'/'+filename,filename,type[1],stat.size);
  }
}
function saveImages(req, res) {
  const files = req.files || [];
  const types = files.map(f => imageType(f.buffer));
  if (!files.length || types.some(t => !t)) return res.status(400).json({ error: '请选择有效的 JPG、PNG、WebP、GIF 或 AVIF 图片；不支持 SVG' });
  const saved = [];
  try {
    db.exec('BEGIN');
    files.forEach((f, i) => {
      const [ext, mime] = types[i];
      const filename = crypto.randomBytes(16).toString('hex') + '.' + ext;
      const target = path.join(UPLOAD_DIR, filename);
      fs.writeFileSync(target, f.buffer, { flag: 'wx' }); saved.push(target);
      db.prepare('INSERT INTO media_files (path,original_name,mime,size,owner_kind,owner_id) VALUES (?,?,?,?,?,?)')
        .run('uploads/' + filename, path.basename(f.originalname).slice(0,200), mime, f.size, req.admin ? 'admin' : 'user', req.admin ? req.admin.id : req.user.id);
    });
    db.exec('COMMIT');
    res.json({ files: saved.map(f => 'uploads/' + path.basename(f)) });
  } catch (e) {
    db.exec('ROLLBACK');
    saved.forEach(f => { try { fs.unlinkSync(f); } catch (_) {} });
    res.status(500).json({ error: '图片保存失败，请重试' });
  }
}
app.post('/api/admin/upload', requireAuth, upload.array('files', 20), saveImages);
/* 登录用户上传(发布配图 / 头像 / 入驻资料) */
app.post('/api/user/upload', requireUser, upload.array('files', 6), saveImages);
app.get('/api/admin/media', requireAuth, (req, res) => {
  const q = '%' + String(req.query.q || '').slice(0,100) + '%';
  res.json(db.prepare('SELECT * FROM media_files WHERE original_name LIKE ? OR alt LIKE ? ORDER BY id DESC LIMIT 200').all(q,q));
});
app.put('/api/admin/media/:id', requireAuth, (req, res) => {
  const result = db.prepare('UPDATE media_files SET alt=? WHERE id=?').run(String((req.body || {}).alt || '').slice(0,500), Number(req.params.id));
  res.status(result.changes ? 200 : 404).json(result.changes ? { ok: true } : { error: '图片不存在' });
});

/* 草稿与线上文章分开存储，自动保存不会改变公开内容。 */
app.get('/api/admin/drafts', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM editorial_drafts WHERE admin_id=? ORDER BY id DESC LIMIT 200').all(req.admin.id);
  res.json(rows.map(r => ({ ...r, payload: JSON.parse(r.payload) })));
});
function saveDraft(req, res) {
  const b = req.body || {};
  if (!['news','posts'].includes(b.kind) || !b.payload || typeof b.payload !== 'object' || Array.isArray(b.payload)) return res.status(400).json({ error: '无效草稿' });
  const ref = b.ref_id == null ? null : Number(b.ref_id);
  if (ref !== null && (!Number.isSafeInteger(ref) || ref < 1 || !db.prepare(`SELECT id FROM ${b.kind} WHERE id=?`).get(ref))) return res.status(400).json({ error: '原文章不存在' });
  const payload = JSON.stringify(b.payload);
  if (payload.length > 250000) return res.status(400).json({ error: '草稿过长' });
  if (req.params.id) {
    const r = db.prepare("UPDATE editorial_drafts SET payload=?,updated_at=datetime('now','localtime') WHERE id=? AND admin_id=? AND kind=? AND ref_id IS ?")
      .run(payload,Number(req.params.id),req.admin.id,b.kind,ref);
    return res.status(r.changes ? 200 : 404).json(r.changes ? { ok:true,id:Number(req.params.id) } : { error:'草稿不存在或归属不符' });
  }
  const r = db.prepare('INSERT INTO editorial_drafts (kind,ref_id,admin_id,payload) VALUES (?,?,?,?)').run(b.kind,ref,req.admin.id,payload);
  res.json({ ok:true,id:Number(r.lastInsertRowid) });
}
app.post('/api/admin/drafts', requireAuth, saveDraft);
app.put('/api/admin/drafts/:id', requireAuth, saveDraft);
app.delete('/api/admin/drafts/:id', requireAuth, (req,res) => {
  res.json({ ok: db.prepare('DELETE FROM editorial_drafts WHERE id=? AND admin_id=?').run(Number(req.params.id),req.admin.id).changes > 0 });
});
function recordVersion(kind,id,author){
  const row=db.prepare(`SELECT * FROM ${kind} WHERE id=?`).get(id);
  if(row)db.prepare('INSERT INTO content_versions (kind,ref_id,payload,author) VALUES (?,?,?,?)').run(kind,id,JSON.stringify(row),author);
}
app.get('/api/admin/content-versions',requireAuth,(req,res)=>{
  const kind=String(req.query.kind),id=Number(req.query.id);
  if(!['news','posts'].includes(kind))return res.status(400).json({error:'无效内容类型'});
  const current=db.prepare(`SELECT * FROM ${kind} WHERE id=?`).get(id);
  if(!current)return res.status(404).json({error:'内容不存在'});
  const versions=db.prepare('SELECT * FROM content_versions WHERE kind=? AND ref_id=? ORDER BY id DESC LIMIT 100').all(kind,id);
  res.json({current,versions:versions.map(v=>({...v,payload:JSON.parse(v.payload)}))});
});

/* ---------------- 公共工具 ---------------- */
function parseProp(row) {
  if (!row) return row;
  let images = [];
  try { images = JSON.parse(row.images || '[]'); } catch (e) {}
  const agent = row.agent_id
    ? db.prepare('SELECT id,name,category,email,phone,wechat,photo FROM agents WHERE id=?').get(row.agent_id)
    : null;
  let floorplans = [];
  try { floorplans = JSON.parse(row.floorplans || '[]'); } catch (_) {}
  return { ...row, images, floorplans, cover: images[0] || '', agent };
}

/* ---------------- 前台 API ---------------- */
/* 房源列表(带筛选/排序/分页) */
require('./routes/properties')({app,db,requireAuth,requireUser,geocode,parseProp});

/* 资讯 */
app.get('/api/news', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(30, Number(req.query.limit) || 10);
  const total = db.prepare('SELECT COUNT(*) c FROM public_news WHERE visible=1').get().c;
  const items = db.prepare('SELECT id,title,title_en,source_note,source_note_en,excerpt,excerpt_en,image,published_at FROM public_news WHERE visible=1 ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?')
    .all(limit, (page - 1) * limit);
  res.json({ total, page, limit, items });
});
app.get('/api/news/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM public_news WHERE id=? AND visible=1').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: '文章不存在' });
  res.json(row);
});
/* 伙伴 */
app.get('/api/partners', (req, res) => {
  res.json(db.prepare('SELECT id,name,category,logo,url FROM partners WHERE visible=1 ORDER BY sort_order,id').all());
});
/* 服务名录(过期的自动隐藏;推荐的排前面) */
app.get('/api/services', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const where = ["visible=1", "(expires_at='' OR expires_at IS NULL OR expires_at >= ?)"];
  const args = [today];
  if (req.query.category) { where.push('category = ?'); args.push(req.query.category); }
  const rows = db.prepare(`SELECT id,name,category,tagline,description,phone,email,wechat,website,logo,featured
    FROM services WHERE ${where.join(' AND ')} ORDER BY featured DESC, sort_order, id`).all(...args);
  const cats = db.prepare(`SELECT DISTINCT category FROM services
    WHERE visible=1 AND (expires_at='' OR expires_at IS NULL OR expires_at >= ?) ORDER BY category`).all(today).map(r => r.category);
  res.json({ categories: cats, items: rows });
});
/* 地区列表(奥克兰城区,选择房产/学校/服务位置时用) */
app.get('/api/suburbs', (req, res) => {
  res.json(db.prepare('SELECT name FROM suburbs WHERE visible=1 ORDER BY sort_order, name').all().map(r => r.name));
});
/* 视频(首页 home=1 / 资讯页 news=1 / 按分类) */
function parseVideo(r) {
  const cover = r.cover || (r.video_id ? `https://i.ytimg.com/vi/${r.video_id}/hqdefault.jpg` : '');
  return { ...r, cover, embed_url: r.video_id ? `https://www.youtube.com/embed/${r.video_id}` : '' };
}
app.get('/api/videos', (req, res) => {
  const q = req.query;
  const where = ['visible=1']; const args = [];
  if (q.home === '1') where.push('home_play=1');
  if (q.news === '1') where.push('news_play=1');
  if (q.category) { where.push('category = ?'); args.push(q.category); }
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(48, Number(q.limit) || 12);
  const order = 'home_top DESC, sort_order, published_at DESC, id DESC'; // 置顶最前
  const total = db.prepare(`SELECT COUNT(*) c FROM videos WHERE ${where.join(' AND ')}`).get(...args).c;
  const rows = db.prepare(`SELECT * FROM videos WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...args, limit, (page - 1) * limit);
  const cats = db.prepare("SELECT DISTINCT category FROM videos WHERE visible=1 AND category != '' ORDER BY category").all().map(r => r.category);
  res.json({ total, page, limit, categories: cats, items: rows.map(parseVideo) });
});
/* 学校(按地区/类型筛选) */
app.get('/api/schools', (req, res) => {
  const where = ['visible=1']; const args = [];
  if (req.query.suburb) { where.push('suburb = ?'); args.push(req.query.suburb); }
  if (req.query.type) { where.push('type = ?'); args.push(req.query.type); }
  const rows = db.prepare(`SELECT * FROM schools WHERE ${where.join(' AND ')} ORDER BY sort_order, name`).all(...args);
  const types = db.prepare("SELECT DISTINCT type FROM schools WHERE visible=1 AND type != '' ORDER BY type").all().map(r => r.type);
  const subs = db.prepare("SELECT DISTINCT suburb FROM schools WHERE visible=1 AND suburb != '' ORDER BY suburb").all().map(r => r.suburb);
  res.json({ types, suburbs: subs, items: rows });
});
/* 邮件订阅(简单直接:填邮箱即可;防垃圾:格式校验 + 频率限制 + 去重) */
const subHits = new Map(); // ip -> [时间戳]
app.post('/api/subscribe', (req, res) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const hits = (subHits.get(ip) || []).filter(t => now - t < 3600 * 1000);
  if (hits.length >= 5) return res.status(429).json({ error: '操作过于频繁,请稍后再试' });
  hits.push(now); subHits.set(ip, hits);
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) return res.status(400).json({ error: '邮箱格式不正确' });
  const name = String(b.name || '').replace(/[<>'"();=]/g, '').slice(0, 100);
  try {
    db.prepare("INSERT INTO subscribers (email,name) VALUES (?,?) ON CONFLICT(email) DO UPDATE SET status='active'").run(email, name);
  } catch (e) { return res.status(500).json({ error: '订阅失败,请稍后再试' }); }
  res.json({ ok: true });
});

/* 留言 / 咨询 / 订阅 */
/* 从提交体里取出来源归因(前端 sessionStorage 带来的),字段都做长度截断 */
function pickAttr(b) {
  const SRC = ['ad', 'meta', 'google', 'campaign', 'referral', 'site'];
  const src = SRC.includes(b.source) ? b.source : '';
  let utm = '';
  if (b.utm) {
    try {
      const o = typeof b.utm === 'string' ? JSON.parse(b.utm) : b.utm;
      const clean = {};
      for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
        if (o && o[k]) clean[k] = String(o[k]).slice(0, 120);
      }
      if (Object.keys(clean).length) utm = JSON.stringify(clean);
    } catch (e) {}
  }
  return {
    source: src,
    ad_id: b.ad_id ? Number(b.ad_id) || null : null,
    utm,
    landing: String(b.landing || '').slice(0, 300)
  };
}
app.post('/api/enquiries', (req, res) => {
  const b = req.body || {};
  let viewingAt = '', property = null;
  if (b.type === 'viewing') {
    property = db.prepare('SELECT id,agent_id,status FROM properties WHERE id=?').get(Number(b.property_id));
    viewingAt = validateViewing(b,property);
  }
  if (!b.message && b.type !== 'subscribe' && b.type !== 'viewing') return res.status(400).json({ error: '请填写留言内容' });
  if (b.type === 'subscribe' && !b.email) return res.status(400).json({ error: '请填写邮箱' });
  if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email))) return res.status(400).json({ error: '邮箱格式不正确' });
  const vendorId = b.vendor_id ? Number(b.vendor_id) : null;
  const at = pickAttr(b);
  db.prepare('INSERT INTO enquiries (type,name,email,phone,message,agent_id,property_id,vendor_id,source,ad_id,utm,landing,viewing_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(String(b.type || 'general'), String(b.name || '').slice(0, 100), String(b.email || '').slice(0, 200),
      String(b.phone || '').slice(0, 50), String(b.message || '').slice(0, 5000),
      property ? property.agent_id : b.agent_id ? Number(b.agent_id) : null, b.property_id ? Number(b.property_id) : null, vendorId,
      at.source, at.ad_id, at.utm, at.landing, viewingAt);
  /* 线索来自站内广告位 → 计入该广告的转化数 */
  if (at.ad_id) { try { db.prepare('UPDATE ads SET leads = leads + 1 WHERE id=?').run(at.ad_id); } catch (e) {} }
  /* 给入驻方留言 → 站内通知对方 */
  if (vendorId) {
    const v = db.prepare('SELECT user_id,name_zh FROM vendors WHERE id=?').get(vendorId);
    if (v) notify(v.user_id, {
      type: 'enquiry',
      title_zh: '收到一条新留言', title_en: 'New enquiry received',
      body_zh: `${String(b.name || '访客').slice(0, 50)}:${String(b.message || '').slice(0, 120)}`,
      body_en: `${String(b.name || 'Guest').slice(0, 50)}: ${String(b.message || '').slice(0, 120)}`,
      link: 'me.html#enquiries'
    });
  }
  res.json({ ok: true });
});

/* ============================================================
   平台化:板块/分类、入驻方、内容发布与审核
   ============================================================ */

/* ---------- 板块与分类(公开) ---------- */
app.get('/api/sections', (req, res) => {
  const secs = db.prepare('SELECT * FROM sections WHERE visible=1 ORDER BY sort_order,id').all();
  const cats = db.prepare('SELECT * FROM categories WHERE visible=1 ORDER BY sort_order,id').all();
  res.json(secs.map(s => ({ ...s, categories: cats.filter(c => c.section_id === s.id) })));
});

/* ---------- 内容(posts)公共工具 ---------- */
function parsePost(row) {
  if (!row) return row;
  let images = [];
  try { images = JSON.parse(row.images || '[]'); } catch (e) {}
  let vendor = null;
  if (row.vendor_id) {
    const v = db.prepare("SELECT id,name_zh,name_en,logo,verified,status FROM vendors WHERE id=?").get(row.vendor_id);
    if (v && v.status === 'approved') vendor = { id: v.id, name_zh: v.name_zh, name_en: v.name_en, logo: v.logo, verified: v.verified };
  }
  const sec = row.section_id ? db.prepare('SELECT id,slug,name_zh,name_en FROM sections WHERE id=?').get(row.section_id) : null;
  const cat = row.category_id ? db.prepare('SELECT id,name_zh,name_en FROM categories WHERE id=?').get(row.category_id) : null;
  return { ...row, images, cover: images[0] || '', vendor, section: sec, category: cat };
}

/* 联系方式防护:未登录访客不可见,前台显示「登录查看」 */
const CONTACT_POST = ['contact_phone', 'contact_wechat', 'contact_email'];
const CONTACT_VENDOR = ['phone', 'email', 'wechat'];
function lockContacts(obj, viewer, fields) {
  if (viewer || !obj) return obj;
  const out = { ...obj };
  let had = false;
  for (const f of fields) if (out[f]) { had = true; out[f] = ''; }
  if (had) out.contact_locked = 1;
  return out;
}
/* 列表响应精简:正文截断,减小传输体积 */
function slimPost(p) {
  if (!p) return p;
  const cut = s => (s && s.length > 200) ? s.slice(0, 200) + '…' : s;
  const { extra, review_note, ...rest } = p;
  return { ...rest, content_zh: cut(p.content_zh), content_en: cut(p.content_en) };
}

/* ---------- 前台:内容流 ---------- */
app.get('/api/posts', (req, res) => {
  const q = req.query;
  /* 可见性:内容已审核 + 入驻方在驻 + 发布者账号未被封禁(封禁自动下架,解封自动恢复) */
  const where = ["p.status = 'approved'", "(p.vendor_id IS NULL OR v.status = 'approved')", "(p.user_id IS NULL OR u.status = 'active')"];
  const args = [];
  if (q.section) { where.push('s.slug = ?'); args.push(q.section); }
  if (q.category_id) { where.push('p.category_id = ?'); args.push(Number(q.category_id)); }
  if (q.type) { where.push('p.type = ?'); args.push(q.type); }
  if (q.vendor_id) { where.push('p.vendor_id = ?'); args.push(Number(q.vendor_id)); }
  if (q.featured === '1') { where.push('p.featured = 1'); }
  if (q.q) {
    where.push('(p.title_zh LIKE ? OR p.title_en LIKE ? OR p.content_zh LIKE ? OR p.content_en LIKE ? OR p.location LIKE ?)');
    const kw = `%${q.q}%`;
    args.push(kw, kw, kw, kw, kw);
  }
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(48, Number(q.limit) || 12);
  const base = `FROM public_posts p LEFT JOIN vendors v ON v.id = p.vendor_id LEFT JOIN sections s ON s.id = p.section_id LEFT JOIN users u ON u.id = p.user_id WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) c ${base}`).get(...args).c;
  const rows = db.prepare(`SELECT p.* ${base} ORDER BY p.featured DESC, p.published_at DESC, p.id DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, (page - 1) * limit);
  const viewer = currentUser(req);
  res.json({ total, page, limit, items: rows.map(r => lockContacts(slimPost(parsePost(r)), viewer, CONTACT_POST)) });
});
app.get('/api/posts/:id', (req, res) => {
  const row = db.prepare("SELECT * FROM public_posts WHERE id=? AND status='approved'").get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: '内容不存在或未通过审核' });
  if (row.user_id) {
    const owner = db.prepare('SELECT status FROM users WHERE id=?').get(row.user_id);
    if (!owner || owner.status !== 'active') return res.status(404).json({ error: '内容不存在或未通过审核' });
  }
  const p = parsePost(row);
  if (row.vendor_id && !p.vendor) return res.status(404).json({ error: '内容不存在或未通过审核' });
  res.json(lockContacts(p, currentUser(req), CONTACT_POST));
});

/* ---------- 前台:入驻方目录与主页 ---------- */
app.get('/api/vendors', (req, res) => {
  const q = req.query;
  const where = ["v.status = 'approved'", "u.status = 'active'"];
  const args = [];
  if (q.section) { where.push('s.slug = ?'); args.push(q.section); }
  if (q.category_id) { where.push('v.category_id = ?'); args.push(Number(q.category_id)); }
  if (q.featured === '1') { where.push('v.featured = 1'); }
  if (q.role && VENDOR_ROLES.includes(q.role)) { where.push('v.role = ?'); args.push(q.role); }
  if (q.q) {
    where.push('(v.name_zh LIKE ? OR v.name_en LIKE ? OR v.tagline_zh LIKE ? OR v.intro_zh LIKE ?)');
    const kw = `%${q.q}%`;
    args.push(kw, kw, kw, kw);
  }
  const rows = db.prepare(`SELECT v.* FROM vendors v LEFT JOIN sections s ON s.id = v.section_id LEFT JOIN users u ON u.id = v.user_id
    WHERE ${where.join(' AND ')} ORDER BY v.featured DESC, v.verified DESC, v.sort_order, v.id`).all(...args);
  const viewer = currentUser(req);
  res.json(rows.map(r => lockContacts(publicVendor(r), viewer, CONTACT_VENDOR)));
});
app.get('/api/vendors/:id', (req, res) => {
  const v = db.prepare(`SELECT v.* FROM vendors v JOIN users u ON u.id = v.user_id
    WHERE v.id=? AND v.status='approved' AND u.status='active'`).get(Number(req.params.id));
  if (!v) return res.status(404).json({ error: '入驻方不存在' });
  const posts = db.prepare("SELECT * FROM public_posts WHERE vendor_id=? AND status='approved' ORDER BY featured DESC, published_at DESC").all(v.id);
  const viewer = currentUser(req);
  res.json({
    ...lockContacts(publicVendor(v), viewer, CONTACT_VENDOR),
    posts: posts.map(p => lockContacts(slimPost(parsePost(p)), viewer, CONTACT_POST))
  });
});

/* ---------- 广告位(前台取用 / 点击跳转) ---------- */
/* 生效条件:审核通过 + 在投放期内(start_at / end_at 留空表示不限) */
const AD_PLACEMENTS = ['home_side', 'home_flow', 'news_side', 'section_top', 'property_side'];
const AD_LIVE = `status='approved'
  AND (start_at='' OR start_at <= date('now','localtime'))
  AND (end_at='' OR end_at >= date('now','localtime'))`;
function publicAd(a) {
  const { review_note, impressions, clicks, vendor_id, status, ...rest } = a;
  return { ...rest, link: `/go/ad/${a.id}` };   /* 前台一律走跳转链接,便于计点击 */
}
app.get('/api/ads', (req, res) => {
  const p = String(req.query.placement || '');
  if (p && !AD_PLACEMENTS.includes(p)) return res.status(400).json({ error: '无效广告位' });
  const limit = Math.min(Number(req.query.limit) || 6, 20);
  const rows = db.prepare(`SELECT * FROM ads WHERE ${AD_LIVE} ${p ? 'AND placement=?' : ''}
    ORDER BY sort_order, id DESC LIMIT ?`).all(...(p ? [p, limit] : [limit]));
  /* 计曝光:一次请求算一次展示 */
  const bump = db.prepare('UPDATE ads SET impressions = impressions + 1 WHERE id=?');
  for (const r of rows) bump.run(r.id);
  res.json(rows.map(publicAd));
});
/* 点击跳转:计数后 302 到广告主落地页(只放行 http/https,挡住 javascript: 等伪协议) */
app.get('/go/ad/:id', (req, res) => {
  const a = db.prepare(`SELECT id,target_url FROM ads WHERE id=? AND ${AD_LIVE}`).get(Number(req.params.id));
  if (!a) return res.redirect(302, '/');
  db.prepare('UPDATE ads SET clicks = clicks + 1 WHERE id=?').run(a.id);
  let url = /^https?:\/\//i.test(a.target_url) ? a.target_url : '/';
  /* 落地页若指向本站页面,带上 tp_ad —— 这个人之后留言就能归因到这条广告 */
  try {
    const u = new URL(url);
    if (u.host === String(req.headers.host || '')) { u.searchParams.set('tp_ad', String(a.id)); url = u.toString(); }
  } catch (e) {}
  res.redirect(302, url);
});

/* ---------- 主页聚合 ---------- */
app.get('/api/home', (req, res) => {
  const viewer = currentUser(req);
  const secs = db.prepare('SELECT * FROM sections WHERE visible=1 ORDER BY sort_order,id').all();
  const featuredPosts = db.prepare(`SELECT p.* FROM public_posts p LEFT JOIN vendors v ON v.id=p.vendor_id LEFT JOIN users u ON u.id=p.user_id
    WHERE p.status='approved' AND p.featured=1 AND (p.vendor_id IS NULL OR v.status='approved') AND (p.user_id IS NULL OR u.status='active')
    ORDER BY p.published_at DESC, p.id DESC LIMIT 12`).all()
    .map(r => lockContacts(slimPost(parsePost(r)), viewer, CONTACT_POST));
  const vendors = db.prepare(`SELECT v.* FROM vendors v JOIN users u ON u.id=v.user_id
    WHERE v.status='approved' AND u.status='active' AND (v.featured=1 OR v.verified=1)
    ORDER BY v.featured DESC, v.verified DESC, v.sort_order, v.id LIMIT 8`).all()
    .map(r => lockContacts(publicVendor(r), viewer, CONTACT_VENDOR));
  const props = db.prepare(`SELECT * FROM properties WHERE status IN ('在售','在租') AND featured=1 ORDER BY id DESC LIMIT 3`).all().map(parseProp);
  const news = db.prepare('SELECT id,title,title_en,source_note,excerpt,excerpt_en,image,published_at FROM public_news WHERE visible=1 ORDER BY published_at DESC, id DESC LIMIT 3').all();
  res.json({ sections: secs, featured_posts: featuredPosts, vendors, properties: props, news });
});

/* ---------- 全站搜索(双语,跨房源/入驻方/内容/资讯) ---------- */
app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  if (q.length < 1) return res.json({ q, properties: [], vendors: [], posts: [], news: [] });
  const kw = `%${q}%`;
  const viewer = currentUser(req);
  const properties = db.prepare(`SELECT * FROM properties WHERE status != '下架' AND
    (title LIKE ? OR title_en LIKE ? OR address LIKE ? OR suburb LIKE ? OR city LIKE ? OR description LIKE ? OR description_en LIKE ?)
    ORDER BY featured DESC, id DESC LIMIT 8`).all(kw, kw, kw, kw, kw, kw, kw).map(parseProp);
  const vendors = db.prepare(`SELECT v.* FROM vendors v JOIN users u ON u.id=v.user_id
    WHERE v.status='approved' AND u.status='active' AND
    (v.name_zh LIKE ? OR v.name_en LIKE ? OR v.tagline_zh LIKE ? OR v.tagline_en LIKE ? OR v.intro_zh LIKE ? OR v.intro_en LIKE ?)
    ORDER BY v.featured DESC, v.verified DESC, v.id LIMIT 8`).all(kw, kw, kw, kw, kw, kw)
    .map(r => lockContacts(publicVendor(r), viewer, CONTACT_VENDOR));
  const posts = db.prepare(`SELECT p.* FROM public_posts p LEFT JOIN vendors v ON v.id=p.vendor_id LEFT JOIN users u ON u.id=p.user_id
    WHERE p.status='approved' AND (p.vendor_id IS NULL OR v.status='approved') AND (p.user_id IS NULL OR u.status='active') AND
    (p.title_zh LIKE ? OR p.title_en LIKE ? OR p.content_zh LIKE ? OR p.content_en LIKE ? OR p.location LIKE ?)
    ORDER BY p.featured DESC, p.published_at DESC LIMIT 12`).all(kw, kw, kw, kw, kw)
    .map(r => lockContacts(slimPost(parsePost(r)), viewer, CONTACT_POST));
  const news = db.prepare(`SELECT id,title,title_en,excerpt,excerpt_en,image,published_at FROM public_news WHERE visible=1 AND
    (title LIKE ? OR title_en LIKE ? OR excerpt LIKE ? OR content LIKE ? OR content_en LIKE ?)
    ORDER BY published_at DESC LIMIT 6`).all(kw, kw, kw, kw, kw);
  res.json({ q, properties, vendors, posts, news });
});

/* ---------- 入驻申请与自助管理 ---------- */
/* 三类主体:agent 地产经纪 / associate 商家伙伴 / trade 工种服务。
   角色由后台指派,不开放自助申报,避免入驻方自封身份 */
const VENDOR_ROLES = ['agent', 'associate', 'trade'];
const VENDOR_FIELDS = ['name_zh', 'name_en', 'section_id', 'category_id', 'tagline_zh', 'tagline_en',
  'intro_zh', 'intro_en', 'phone', 'email', 'wechat', 'website', 'logo', 'photos', 'apply_message'];
function pickVendorBody(b) {
  const out = {};
  for (const f of VENDOR_FIELDS) {
    if (!(f in b)) continue;
    let v = b[f];
    if (f === 'photos') v = JSON.stringify(Array.isArray(v) ? v : []);
    else if (f === 'section_id' || f === 'category_id') v = v ? Number(v) : null;
    else v = String(v ?? '').slice(0, 5000);
    out[f] = v;
  }
  return out;
}
function validateVendor(data) {
  if (!String(data.name_zh || '').trim()) return '请填写名称';
  if (!db.prepare('SELECT id FROM sections WHERE id=? AND visible=1').get(data.section_id)) return '请选择有效板块';
  if (data.category_id && !db.prepare('SELECT id FROM categories WHERE id=? AND section_id=? AND visible=1').get(data.category_id,data.section_id)) return '分类不属于所选板块';
  if (data.website && (!/^https?:\/\//i.test(data.website) || !require('../public/content').safeUrl(data.website))) return '官网需填写有效的 http 或 https 地址';
  return null;
}
function vendorRevision(vendorId, pendingOnly = false) {
  const r = db.prepare(`SELECT * FROM vendor_revisions WHERE vendor_id=? ${pendingOnly ? "AND status='pending'" : ''} ORDER BY id DESC LIMIT 1`).get(vendorId);
  return r ? { ...r, payload:JSON.parse(r.payload), base_payload:JSON.parse(r.base_payload) } : null;
}
app.post('/api/vendor/apply', requireUser, (req, res) => {
  const data = pickVendorBody(req.body || {});
  if (!data.name_zh) return res.status(400).json({ error: '请填写名称' });
  if (!data.section_id) return res.status(400).json({ error: '请选择所属板块' });
  const invalid = validateVendor(data); if (invalid) return res.status(400).json({ error:invalid });
  const existing = vendorOf(req.user.id);
  if (existing && (existing.status === 'approved' || existing.status === 'pending')) {
    return res.status(400).json({ error: existing.status === 'approved' ? '您已是入驻方' : '申请审核中,请耐心等待' });
  }
  if (existing) { // rejected / suspended → 重新提交
    const keys = Object.keys(data);
    db.prepare(`UPDATE vendors SET ${keys.map(k => `${k}=?`).join(',')}, status='pending', review_note='' WHERE id=?`)
      .run(...keys.map(k => data[k]), existing.id);
    return res.json({ ok: true, id: existing.id, resubmitted: true });
  }
  const keys = Object.keys(data);
  const info = db.prepare(`INSERT INTO vendors (user_id,${keys.join(',')}) VALUES (?,${keys.map(() => '?').join(',')})`)
    .run(req.user.id, ...keys.map(k => data[k]));
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.get('/api/vendor/me', requireUser, (req, res) => {
  const v = vendorOf(req.user.id);
  if (!v) return res.status(404).json({ error: '尚未申请入驻' });
  let photos = [];
  try { photos = JSON.parse(v.photos || '[]'); } catch (e) {}
  res.json({ ...v, photos, revision:vendorRevision(v.id) });
});
app.put('/api/vendor/me', requireUser, (req, res) => {
  const v = vendorOf(req.user.id);
  if (!v) return res.status(404).json({ error: '尚未申请入驻' });
  const data = pickVendorBody(req.body || {});
  delete data.apply_message;
  const keys = Object.keys(data);
  if (!keys.length) return res.status(400).json({ error: '没有可更新的字段' });
  if (v.status === 'suspended') return res.status(403).json({ error:'入驻资格暂停期间不能修改主页，请联系管理员' });
  const previous = vendorRevision(v.id,true);
  const merged = { ...v, ...(previous ? previous.payload : {}), ...data };
  const invalid = validateVendor(merged); if (invalid) return res.status(400).json({ error:invalid });
  if (v.status === 'approved') {
    const changes={}, base={};
    for (const field of VENDOR_FIELDS.filter(f=>f!=='apply_message')) {
      if (merged[field] !== v[field]) { changes[field]=merged[field]; base[field]=v[field]; }
    }
    if (!Object.keys(changes).length) {
      db.prepare("UPDATE vendor_revisions SET status='withdrawn' WHERE vendor_id=? AND status='pending'").run(v.id);
      return res.json({ ok:true,review:false,unchanged:true });
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare("UPDATE vendor_revisions SET status='superseded' WHERE vendor_id=? AND status='pending'").run(v.id);
      const result=db.prepare('INSERT INTO vendor_revisions (vendor_id,payload,base_payload) VALUES (?,?,?)').run(v.id,JSON.stringify(changes),JSON.stringify(base));
      db.exec('COMMIT');
      return res.json({ ok:true,review:true,revision_id:Number(result.lastInsertRowid),live_preserved:true });
    } catch(e) { db.exec('ROLLBACK'); throw e; }
  }
  /* 未上线的申请仍直接修改待审资料。 */
  db.prepare(`UPDATE vendors SET ${keys.map(k => `${k}=?`).join(',')}, status='pending' WHERE id=?`)
    .run(...keys.map(k => data[k]), v.id);
  res.json({ ok: true, review: true });
});

/* ---------- 我的发布(用户/入驻方) ---------- */
const POST_FIELDS = ['section_id', 'category_id', 'type', 'title_zh', 'title_en', 'content_zh', 'content_en',
  'content_format', 'images', 'video_url', 'price_label', 'price_value', 'contact_name', 'contact_phone', 'contact_wechat',
  'contact_email', 'location', 'event_time'];
function pickPostBody(b) {
  const out = {};
  for (const f of POST_FIELDS) {
    if (!(f in b)) continue;
    let v = b[f];
    if (f === 'images') v = JSON.stringify(Array.isArray(v) ? v : []);
    else if (['section_id', 'category_id', 'price_value'].includes(f)) v = (v === '' || v == null) ? null : Number(v);
    else v = String(v ?? '').slice(0, 20000);
    out[f] = v;
  }
  return out;
}
const USER_POST_TYPES = ['market'];                                    // 普通用户:二手闲置
const VENDOR_POST_TYPES = ['market', 'service', 'update', 'event', 'job']; // 入驻方:服务/动态/活动/招聘
function allowedTypes(userId) {
  const v = vendorOf(userId);
  return (v && v.status === 'approved') ? VENDOR_POST_TYPES : USER_POST_TYPES;
}
function validatePost(data, userId) {
  if (!data.title_zh && !data.title_en) return '请填写标题';
  if (!allowedTypes(userId).includes(data.type)) return '当前身份不能发布该类型内容';
  const section = db.prepare('SELECT * FROM sections WHERE id=? AND visible=1').get(data.section_id);
  if (!section) return '请选择有效板块';
  if (section.slug === 'news' || (data.type === 'market' && section.slug !== 'market')) return '二手闲置只能发布到集市，资讯由官方发布';
  if (data.category_id && !db.prepare('SELECT id FROM categories WHERE id=? AND section_id=? AND visible=1').get(data.category_id,data.section_id)) return '分类不属于所选板块';
  return null;
}
function postRevision(id,pendingOnly=false){
  const r=db.prepare(`SELECT * FROM post_revisions WHERE post_id=? ${pendingOnly?"AND status='pending'":''} ORDER BY id DESC LIMIT 1`).get(id);
  return r?{...r,payload:JSON.parse(r.payload),base_payload:JSON.parse(r.base_payload)}:null;
}
app.get('/api/my/posts', requireUser, (req, res) => {
  const rows = db.prepare('SELECT * FROM posts WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  res.json(rows.map(r=>({...parsePost(r),revision:postRevision(r.id)})));
});
app.post('/api/my/posts', requireUser, (req, res) => {
  const data = pickPostBody(req.body || {});
  if (!data.title_zh && !data.title_en) return res.status(400).json({ error: '请填写标题' });
  if (!data.section_id || !db.prepare('SELECT id FROM sections WHERE id=? AND visible=1').get(data.section_id)) {
    return res.status(400).json({ error: '请选择板块' });
  }
  data.type = data.type || 'market';
  const invalid = validatePost(data, req.user.id);
  if (invalid) return res.status(400).json({ error: invalid });
  if (!allowedTypes(req.user.id).includes(data.type)) {
    return res.status(403).json({ error: '当前身份不能发布该类型内容(可申请成为入驻方)' });
  }
  const v = vendorOf(req.user.id);
  const vendorId = (v && v.status === 'approved' && data.type !== 'market') ? v.id : null;
  const keys = Object.keys(data);
  const info = db.prepare(`INSERT INTO posts (user_id,vendor_id,${keys.join(',')}) VALUES (?,?,${keys.map(() => '?').join(',')})`)
    .run(req.user.id, vendorId, ...keys.map(k => data[k]));
  res.json({ ok: true, id: info.lastInsertRowid, status: 'pending' });
});
app.put('/api/my/posts/:id', requireUser, (req, res) => {
  const row = db.prepare('SELECT * FROM posts WHERE id=? AND user_id=?').get(Number(req.params.id), req.user.id);
  if (!row) return res.status(404).json({ error: '内容不存在' });
  const data = pickPostBody(req.body || {});
  delete data.type; // 类型不可改
  const prior=postRevision(row.id,true);
  const merged={...row,...(prior?prior.payload:{}),...data};
  const invalid = validatePost(merged, req.user.id);
  if (invalid) return res.status(400).json({ error: invalid });
  const keys = Object.keys(data);
  if (!keys.length) return res.status(400).json({ error: '没有可更新的字段' });
  if(row.status==='approved'){
    const changes={},base={};
    for(const field of POST_FIELDS.filter(f=>f!=='type'))if(merged[field]!==row[field]){changes[field]=merged[field];base[field]=row[field];}
    db.exec('BEGIN IMMEDIATE');
    try{
      db.prepare("UPDATE post_revisions SET status='superseded' WHERE post_id=? AND status='pending'").run(row.id);
      let id=null;
      if(Object.keys(changes).length)id=Number(db.prepare('INSERT INTO post_revisions (post_id,payload,base_payload) VALUES (?,?,?)').run(row.id,JSON.stringify(changes),JSON.stringify(base)).lastInsertRowid);
      db.exec('COMMIT');return res.json({ok:true,status:'approved',live_preserved:true,unchanged:!id,revision_id:id});
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  /* 编辑后重新进入审核 */
  db.prepare(`UPDATE posts SET ${keys.map(k => `${k}=?`).join(',')}, status='pending' WHERE id=?`)
    .run(...keys.map(k => data[k]), row.id);
  res.json({ ok: true, status: 'pending' });
});
app.delete('/api/my/posts/:id', requireUser, (req, res) => {
  const owned=db.prepare('SELECT id FROM posts WHERE id=? AND user_id=?').get(Number(req.params.id),req.user.id);
  if(owned){db.prepare('DELETE FROM post_revisions WHERE post_id=?').run(owned.id);db.prepare("DELETE FROM content_versions WHERE kind='posts' AND ref_id=?").run(owned.id);}
  const info = db.prepare('DELETE FROM posts WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id);
  res.json({ ok: info.changes > 0 });
});
/* 入驻方查看收到的留言 */
app.get('/api/my/enquiries', requireUser, (req, res) => {
  const v = vendorOf(req.user.id);
  if (!v) return res.json([]);
  res.json(db.prepare('SELECT id,name,email,phone,message,source,utm,created_at FROM enquiries WHERE vendor_id=? ORDER BY id DESC LIMIT 100').all(v.id));
});

/* ---------- 我的广告(入驻方自助投放,提交后进入待审) ---------- */
const AD_FIELDS = ['title_zh', 'title_en', 'image', 'target_url', 'placement', 'start_at', 'end_at'];
function pickAdBody(b) {
  const out = {};
  for (const f of AD_FIELDS) {
    if (!(f in b)) continue;
    out[f] = String(b[f] ?? '').slice(0, 1000);
  }
  return out;
}
function checkAd(d) {
  if (d.placement && !AD_PLACEMENTS.includes(d.placement)) return '无效广告位';
  if (d.target_url && !/^https?:\/\//i.test(d.target_url)) return '落地页需以 http:// 或 https:// 开头';
  for (const f of ['start_at', 'end_at']) {
    if (d[f] && !/^\d{4}-\d{2}-\d{2}$/.test(d[f])) return '日期格式应为 YYYY-MM-DD';
  }
  if (d.start_at && d.end_at && d.start_at > d.end_at) return '下线日期不能早于上线日期';
  return null;
}
app.get('/api/my/ads', requireUser, (req, res) => {
  const v = vendorOf(req.user.id);
  if (!v) return res.json([]);
  res.json(db.prepare('SELECT * FROM ads WHERE vendor_id=? ORDER BY id DESC').all(v.id));
});
app.post('/api/my/ads', requireUser, (req, res) => {
  const v = vendorOf(req.user.id);
  if (!v || v.status !== 'approved') return res.status(403).json({ error: '仅已通过审核的入驻方可投放广告' });
  const d = pickAdBody(req.body || {});
  if (!d.image) return res.status(400).json({ error: '请上传广告图' });
  if (!d.target_url) return res.status(400).json({ error: '请填写落地页链接' });
  const err = checkAd(d); if (err) return res.status(400).json({ error: err });
  const cols = Object.keys(d);
  const info = db.prepare(`INSERT INTO ads (vendor_id,${cols.join(',')}) VALUES (?${',?'.repeat(cols.length)})`)
    .run(v.id, ...cols.map(k => d[k]));
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});
app.put('/api/my/ads/:id', requireUser, (req, res) => {
  const v = vendorOf(req.user.id);
  const old = v && db.prepare('SELECT * FROM ads WHERE id=? AND vendor_id=?').get(Number(req.params.id), v.id);
  if (!old) return res.status(404).json({ error: '广告不存在' });
  const d = pickAdBody(req.body || {});
  const err = checkAd(d); if (err) return res.status(400).json({ error: err });
  const cols = Object.keys(d);
  if (!cols.length) return res.status(400).json({ error: '没有可更新的字段' });
  /* 改过的广告重新进入待审(与内容审核流一致) */
  db.prepare(`UPDATE ads SET ${cols.map(k => `${k}=?`).join(',')}, status='pending', review_note='' WHERE id=?`)
    .run(...cols.map(k => d[k]), old.id);
  res.json({ ok: true });
});
app.delete('/api/my/ads/:id', requireUser, (req, res) => {
  const v = vendorOf(req.user.id);
  if (!v) return res.status(404).json({ error: '广告不存在' });
  const info = db.prepare('DELETE FROM ads WHERE id=? AND vendor_id=?').run(Number(req.params.id), v.id);
  res.json({ ok: info.changes > 0 });
});

/* ---------------- 管理后台 API(需登录) ---------------- */
require('./routes/admin-content')({app,db,requireAuth,parseProp,parseVideo,ensureSuburb,recordVersion});

/* ---------- 订阅邮箱管理 ---------- */
app.get('/api/admin/subscribers', requireAuth, (req, res) => {
  const where = []; const args = [];
  if (req.query.q) { where.push('(email LIKE ? OR name LIKE ?)'); const kw = `%${String(req.query.q).slice(0, 80)}%`; args.push(kw, kw); }
  if (req.query.status) { where.push('status = ?'); args.push(req.query.status); }
  res.json(db.prepare(`SELECT * FROM subscribers ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 2000`).all(...args));
});
app.delete('/api/admin/subscribers/:id', requireAuth, (req, res) => {
  res.json({ ok: db.prepare('DELETE FROM subscribers WHERE id=?').run(Number(req.params.id)).changes > 0 });
});

/* ---------- 数据导出 / 备份 ---------- */
const EXPORT_TABLES = ['properties', 'agents', 'news', 'partners', 'services', 'enquiries', 'users', 'sections',
  'categories', 'vendors', 'posts', 'videos', 'schools', 'subscribers', 'suburbs', 'admin_logs'];
const HIDE_COLS = ['password_hash', 'salt']; // 导出时不含密码字段
function toCSV(rows) {
  if (!rows.length) return '﻿';
  const cols = Object.keys(rows[0]).filter(c => !HIDE_COLS.includes(c));
  const cell = v => { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  return '﻿' + cols.join(',') + '\n' + rows.map(r => cols.map(c => cell(r[c])).join(',')).join('\n');
}
app.get('/api/admin/export/csv/:table', requireAuth, (req, res) => {
  const t = req.params.table;
  if (!EXPORT_TABLES.includes(t)) return res.status(400).json({ error: '不支持导出该表' });
  const rows = db.prepare(`SELECT * FROM ${t} ORDER BY id`).all();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="thepoint-${t}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(toCSV(rows));
  alog(req, 'export_csv', 'table', null, t, `导出 ${rows.length} 条`);
});
app.get('/api/admin/export/db', requireAuth, (req, res) => {
  const tmp = path.join(DATA_DIR, `.backup-${Date.now()}.sqlite`);
  try {
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`); // 完整一致性备份(含 WAL 中未落盘数据)
    res.download(tmp, `thepoint-backup-${new Date().toISOString().slice(0, 10)}.sqlite`, () => { try { fs.unlinkSync(tmp); } catch (e) {} });
    alog(req, 'export_db', 'db', null, 'data.sqlite', '下载完整数据库备份');
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) {}
    res.status(500).json({ error: '备份失败: ' + e.message });
  }
});

/* 留言管理 */
app.get('/api/admin/enquiries', requireAuth, (req, res) => {
  const where=[], args=[];
  if(req.query.status){where.push('e.lead_status=?');args.push(String(req.query.status));}
  if(req.query.q){where.push('(e.name LIKE ? OR e.email LIKE ? OR e.phone LIKE ? OR e.message LIKE ? OR p.title LIKE ?)');const q='%'+String(req.query.q).slice(0,100)+'%';args.push(q,q,q,q,q);}
  const rows = db.prepare(`
    SELECT e.*, a.name AS agent_name, p.title AS property_title, v.name_zh AS vendor_name, adm.username AS assignee_name
    FROM enquiries e
    LEFT JOIN agents a ON a.id = e.agent_id
    LEFT JOIN properties p ON p.id = e.property_id
    LEFT JOIN vendors v ON v.id = e.vendor_id
    LEFT JOIN admins adm ON adm.id=e.assignee_id
    ${where.length ? 'WHERE '+where.join(' AND ') : ''}
    ORDER BY e.id DESC`).all(...args);
  res.json(rows);
});
app.get('/api/admin/enquiry-owners', requireAuth, (req,res)=>{
  res.json(db.prepare("SELECT id,username FROM admins WHERE status='active' ORDER BY id").all());
});
app.get('/api/admin/enquiries/:id/notes', requireAuth, (req,res)=>{
  if(!db.prepare('SELECT id FROM enquiries WHERE id=?').get(Number(req.params.id)))return res.status(404).json({error:'留言不存在'});
  res.json(db.prepare('SELECT * FROM enquiry_notes WHERE enquiry_id=? ORDER BY id DESC').all(Number(req.params.id)));
});
app.put('/api/admin/enquiries/:id/follow-up', requireAuth, (req,res)=>{
  const b=req.body || {}, id=Number(req.params.id);
  const labels={new:'待联系',contacted:'已联系',scheduled:'已预约',closed:'已结束'};
  if(!Object.hasOwn(labels,b.lead_status))return res.status(400).json({error:'无效跟进状态'});
  if(!Number.isSafeInteger(b.version) || b.version<0)return res.status(400).json({error:'缺少跟进版本，请刷新后重试'});
  const assignee=b.assignee_id==null || b.assignee_id==='' ? null:Number(b.assignee_id);
  const owner=assignee==null?null:db.prepare('SELECT username FROM admins WHERE id=?').get(assignee);
  if(assignee!=null&&!owner)return res.status(400).json({error:'负责人不存在'});
  const note=String(b.note || '').trim();
  if(note.length>2000)return res.status(400).json({error:'跟进备注最多 2000 字'});
  db.exec('BEGIN IMMEDIATE');
  try {
    const old=db.prepare('SELECT * FROM enquiries WHERE id=?').get(id);
    if(!old){db.exec('ROLLBACK');return res.status(404).json({error:'留言不存在'});}
    const result=db.prepare("UPDATE enquiries SET lead_status=?,assignee_id=?,followup_version=followup_version+1,followup_updated_at=datetime('now','localtime'),is_read=1 WHERE id=? AND followup_version=?")
      .run(b.lead_status,assignee,id,b.version);
    if(!result.changes){db.exec('ROLLBACK');return res.status(409).json({error:'此留言已被其他操作更新，请刷新后再保存，当前备注未写入'});}
    const detail=`${labels[old.lead_status] || old.lead_status} → ${labels[b.lead_status]}；负责人：${owner?owner.username:'未分配'}`;
    db.prepare('INSERT INTO enquiry_notes (enquiry_id,author,body,detail) VALUES (?,?,?,?)').run(id,req.admin.username,note,detail);
    alog(req,'enquiry_followup','enquiry',id,old.name,detail);
    db.exec('COMMIT');res.json({ok:true,version:b.version+1});
  }catch(e){db.exec('ROLLBACK');throw e;}
});
app.put('/api/admin/enquiries/:id/read', requireAuth, (req, res) => {
  db.prepare('UPDATE enquiries SET is_read=1 WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});
app.delete('/api/admin/enquiries/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM enquiry_notes WHERE enquiry_id=?').run(Number(req.params.id));
  db.prepare('DELETE FROM enquiries WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});
/* ---------- 用户管理(搜索筛选 / 封禁踢下线 / 重置密码 / 详情 / 级联注销) ---------- */
app.get('/api/admin/users', requireAuth, (req, res) => {
  const q = req.query;
  const where = []; const args = [];
  if (q.q) {
    where.push('(u.email LIKE ? OR u.name LIKE ? OR u.phone LIKE ?)');
    const kw = `%${String(q.q).slice(0, 80)}%`;
    args.push(kw, kw, kw);
  }
  if (q.status) { where.push('u.status = ?'); args.push(q.status); }
  if (q.from) { where.push('u.created_at >= ?'); args.push(String(q.from) + ' 00:00:00'); }
  if (q.to) { where.push('u.created_at <= ?'); args.push(String(q.to) + ' 23:59:59'); }
  const order = q.sort === 'old' ? 'u.id ASC' : 'u.id DESC';
  const rows = db.prepare(`
    SELECT u.id,u.email,u.name,u.phone,u.wechat,u.status,u.created_at,
           v.id AS vendor_id, v.status AS vendor_status, v.name_zh AS vendor_name,
           (SELECT COUNT(*) FROM posts WHERE user_id=u.id) AS post_count,
           (SELECT COUNT(*) FROM posts WHERE user_id=u.id AND status='approved') AS live_count
    FROM users u LEFT JOIN vendors v ON v.user_id = u.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${order} LIMIT 500`).all(...args);
  res.json(rows);
});
/* 用户详情:资料 + 入驻状态 + 全部发布记录 */
app.get('/api/admin/users/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT id,email,name,phone,wechat,status,created_at FROM users WHERE id=?').get(id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const v = db.prepare('SELECT * FROM vendors WHERE user_id=?').get(id) || null;
  const posts = db.prepare('SELECT * FROM posts WHERE user_id=? ORDER BY id DESC').all(id).map(parsePost);
  const enquiries = v ? db.prepare('SELECT COUNT(*) c FROM enquiries WHERE vendor_id=?').get(v.id).c : 0;
  const sessionsN = db.prepare("SELECT COUNT(*) c FROM sessions WHERE kind='user' AND ref_id=? AND expires > ?").get(id, Date.now()).c;
  res.json({ ...u, vendor: v, posts, enquiry_count: enquiries, active_sessions: sessionsN });
});
/* 封禁 / 解封:封禁立即踢下线,公开内容自动下架(可见性联动),解封自动恢复 */
app.put('/api/admin/users/:id', requireAuth, (req, res) => {
  const status = req.body && req.body.status;
  if (!['active', 'banned'].includes(status)) return res.status(400).json({ error: '无效状态' });
  const id = Number(req.params.id);
  const u = db.prepare('SELECT email,status FROM users WHERE id=?').get(id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  db.prepare('UPDATE users SET status=? WHERE id=?').run(status, id);
  if (status === 'banned') {
    kickUser(id); // 立即踢下线
    alog(req, 'ban', 'user', id, u.email, '封禁账号:已踢下线,其公开内容与入驻主页自动下架');
  } else {
    alog(req, 'unban', 'user', id, u.email, '解封账号:公开内容与主页自动恢复');
  }
  res.json({ ok: true });
});
/* 重置密码:不传 new_password 则自动生成并返回(仅显示一次) */
app.put('/api/admin/users/:id/reset-password', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT email FROM users WHERE id=?').get(id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  let pw = String((req.body && req.body.new_password) || '').trim();
  if (pw && pw.length < 6) return res.status(400).json({ error: '新密码至少 6 位' });
  if (!pw) pw = crypto.randomBytes(5).toString('base64url').slice(0, 8) + '@1';
  const { salt, hash } = hashPassword(pw);
  db.prepare('UPDATE users SET password_hash=?, salt=? WHERE id=?').run(hash, salt, id);
  db.prepare('UPDATE password_resets SET used=1 WHERE user_id=?').run(id);
  kickUser(id); // 重置后旧会话全部失效
  alog(req, 'reset_password', 'user', id, u.email, '重置密码并踢下线');
  res.json({ ok: true, password: pw });
});
/* 一键下架某用户全部内容 */
app.post('/api/admin/users/:id/offline-posts', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT email FROM users WHERE id=?').get(id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const info = db.prepare("UPDATE posts SET status='offline' WHERE user_id=? AND status IN ('approved','pending')").run(id);
  alog(req, 'offline_posts', 'user', id, u.email, `一键下架其全部内容,共 ${info.changes} 条`);
  res.json({ ok: true, count: info.changes });
});
/* 注销账号:级联删除发布 / 入驻主页 / 会话 / 通知 */
app.delete('/api/admin/users/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT email FROM users WHERE id=?').get(id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  db.prepare('DELETE FROM post_revisions WHERE post_id IN (SELECT id FROM posts WHERE user_id=?)').run(id);
  db.prepare("DELETE FROM content_versions WHERE kind='posts' AND ref_id IN (SELECT id FROM posts WHERE user_id=?)").run(id);
  const nPosts = db.prepare('DELETE FROM posts WHERE user_id=?').run(id).changes;
  db.prepare('DELETE FROM vendor_revisions WHERE vendor_id IN (SELECT id FROM vendors WHERE user_id=?)').run(id);
  const nVendor = db.prepare('DELETE FROM vendors WHERE user_id=?').run(id).changes;
  db.prepare('DELETE FROM notifications WHERE user_id=?').run(id);
  db.prepare('DELETE FROM property_favorites WHERE user_id=?').run(id);
  kickUser(id);
  const info = db.prepare('DELETE FROM users WHERE id=?').run(id);
  alog(req, 'delete_user', 'user', id, u.email, `注销账号:删除发布 ${nPosts} 条、入驻主页 ${nVendor} 个`);
  res.json({ ok: info.changes > 0, posts_deleted: nPosts, vendor_deleted: nVendor });
});

/* ---------- 入驻审核与管理 ---------- */
app.get('/api/admin/vendors', requireAuth, (req, res) => {
  const where = []; const args = [];
  if (req.query.status === 'pending') where.push("(v.status='pending' OR EXISTS (SELECT 1 FROM vendor_revisions r WHERE r.vendor_id=v.id AND r.status='pending'))");
  else if (req.query.status) { where.push('v.status = ?'); args.push(req.query.status); }
  const rows = db.prepare(`
    SELECT v.*, u.email AS user_email, u.name AS user_name,
           s.name_zh AS section_name, c.name_zh AS category_name
    FROM vendors v
    LEFT JOIN users u ON u.id = v.user_id
    LEFT JOIN sections s ON s.id = v.section_id
    LEFT JOIN categories c ON c.id = v.category_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY (v.status='pending' OR EXISTS (SELECT 1 FROM vendor_revisions r WHERE r.vendor_id=v.id AND r.status='pending')) DESC, v.id DESC`).all(...args);
  res.json(rows.map(r => { let ph = []; try { ph = JSON.parse(r.photos || '[]'); } catch (e) {} return { ...r, photos: ph, pending_revision:vendorRevision(r.id,true) }; }));
});
app.put('/api/admin/vendor-revisions/:id/review', requireAuth, (req,res)=>{
  const b=req.body || {}, note=String(b.note || '').trim();
  if(!['approve','reject'].includes(b.action))return res.status(400).json({error:'无效审核操作'});
  if(note.length>1000 || (b.action==='reject'&&!note))return res.status(400).json({error:'驳回时请填写原因，最多 1000 字'});
  db.exec('BEGIN IMMEDIATE');
  let revision,vendor;
  try {
    revision=db.prepare('SELECT * FROM vendor_revisions WHERE id=?').get(Number(req.params.id));
    if(!revision){db.exec('ROLLBACK');return res.status(404).json({error:'修改版本不存在'});}
    if(revision.status!=='pending'){db.exec('ROLLBACK');return res.status(409).json({error:'该修改已处理或已被新版本替代，请刷新'});}
    vendor=db.prepare('SELECT * FROM vendors WHERE id=?').get(revision.vendor_id);
    if(!vendor){db.exec('ROLLBACK');return res.status(404).json({error:'入驻方不存在'});}
    if(b.action==='approve'){
      const owner=db.prepare('SELECT status FROM users WHERE id=?').get(vendor.user_id);
      if(vendor.status!=='approved'||!owner||owner.status!=='active'){db.exec('ROLLBACK');return res.status(409).json({error:'入驻方或账号不在正常状态，不能批准资料更新'});}
      const changes=JSON.parse(revision.payload),base=JSON.parse(revision.base_payload),keys=Object.keys(changes);
      if(keys.some(k=>vendor[k]!==base[k])){db.exec('ROLLBACK');return res.status(409).json({error:'待审字段的线上资料已被管理员修改，请驳回并让商家重新提交，避免覆盖新资料'});}
      const invalid=validateVendor({...vendor,...changes});
      if(invalid){db.exec('ROLLBACK');return res.status(400).json({error:invalid});}
      db.prepare(`UPDATE vendors SET ${keys.map(k=>`${k}=?`).join(',')} WHERE id=?`).run(...keys.map(k=>changes[k]),vendor.id);
    }
    db.prepare("UPDATE vendor_revisions SET status=?,review_note=?,reviewed_by=?,reviewed_at=datetime('now','localtime') WHERE id=?")
      .run(b.action==='approve'?'approved':'rejected',note,req.admin.username,revision.id);
    alog(req,'vendor_revision_'+b.action,'vendor',vendor.id,vendor.name_zh,`修改版本 #${revision.id}${note?'；'+note:''}`);
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  notify(vendor.user_id,{type:'vendor_review',title_zh:b.action==='approve'?'主页资料更新已通过':'主页资料修改未通过',title_en:b.action==='approve'?'Profile update approved':'Profile update declined',body_zh:b.action==='approve'?'新资料已上线，原有入驻资格保持有效。':`原因：${note}。线上原主页继续展示，可修改后重新提交。`,body_en:b.action==='approve'?'Your updated profile is now live.':`Reason: ${note}. Your existing profile remains live. You can revise and resubmit.`,link:'me.html'});
  res.json({ok:true});
});
app.put('/api/admin/vendors/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const allowed = ['status', 'role', 'verified', 'featured', 'review_note', 'sort_order',
    'name_zh', 'name_en', 'section_id', 'category_id', 'tagline_zh', 'tagline_en',
    'intro_zh', 'intro_en', 'phone', 'email', 'wechat', 'website', 'logo', 'photos'];
  const data = {};
  for (const f of allowed) {
    if (!(f in b)) continue;
    let v = b[f];
    if (f === 'photos') v = JSON.stringify(Array.isArray(v) ? v : []);
    else if (['verified', 'featured', 'sort_order', 'section_id', 'category_id'].includes(f)) v = (v === '' || v == null) ? null : Number(v);
    else v = String(v ?? '');
    data[f] = v;
  }
  if (data.status && !['pending', 'approved', 'rejected', 'suspended'].includes(data.status)) {
    return res.status(400).json({ error: '无效状态' });
  }
  if (data.role && !VENDOR_ROLES.includes(data.role)) return res.status(400).json({ error: '无效角色' });
  const keys = Object.keys(data);
  if (!keys.length) return res.status(400).json({ error: '没有可更新的字段' });
  const old = db.prepare('SELECT * FROM vendors WHERE id=?').get(Number(req.params.id));
  if (!old) return res.status(404).json({ error: '入驻方不存在' });
  if (data.status === 'approved') {
    db.prepare("UPDATE vendors SET approved_at = CASE WHEN approved_at='' THEN datetime('now','localtime') ELSE approved_at END WHERE id=?")
      .run(Number(req.params.id));
  }
  const info = db.prepare(`UPDATE vendors SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`)
    .run(...keys.map(k => data[k]), Number(req.params.id));
  /* 审核结果站内通知 */
  if (data.status && data.status !== old.status) {
    const N = {
      approved: ['入驻审核通过', 'Provider application approved', '恭喜!您的入驻申请已通过,主页已上线,可在个人中心发布服务、动态与活动。', 'Congratulations — your provider profile is now live. Publish services, updates and events from My Point.', 'me.html'],
      rejected: ['入驻申请未通过', 'Provider application declined', (data.review_note ? '原因:' + data.review_note + '。' : '') + '您可修改资料后重新提交。', (data.review_note ? 'Reason: ' + data.review_note + '. ' : '') + 'You may revise and reapply.', 'join.html'],
      suspended: ['入驻资格已暂停', 'Provider profile suspended', '您的主页与发布已暂停展示,如有疑问请联系一点。', 'Your profile and posts are temporarily hidden. Contact us for details.', 'me.html']
    }[data.status];
    if (N) notify(old.user_id, { type: 'vendor_review', title_zh: N[0], title_en: N[1], body_zh: N[2], body_en: N[3], link: N[4] });
  }
  if (data.verified === 1 && !old.verified) {
    notify(old.user_id, {
      type: 'vendor_review', title_zh: '获得「一点认证」', title_en: 'You are now Verified',
      body_zh: '官方已为您授予「✓ 一点认证」标识,它将展示在您的主页与所有发布上。',
      body_en: 'The Point has granted you the Verified badge, shown on your profile and posts.',
      link: 'me.html'
    });
  }
  /* 敏感操作留痕 */
  if (data.status && data.status !== old.status) {
    const A = { approved: 'vendor_approve', rejected: 'vendor_reject', suspended: 'vendor_suspend', pending: 'vendor_pending' };
    alog(req, A[data.status] || 'vendor_status', 'vendor', old.id, old.name_zh, data.review_note ? `原因:${data.review_note}` : '');
  }
  if ('verified' in data && data.verified !== old.verified) alog(req, data.verified ? 'vendor_verify' : 'vendor_unverify', 'vendor', old.id, old.name_zh, '');
  if ('featured' in data && data.featured !== old.featured) alog(req, data.featured ? 'vendor_feature' : 'vendor_unfeature', 'vendor', old.id, old.name_zh, '');
  res.json({ ok: info.changes > 0 });
});
app.delete('/api/admin/vendors/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT name_zh FROM vendors WHERE id=?').get(id);
  db.prepare('DELETE FROM vendor_revisions WHERE vendor_id=?').run(id);
  db.prepare('DELETE FROM post_revisions WHERE post_id IN (SELECT id FROM posts WHERE vendor_id=?)').run(id);
  db.prepare("DELETE FROM content_versions WHERE kind='posts' AND ref_id IN (SELECT id FROM posts WHERE vendor_id=?)").run(id);
  const n = db.prepare('DELETE FROM posts WHERE vendor_id=?').run(id).changes;
  const info = db.prepare('DELETE FROM vendors WHERE id=?').run(id);
  if (old) alog(req, 'delete_vendor', 'vendor', id, old.name_zh, `删除入驻方及其发布 ${n} 条`);
  res.json({ ok: info.changes > 0 });
});

/* ---------- 广告位审核与投放管理 ---------- */
app.get('/api/admin/ads', requireAuth, (req, res) => {
  const where = []; const args = [];
  if (req.query.status) { where.push('a.status = ?'); args.push(req.query.status); }
  if (req.query.placement) { where.push('a.placement = ?'); args.push(req.query.placement); }
  res.json(db.prepare(`
    SELECT a.*, v.name_zh AS vendor_name, v.role AS vendor_role
    FROM ads a LEFT JOIN vendors v ON v.id = a.vendor_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY a.status='pending' DESC, a.id DESC`).all(...args));
});
/* 官方直投:可不挂广告主,直接生效 */
app.post('/api/admin/ads', requireAuth, (req, res) => {
  const b = req.body || {};
  const d = pickAdBody(b);
  if (!d.image) return res.status(400).json({ error: '请上传广告图' });
  if (!d.target_url) return res.status(400).json({ error: '请填写落地页链接' });
  const err = checkAd(d); if (err) return res.status(400).json({ error: err });
  /* 官方直投默认立即生效,也可在表单里指定其它状态 */
  d.status = ['pending', 'approved', 'rejected', 'paused'].includes(b.status) ? b.status : 'approved';
  if ('sort_order' in b) d.sort_order = Number(b.sort_order) || 0;
  const vid = b.vendor_id ? Number(b.vendor_id) : null;
  const cols = Object.keys(d);
  const info = db.prepare(`INSERT INTO ads (vendor_id,${cols.join(',')}) VALUES (?${',?'.repeat(cols.length)})`)
    .run(vid, ...cols.map(k => d[k]));
  alog(req, 'ad_create', 'ad', Number(info.lastInsertRowid), d.title_zh || d.target_url, '官方直投');
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});
app.put('/api/admin/ads/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const old = db.prepare('SELECT * FROM ads WHERE id=?').get(Number(req.params.id));
  if (!old) return res.status(404).json({ error: '广告不存在' });
  const d = pickAdBody(b);
  const err = checkAd(d); if (err) return res.status(400).json({ error: err });
  if ('status' in b) {
    if (!['pending', 'approved', 'rejected', 'paused'].includes(b.status)) return res.status(400).json({ error: '无效状态' });
    d.status = b.status;
  }
  if ('review_note' in b) d.review_note = String(b.review_note || '').slice(0, 500);
  if ('sort_order' in b) d.sort_order = Number(b.sort_order) || 0;
  const cols = Object.keys(d);
  if (!cols.length) return res.status(400).json({ error: '没有可更新的字段' });
  const info = db.prepare(`UPDATE ads SET ${cols.map(k => `${k}=?`).join(',')} WHERE id=?`).run(...cols.map(k => d[k]), old.id);
  /* 审核结果通知广告主 */
  if (d.status && d.status !== old.status && old.vendor_id) {
    const owner = db.prepare('SELECT user_id FROM vendors WHERE id=?').get(old.vendor_id);
    const N = {
      approved: ['广告已上线', 'Advertisement approved', '您的广告已通过审核并开始投放,可在个人中心查看曝光与点击数据。', 'Your advertisement is live. Track impressions and clicks in My Point.', 'me.html'],
      rejected: ['广告未通过审核', 'Advertisement declined', (d.review_note ? '原因:' + d.review_note + '。' : '') + '您可修改后重新提交。', (d.review_note ? 'Reason: ' + d.review_note + '. ' : '') + 'You may revise and resubmit.', 'me.html'],
      paused: ['广告已暂停', 'Advertisement paused', '您的广告已暂停展示,如有疑问请联系一点。', 'Your advertisement is paused. Contact us for details.', 'me.html']
    }[d.status];
    if (N && owner) notify(owner.user_id, { type: 'ad_review', title_zh: N[0], title_en: N[1], body_zh: N[2], body_en: N[3], link: N[4] });
  }
  /* 敏感操作留痕 */
  if (d.status && d.status !== old.status) {
    const A = { approved: 'ad_approve', rejected: 'ad_reject', paused: 'ad_pause', pending: 'ad_pending' };
    alog(req, A[d.status] || 'ad_status', 'ad', old.id, old.title_zh || old.target_url, d.review_note ? `原因:${d.review_note}` : '');
  }
  res.json({ ok: info.changes > 0 });
});
app.delete('/api/admin/ads/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT title_zh,target_url FROM ads WHERE id=?').get(id);
  const info = db.prepare('DELETE FROM ads WHERE id=?').run(id);
  if (old) alog(req, 'delete_ad', 'ad', id, old.title_zh || old.target_url, '');
  res.json({ ok: info.changes > 0 });
});

/* ---------- 内容审核与官方发布 ---------- */
app.get('/api/admin/posts', requireAuth, (req, res) => {
  const where = []; const args = [];
  if(req.query.status==='pending')where.push("(p.status='pending' OR EXISTS (SELECT 1 FROM post_revisions r WHERE r.post_id=p.id AND r.status='pending'))");
  else if (req.query.status) { where.push('p.status = ?'); args.push(req.query.status); }
  if (req.query.type) { where.push('p.type = ?'); args.push(req.query.type); }
  if (req.query.section_id) { where.push('p.section_id = ?'); args.push(Number(req.query.section_id)); }
  const rows = db.prepare(`
    SELECT p.*, u.email AS user_email, u.name AS user_name, v.name_zh AS vendor_name
    FROM posts p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN vendors v ON v.id = p.vendor_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.status='pending' DESC, p.id DESC LIMIT 500`).all(...args);
  res.json(rows.map(r=>({...parsePost(r),pending_revision:postRevision(r.id,true)})));
});
app.put('/api/admin/post-revisions/:id/review',requireAuth,(req,res)=>{
  const b=req.body||{},note=String(b.note||'').trim();
  if(!['approve','reject'].includes(b.action)||note.length>1000||(b.action==='reject'&&!note))return res.status(400).json({error:'请选择审核操作，驳回时需填写原因（最多 1000 字）'});
  db.exec('BEGIN IMMEDIATE');let revision,post;
  try{
    revision=db.prepare('SELECT * FROM post_revisions WHERE id=?').get(Number(req.params.id));
    if(!revision||revision.status!=='pending'){db.exec('ROLLBACK');return res.status(409).json({error:'修改已处理或已被替代，请刷新'});}
    post=db.prepare('SELECT * FROM posts WHERE id=?').get(revision.post_id);
    if(!post){db.exec('ROLLBACK');return res.status(404).json({error:'内容不存在'});}
    if(b.action==='approve'){
      const owner=db.prepare('SELECT status FROM users WHERE id=?').get(post.user_id);
      const vendor=post.vendor_id?db.prepare('SELECT status FROM vendors WHERE id=?').get(post.vendor_id):null;
      if(post.status!=='approved'||!owner||owner.status!=='active'||(post.vendor_id&&(!vendor||vendor.status!=='approved'))){db.exec('ROLLBACK');return res.status(409).json({error:'内容、发布者或入驻状态不正常，不能批准修改'});}
      const changes=JSON.parse(revision.payload),base=JSON.parse(revision.base_payload),keys=Object.keys(changes);
      if(keys.some(k=>post[k]!==base[k])){db.exec('ROLLBACK');return res.status(409).json({error:'对应线上字段已被管理员修改，请驳回并要求重新提交'});}
      const invalid=validatePost({...post,...changes},post.user_id);if(invalid){db.exec('ROLLBACK');return res.status(400).json({error:invalid});}
      if(!db.prepare("SELECT id FROM content_versions WHERE kind='posts' AND ref_id=? LIMIT 1").get(post.id))recordVersion('posts',post.id,req.admin.username);
      db.prepare(`UPDATE posts SET ${keys.map(k=>`${k}=?`).join(',')} WHERE id=?`).run(...keys.map(k=>changes[k]),post.id);recordVersion('posts',post.id,req.admin.username);
    }
    db.prepare("UPDATE post_revisions SET status=?,review_note=?,reviewed_at=datetime('now','localtime') WHERE id=?").run(b.action==='approve'?'approved':'rejected',note,revision.id);
    alog(req,'post_revision_'+b.action,'post',post.id,post.title_zh,`版本 #${revision.id}${note?'；'+note:''}`);
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  notify(post.user_id,{type:'post_review',title_zh:b.action==='approve'?'内容修改已通过':'内容修改未通过',title_en:b.action==='approve'?'Post update approved':'Post update declined',body_zh:b.action==='approve'?'新版本已上线。':`原因：${note}。原内容继续展示，可修改后重提。`,body_en:b.action==='approve'?'Your updated post is live.':`Reason: ${note}. Your original post remains live.`,link:'me.html'});
  res.json({ok:true});
});
app.post('/api/admin/posts', requireAuth, (req, res) => {
  /* 官方发布(文化文章/视频等),默认直接过审 */
  const data = pickPostBody(req.body || {});
  if (!data.title_zh && !data.title_en) return res.status(400).json({ error: '请填写标题' });
  data.type = data.type || 'article';
  const status = req.body.status || 'approved';
  if (!['pending','approved','offline','rejected'].includes(status)) return res.status(400).json({ error: '无效状态' });
  if (req.body.published_at) data.published_at = String(req.body.published_at).slice(0,30);
  data.scheduled_at=normalizeSchedule(req.body.scheduled_at);
  const featured = req.body.featured ? 1 : 0;
  const keys = Object.keys(data);
  const info = db.prepare(`INSERT INTO posts (status,featured,${keys.join(',')}) VALUES (?,?,${keys.map(() => '?').join(',')})`)
    .run(status, featured, ...keys.map(k => data[k]));
  recordVersion('posts',Number(info.lastInsertRowid),req.admin.username);
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.put('/api/admin/posts/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const data = pickPostBody(b);
  if ('status' in b) {
    if (!['pending', 'approved', 'rejected', 'offline'].includes(b.status)) return res.status(400).json({ error: '无效状态' });
    data.status = b.status;
  }
  if ('featured' in b) data.featured = b.featured ? 1 : 0;
  if ('review_note' in b) data.review_note = String(b.review_note || '');
  if ('published_at' in b) data.published_at = String(b.published_at || '');
  if ('scheduled_at' in b) data.scheduled_at=normalizeSchedule(b.scheduled_at);
  const keys = Object.keys(data);
  if (!keys.length) return res.status(400).json({ error: '没有可更新的字段' });
  const old = db.prepare('SELECT * FROM posts WHERE id=?').get(Number(req.params.id));
  if (!old) return res.status(404).json({ error: '内容不存在' });
  if(!db.prepare("SELECT id FROM content_versions WHERE kind='posts' AND ref_id=? LIMIT 1").get(old.id))recordVersion('posts',old.id,req.admin.username);
  const info = db.prepare(`UPDATE posts SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`)
    .run(...keys.map(k => data[k]), Number(req.params.id));
  recordVersion('posts',old.id,req.admin.username);
  /* 审核结果站内通知(官方内容 user_id 为空,自动跳过) */
  if (data.status && data.status !== old.status && old.user_id) {
    const t = old.title_zh || old.title_en || '';
    const N = {
      approved: [`「${t}」已发布`, `“${old.title_en || t}” is live`, '您的内容已通过审核,现已在前台展示。', 'Your post passed review and is now public.', `post.html?id=${old.id}`],
      rejected: [`「${t}」未通过审核`, `“${old.title_en || t}” was declined`, (data.review_note ? '原因:' + data.review_note + '。' : '') + '可在个人中心修改后重新提交。', (data.review_note ? 'Reason: ' + data.review_note + '. ' : '') + 'Edit and resubmit from My Point.', 'me.html'],
      offline: [`「${t}」已下架`, `“${old.title_en || t}” taken offline`, '该内容已被官方下架,如有疑问请联系一点。', 'This post has been taken offline by The Point.', 'me.html']
    }[data.status];
    if (N) notify(old.user_id, { type: 'post_review', title_zh: N[0], title_en: N[1], body_zh: N[2], body_en: N[3], link: N[4] });
  }
  if (data.status && data.status !== old.status) {
    const A = { approved: 'post_approve', rejected: 'post_reject', offline: 'post_offline', pending: 'post_pending' };
    alog(req, A[data.status] || 'post_status', 'post', old.id, old.title_zh || old.title_en, data.review_note ? `原因:${data.review_note}` : '');
  }
  res.json({ ok: info.changes > 0 });
});
app.delete('/api/admin/posts/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT title_zh,title_en FROM posts WHERE id=?').get(id);
  db.prepare('DELETE FROM post_revisions WHERE post_id=?').run(id);
  db.prepare("DELETE FROM content_versions WHERE kind='posts' AND ref_id=?").run(id);
  const info = db.prepare('DELETE FROM posts WHERE id=?').run(id);
  if (old) alog(req, 'delete_post', 'post', id, old.title_zh || old.title_en, '');
  res.json({ ok: info.changes > 0 });
});

/* ---------- 操作日志查询 ---------- */
app.get('/api/admin/logs', requireAuth, (req, res) => {
  const where = []; const args = [];
  if (req.query.q) {
    where.push('(target_label LIKE ? OR detail LIKE ? OR admin LIKE ?)');
    const kw = `%${String(req.query.q).slice(0, 80)}%`;
    args.push(kw, kw, kw);
  }
  if (req.query.action) { where.push('action = ?'); args.push(req.query.action); }
  const rows = db.prepare(`SELECT * FROM admin_logs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 300`).all(...args);
  res.json(rows);
});

/* ---------- 站点设置(SMTP 邮件通知配置等) ---------- */
const SETTING_KEYS = ['site_url', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'notify_email_enabled'];
app.get('/api/admin/settings', requireAuth, (req, res) => {
  const out = {};
  SETTING_KEYS.forEach(k => out[k] = k==='smtp_pass'?'':getSetting(k));
  out.smtp_pass_configured=!!getSetting('smtp_pass');
  res.json(out);
});
app.put('/api/admin/settings', requireAuth, (req, res) => {
  const b = req.body || {};
  if(b.site_url){try{const url=new URL(b.site_url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error();}catch(_){return res.status(400).json({error:'请填写有效的站点 URL，例如 https://thepoint.co.nz'});}}
  SETTING_KEYS.forEach(k => { if (k in b && !(k==='smtp_pass'&&!b[k])) setSetting(k, String(b[k] ?? '').slice(0, 500)); });
  if(b.clear_smtp_pass===true)setSetting('smtp_pass','');
  res.json({ ok: true });
});

/* 后台统计 */
app.get('/api/admin/stats', requireAuth, (req, res) => {
  const c = t => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  res.json({
    properties: c('properties'), agents: c('agents'), news: c('news'), partners: c('partners'),
    services: c('services'), enquiries: c('enquiries'),
    videos: c('videos'), schools: c('schools'),
    subscribers: db.prepare("SELECT COUNT(*) c FROM subscribers WHERE status='active'").get().c,
    users: c('users'), vendors: c('vendors'), posts: c('posts'),
    ads: c('ads'),
    unread: db.prepare('SELECT COUNT(*) c FROM enquiries WHERE is_read=0').get().c,
    vendors_pending: db.prepare("SELECT COUNT(*) c FROM vendors v WHERE status='pending' OR EXISTS (SELECT 1 FROM vendor_revisions r WHERE r.vendor_id=v.id AND r.status='pending')").get().c,
    posts_pending: db.prepare("SELECT COUNT(*) c FROM posts p WHERE status='pending' OR EXISTS (SELECT 1 FROM post_revisions r WHERE r.post_id=p.id AND r.status='pending')").get().c,
    ads_pending: db.prepare("SELECT COUNT(*) c FROM ads WHERE status='pending'").get().c
  });
});
app.get('/api/admin/system',requireAuth,(req,res)=>res.json({database:'sqlite',storage:'local',backup:backupState,recent_errors:recentErrors,readiness:{smtp:!!getSetting('smtp_host'),site_url:!!(getSetting('site_url')||process.env.PUBLIC_SITE_URL),https:/^https:\/\//.test(getSetting('site_url')||process.env.PUBLIC_SITE_URL||'')}}));
app.post('/api/admin/backup',requireAuth,(req,res)=>{
  try{const result=runBackup();alog(req,'backup','system',null,'完整备份','数据库与上传文件已备份');res.json({ok:true,...result});}
  catch(e){res.status(500).json({error:'备份失败，请检查备份目录及磁盘空间'});}
});

/* 发送测试邮件:管理员保存 SMTP 后能立刻验证配置对不对,不用等真事件触发 */
app.post('/api/admin/test-mail', requireAuth, async (req, res) => {
  const to = String((req.body || {}).to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: '请填写有效的收件邮箱' });
  if (!getSetting('smtp_host')) return res.status(400).json({ error: '请先填写 SMTP 服务器并保存设置' });
  try {
    const body = '收到这封邮件,说明「一点」的 SMTP 配置正确,审核通知与密码重置邮件都能正常发出。';
    await mailSend({ to, subject: 'THE POINT 一点 · 邮件配置测试', text: body, html: mailHtml('邮件配置测试', body, '', '') });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'SMTP 发送失败:' + e.message });
  }
});

/* ---------------- SEO: sitemap.xml / robots.txt ---------------- */
function siteBase(req) {
  return (getSetting('site_url') || process.env.PUBLIC_SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
}
for(const [page,kind] of Object.entries({'article.html':'news','post.html':'posts','vendor.html':'vendors','property.html':'properties'})){
  app.get('/'+page,(req,res)=>{
    const id=Number(req.query.id);let row=null;
    if(Number.isSafeInteger(id)&&id>0){
      if(kind==='news')row=db.prepare('SELECT * FROM public_news WHERE id=? AND visible=1').get(id);
      if(kind==='properties')row=db.prepare("SELECT * FROM properties WHERE id=? AND status!='下架'").get(id);
      if(kind==='vendors')row=db.prepare("SELECT v.* FROM vendors v JOIN users u ON u.id=v.user_id WHERE v.id=? AND v.status='approved' AND u.status='active'").get(id);
      if(kind==='posts')row=db.prepare("SELECT p.* FROM public_posts p LEFT JOIN vendors v ON v.id=p.vendor_id LEFT JOIN users u ON u.id=p.user_id WHERE p.id=? AND p.status='approved' AND (p.user_id IS NULL OR u.status='active') AND (p.vendor_id IS NULL OR v.status='approved')").get(id);
    }
    if(!row)return res.status(404).sendFile(path.join(ROOT,'404.html'));
    res.setHeader('Cache-Control','no-cache');res.type('html').send(detailHtml(kind,row,ROOT,siteBase(req)));
  });
}
app.get('/sitemap.xml', (req, res) => {
  const base = siteBase(req);
  const urls = [];
  const add = (loc, priority) => urls.push(`<url><loc>${base}/${loc}</loc><priority>${priority}</priority></url>`);
  add('', '1.0');
  ['properties.html', 'experts.html', 'news.html', 'partners.html', 'services.html', 'join.html'].forEach(p => add(p, '0.8'));
  db.prepare('SELECT slug FROM sections WHERE visible=1').all().forEach(s =>
    add(s.slug === 'property' ? 'properties.html' : `section.html?s=${s.slug}`, '0.8'));
  db.prepare("SELECT id FROM properties WHERE status != '下架'").all().forEach(r => add(`property.html?id=${r.id}`, '0.7'));
  db.prepare(`SELECT p.id FROM public_posts p LEFT JOIN vendors v ON v.id=p.vendor_id
    WHERE p.status='approved' AND (p.vendor_id IS NULL OR v.status='approved')`).all().forEach(r => add(`post.html?id=${r.id}`, '0.6'));
  db.prepare("SELECT id FROM vendors WHERE status='approved'").all().forEach(r => add(`vendor.html?id=${r.id}`, '0.7'));
  db.prepare('SELECT id FROM public_news WHERE visible=1').all().forEach(r => add(`article.html?id=${r.id}`, '0.6'));
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
});
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nSitemap: ${siteBase(req)}/sitemap.xml\n`);
});

/* ---------------- 静态文件(带缓存策略) ---------------- */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const publicFiles = new Set(['/', '/index.html', '/404.html', '/account.html', '/article.html', '/disclaimer.html',
    '/expert.html', '/experts.html', '/join.html', '/me.html', '/news.html', '/partners.html', '/post.html',
    '/privacy.html', '/properties.html', '/property.html', '/reset.html', '/search.html', '/section.html',
    '/services.html', '/vendor.html', '/app.js', '/content.js', '/i18n.js', '/script.js', '/styles.css', '/property-map.js', '/property-map.css',
    '/vendor/leaflet/leaflet.js', '/vendor/leaflet/leaflet.css',
    '/admin', '/admin/', '/admin/index.html', '/admin/content-tools.js', '/admin/content-tools.css', '/admin/property-tools.js', '/admin/operations-tools.js']);
  if (publicFiles.has(req.path) || /^\/vendor\/leaflet\/images\/(?:layers(?:-2x)?|marker-icon(?:-2x)?|marker-shadow)\.png$/.test(req.path) || /^\/(?:media|uploads)\/[a-zA-Z0-9_-]+\.(?:svg|jpe?g|png|webp|gif|avif)$/i.test(req.path)) return next();
  res.status(404).end();
});
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.use(express.static(ROOT, {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (/\.(css|js)$/i.test(filePath)) {
      // 代码文件走协商缓存:每次带 ETag 问一句,没变返回 304(几百字节),改了立刻拿到新版。
      // 否则发布更新后,老用户最长 7 天还在跑旧代码。
      res.setHeader('Cache-Control', 'no-cache');
    } else if (/\.(svg|jpe?g|png|webp|gif|avif|woff2?)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800'); // 图片与字体 7 天
    } else {
      res.setHeader('Cache-Control', 'no-cache'); // HTML 协商缓存,发版即生效
    }
  }
}));

/* 404:HTML 请求给美化页,API 给 JSON */
app.use((req, res) => {
  if ((req.headers.accept || '').includes('text/html')) {
    return res.status(404).sendFile(path.join(ROOT, '404.html'));
  }
  res.status(404).json({ error: 'Not Found' });
});

app.use((err, req, res, next) => {
  console.error(err.message);
  if(!err.status||err.status>=500){recentErrors.unshift({at:new Date().toISOString(),path:req.path,message:String(err.message).slice(0,200)});recentErrors.splice(20);}
  res.status(err.status === 400 || err instanceof multer.MulterError ? 400 : 500).json({ error: err.status === 400 ? err.message : err instanceof multer.MulterError ? '上传失败：图片过大或数量超限' : '操作失败，请检查输入或稍后重试' });
});
app.listen(PORT, () => {
  console.log(`THE POINT 一点 已启动: http://localhost:${PORT}`);
  console.log(`管理后台: http://localhost:${PORT}/admin/`);
});
if(backupState.enabled){
  const backup=()=>{try{runBackup();}catch(e){console.error('自动备份失败：'+e.message);}};
  setTimeout(backup,1000).unref();
  setInterval(backup,24*60*60*1000).unref();
}
