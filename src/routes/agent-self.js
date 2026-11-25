'use strict';
/* 经纪人自助维护自己的专家资料。
   姑姑原话:「每个 agent 自己可以 edit 它自己的东西,同时我们 admin 这个后台也可以」。
   做法:给 agents 挂一个登录账号(后台绑定),本人改动先进待审,审核通过才覆盖正式字段。
   刻意不动 agents 表与 properties / enquiries / 专家页之间已有的关联 —— 那 16 处引用照常工作。 */

/* 本人可改的字段。联系方式和简介可改,排序、是否显示这类编辑权留给后台 */
const SELF_FIELDS = ['name', 'email', 'phone', 'wechat', 'photo', 'bio', 'bio_en', 'category', 'channel_url'];

module.exports = function ({ app, db, requireAuth, requireUser, alog = () => {}, notify = () => {} }) {

  const addCol = (table, col, def) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  };
  addCol('agents', 'user_id', 'INTEGER');                   /* 绑定的登录账号 */
  addCol('agents', 'pending', "TEXT DEFAULT ''");           /* 待审改动(JSON),空=无待审 */
  addCol('agents', 'pending_at', "TEXT DEFAULT ''");
  addCol('agents', 'review_note', "TEXT DEFAULT ''");
  db.exec('CREATE INDEX IF NOT EXISTS idx_agents_user ON agents(user_id)');

  const S = (v, n) => String(v == null ? '' : v).slice(0, n);
  const LIMIT = { name: 60, email: 200, phone: 50, wechat: 60, photo: 300, bio: 3000, bio_en: 3000, category: 30, channel_url: 300 };
  function pickSelf(body) {
    const out = {};
    for (const f of SELF_FIELDS) if (f in body) out[f] = S(body[f], LIMIT[f] || 200);
    return out;
  }
  const parsePending = row => {
    if (!row || !row.pending) return null;
    try { return JSON.parse(row.pending); } catch (e) { return null; }
  };
  const agentOf = userId => db.prepare('SELECT * FROM agents WHERE user_id=?').get(userId) || null;

  /* ---------- 本人:查看 / 提交修改 ---------- */
  app.get('/api/my/agent', requireUser, (req, res) => {
    const a = agentOf(req.user.id);
    if (!a) return res.json({ linked: false });
    res.json({
      linked: true,
      agent: { id: a.id, name: a.name, category: a.category, email: a.email, phone: a.phone, wechat: a.wechat, photo: a.photo, bio: a.bio, bio_en: a.bio_en, channel_url: a.channel_url, visible: a.visible },
      pending: parsePending(a),            /* 有待审改动时,前台要提示「修改审核中」 */
      pending_at: a.pending_at || '',
      review_note: a.review_note || ''
    });
  });

  app.put('/api/my/agent', requireUser, (req, res) => {
    const a = agentOf(req.user.id);
    if (!a) return res.status(403).json({ error: '您的账号尚未绑定专家资料,请联系一点官方' });
    const data = pickSelf(req.body || {});
    if (!Object.keys(data).length) return res.status(400).json({ error: '没有可提交的内容' });
    if (data.name !== undefined && !data.name.trim()) return res.status(400).json({ error: '姓名不能为空' });
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return res.status(400).json({ error: '邮箱格式不正确' });
    /* 只记录真正发生变化的字段,避免「什么都没改」也占一条待审 */
    const changes = {};
    for (const [k, v] of Object.entries(data)) if (String(a[k] ?? '') !== v) changes[k] = v;
    if (!Object.keys(changes).length) return res.json({ ok: true, unchanged: true });
    db.prepare("UPDATE agents SET pending=?,pending_at=datetime('now','localtime'),review_note='' WHERE id=?")
      .run(JSON.stringify(changes), a.id);
    res.json({ ok: true, pending: changes });
  });

  app.delete('/api/my/agent/pending', requireUser, (req, res) => {
    const a = agentOf(req.user.id);
    if (!a) return res.status(403).json({ error: '未绑定专家资料' });
    db.prepare("UPDATE agents SET pending='',pending_at='' WHERE id=?").run(a.id);
    res.json({ ok: true });
  });

  /* ---------- 后台:绑定账号 / 审核改动 ---------- */
  app.get('/api/admin/agents/links', requireAuth, (req, res) => {
    res.json(db.prepare(`
      SELECT a.id, a.name, a.user_id, a.pending, a.pending_at, a.review_note, u.email AS user_email
      FROM agents a LEFT JOIN users u ON u.id = a.user_id
      ORDER BY (a.pending <> '') DESC, a.sort_order, a.id`).all()
      .map(r => ({ ...r, pending: (() => { try { return r.pending ? JSON.parse(r.pending) : null; } catch (e) { return null; } })() })));
  });

  /* 用邮箱把一个已注册账号绑到某位专家上;email 传空则解绑 */
  app.put('/api/admin/agents/:id/link', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const a = db.prepare('SELECT id,name FROM agents WHERE id=?').get(id);
    if (!a) return res.status(404).json({ error: '专家不存在' });
    const email = S((req.body || {}).email, 200).trim().toLowerCase();
    if (!email) {
      db.prepare('UPDATE agents SET user_id=NULL WHERE id=?').run(id);
      alog(req, 'agent_unlink', 'agent', id, a.name, '解除账号绑定');
      return res.json({ ok: true, linked: false });
    }
    const u = db.prepare('SELECT id,email,status FROM users WHERE email=?').get(email);
    if (!u) return res.status(404).json({ error: '没有这个邮箱的注册账号,请对方先在前台注册' });
    if (u.status !== 'active') return res.status(400).json({ error: '该账号已被停用' });
    const taken = db.prepare('SELECT id,name FROM agents WHERE user_id=? AND id<>?').get(u.id, id);
    if (taken) return res.status(400).json({ error: `该账号已绑定到「${taken.name}」,请先解绑` });
    db.prepare('UPDATE agents SET user_id=? WHERE id=?').run(u.id, id);
    alog(req, 'agent_link', 'agent', id, a.name, '绑定账号 ' + u.email);
    res.json({ ok: true, linked: true, email: u.email });
  });

  app.post('/api/admin/agents/:id/review', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const a = db.prepare('SELECT * FROM agents WHERE id=?').get(id);
    if (!a) return res.status(404).json({ error: '专家不存在' });
    const changes = parsePending(a);
    if (!changes) return res.status(400).json({ error: '没有待审改动' });
    const approve = (req.body || {}).approve !== false;
    const note = S((req.body || {}).review_note, 500);
    if (approve) {
      /* 只覆盖白名单内的字段,待审内容是本人提交的,不能借它改到别的列 */
      const cols = Object.keys(changes).filter(k => SELF_FIELDS.includes(k));
      if (cols.length) {
        db.prepare(`UPDATE agents SET ${cols.map(k => `${k}=?`).join(',')} WHERE id=?`)
          .run(...cols.map(k => S(changes[k], LIMIT[k] || 200)), id);
      }
      db.prepare("UPDATE agents SET pending='',pending_at='',review_note='' WHERE id=?").run(id);
      alog(req, 'agent_review_approve', 'agent', id, a.name, '通过资料修改:' + cols.join(','));
    } else {
      db.prepare("UPDATE agents SET pending='',pending_at='',review_note=? WHERE id=?").run(note, id);
      alog(req, 'agent_review_reject', 'agent', id, a.name, note ? '驳回:' + note : '驳回资料修改');
    }
    /* 结果通知本人 */
    if (a.user_id) {
      notify(a.user_id, approve
        ? { type: 'agent_review', title_zh: '资料修改已通过', title_en: 'Profile update approved', body_zh: '您提交的专家资料修改已通过审核,已在网站上更新。', body_en: 'Your profile update is live.', link: 'me.html' }
        : { type: 'agent_review', title_zh: '资料修改未通过', title_en: 'Profile update declined', body_zh: (note ? '原因:' + note + '。' : '') + '您可修改后重新提交。', body_en: (note ? 'Reason: ' + note + '. ' : '') + 'You may revise and resubmit.', link: 'me.html' });
    }
    res.json({ ok: true });
  });
};
