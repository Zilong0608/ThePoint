'use strict';
const crypto = require('node:crypto');
const { KINDS, KIND_IDS, PRICE_BANDS, bandById, kindLabel, rangeLabel, normalizeInterests } = require('../domain/investors');

module.exports = function ({ app, db, requireAuth, alog = () => {} }) {

  /* ---------- 建表(模块自带,老库启动自动补) ---------- */
  db.exec(`
CREATE TABLE IF NOT EXISTS investors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  token TEXT UNIQUE NOT NULL,            -- 自助编辑链接用(邮件「更新我的意向」按钮)
  status TEXT DEFAULT 'active',          -- active / unsubscribed
  consent INTEGER DEFAULT 0,             -- Privacy Act 用途告知同意
  lang TEXT DEFAULT 'zh',                -- 将来群发按语言分流
  note TEXT DEFAULT '',                  -- 后台备注
  source TEXT DEFAULT '',                -- 复用站内归因:这人从哪个广告来的
  utm TEXT DEFAULT '',
  landing TEXT DEFAULT '',
  last_emailed_at TEXT DEFAULT '',       -- 为后续群发预留
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS investor_interests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investor_id INTEGER NOT NULL,
  kind TEXT NOT NULL,                    -- rental / land / project
  price_min INTEGER,                     -- 纽币;NULL = 不限
  price_max INTEGER
);
CREATE INDEX IF NOT EXISTS idx_investors_email ON investors(email);
CREATE INDEX IF NOT EXISTS idx_investors_status ON investors(status);
CREATE INDEX IF NOT EXISTS idx_inv_interest ON investor_interests(kind, price_min, price_max);
CREATE INDEX IF NOT EXISTS idx_inv_interest_owner ON investor_interests(investor_id);`);

  const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));
  const newToken = () => crypto.randomBytes(24).toString('hex');
  const S = (v, n) => String(v == null ? '' : v).slice(0, n);

  /* 提交限流:同一 IP 每 10 分钟最多 5 次,挡批量灌水 */
  const hits = new Map();
  setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (v.until < t) hits.delete(k); }, 10 * 60 * 1000).unref();
  function throttle(req, res, next) {
    const id = req.ip || 'unknown', now = Date.now();
    let row = hits.get(id);
    if (!row || row.until < now) {
      if (hits.size > 5000) return res.status(429).json({ error: '系统繁忙,请稍后再试' });
      row = { n: 0, until: now + 10 * 60 * 1000 }; hits.set(id, row);
    }
    if (++row.n > 5) return res.status(429).json({ error: '提交过于频繁,请稍后再试' });
    next();
  }

  const interestsOf = id => db.prepare('SELECT kind,price_min,price_max FROM investor_interests WHERE investor_id=? ORDER BY id').all(id);
  function saveInterests(investorId, list) {
    db.prepare('DELETE FROM investor_interests WHERE investor_id=?').run(investorId);
    const ins = db.prepare('INSERT INTO investor_interests (investor_id,kind,price_min,price_max) VALUES (?,?,?,?)');
    for (const it of list) ins.run(investorId, it.kind, it.price_min, it.price_max);
  }
  const publicInvestor = r => ({ name: r.name, email: r.email, phone: r.phone, lang: r.lang, status: r.status, interests: interestsOf(r.id) });

  /* ---------- 前台:选项(前端不写死档位) ---------- */
  app.get('/api/investors/options', (req, res) => res.json({ kinds: KINDS, bands: PRICE_BANDS }));

  /* ---------- 前台:登记 ---------- */
  app.post('/api/investors', throttle, (req, res) => {
    const b = req.body || {};
    if (b.website) return res.json({ ok: true });              /* 蜜罐字段:只有机器人会填 */
    /* 先 trim 再校验 —— 粘贴来的邮箱常带首尾空格,不该因此被拒 */
    const email = S(b.email, 200).trim().toLowerCase();
    if (!isEmail(email)) return res.status(400).json({ error: '请填写有效的邮箱' });
    if (!b.consent) return res.status(400).json({ error: '请先阅读并同意信息使用说明' });
    const interests = normalizeInterests(b.interests);
    if (!interests.length) return res.status(400).json({ error: '请至少选择一个投资类型并选好预算区间' });
    const name = S(b.name, 100), phone = S(b.phone, 50), lang = b.lang === 'en' ? 'en' : 'zh';
    const existing = db.prepare('SELECT id,token FROM investors WHERE email=?').get(email);
    let id, token;
    if (existing) {
      /* 同一邮箱再次提交 = 更新意向,不产生重复记录 */
      id = existing.id; token = existing.token;
      db.prepare("UPDATE investors SET name=?,phone=?,lang=?,consent=1,status='active',updated_at=datetime('now','localtime') WHERE id=?")
        .run(name, phone, lang, id);
    } else {
      token = newToken();
      const info = db.prepare('INSERT INTO investors (name,email,phone,token,consent,lang,source,utm,landing) VALUES (?,?,?,?,1,?,?,?,?)')
        .run(name, email, phone, token, lang, S(b.source, 40), S(b.utm, 500), S(b.landing, 300));
      id = Number(info.lastInsertRowid);
    }
    saveInterests(id, interests);
    /* 回传自助编辑链接:现在前端直接显示,将来群发邮件用同一个链接 */
    res.json({ ok: true, updated: !!existing, profile_url: '/investors.html?token=' + token });
  });

  /* ---------- 前台:凭 token 读回 / 更新 / 退订 ---------- */
  const byToken = req => {
    const t = String(req.query.token || (req.body || {}).token || '');
    return t.length >= 32 ? db.prepare('SELECT * FROM investors WHERE token=?').get(t) : null;
  };
  app.get('/api/investors/me', (req, res) => {
    const r = byToken(req);
    if (!r) return res.status(404).json({ error: '链接无效,请重新登记' });
    res.json(publicInvestor(r));
  });
  app.put('/api/investors/me', (req, res) => {
    const r = byToken(req);
    if (!r) return res.status(404).json({ error: '链接无效,请重新登记' });
    const b = req.body || {};
    const interests = normalizeInterests(b.interests);
    if (!interests.length) return res.status(400).json({ error: '请至少保留一个投资类型' });
    db.prepare("UPDATE investors SET name=?,phone=?,lang=?,status='active',updated_at=datetime('now','localtime') WHERE id=?")
      .run(S(b.name, 100), S(b.phone, 50), b.lang === 'en' ? 'en' : 'zh', r.id);
    saveInterests(r.id, interests);
    res.json({ ok: true });
  });
  app.post('/api/investors/unsubscribe', (req, res) => {
    const r = byToken(req);
    if (!r) return res.status(404).json({ error: '链接无效' });
    db.prepare("UPDATE investors SET status='unsubscribed',updated_at=datetime('now','localtime') WHERE id=?").run(r.id);
    res.json({ ok: true });
  });

  /* ---------- 后台:名录 ---------- */
  app.get('/api/admin/investors', requireAuth, (req, res) => {
    const q = req.query, where = [], args = [];
    if (q.status) { where.push('i.status=?'); args.push(String(q.status)); }
    if (q.q) {
      where.push('(i.name LIKE ? OR i.email LIKE ? OR i.phone LIKE ?)');
      const k = '%' + String(q.q).slice(0, 60) + '%'; args.push(k, k, k);
    }
    if (q.kind && KIND_IDS.includes(String(q.kind))) {
      let clause = 'EXISTS (SELECT 1 FROM investor_interests x WHERE x.investor_id=i.id AND x.kind=?';
      args.push(String(q.kind));
      /* 档位筛选取「区间有重叠」而非完全相同 —— 预算 80-120 万的人,
         在筛「100-150 万」那档时也该被筛出来 */
      const band = q.band ? bandById(String(q.band)) : null;
      if (band) {
        clause += ' AND (? IS NULL OR x.price_max IS NULL OR x.price_max >= ?) AND (? IS NULL OR x.price_min IS NULL OR x.price_min <= ?)';
        args.push(band.min, band.min, band.max, band.max);
      }
      where.push(clause + ')');
    }
    const sql = 'SELECT i.* FROM investors i ' + (where.length ? 'WHERE ' + where.join(' AND ') : '') + ' ORDER BY i.id DESC LIMIT 500';
    const rows = db.prepare(sql).all(...args);
    res.json(rows.map(r => { const o = { ...r, interests: interestsOf(r.id) }; delete o.token; return o; }));
  });

  /* ---------- 后台:按价格筛出匹配的投资者 ---------- */
  app.get('/api/admin/investors/match', requireAuth, (req, res) => {
    const kind = String(req.query.kind || '');
    if (!KIND_IDS.includes(kind)) return res.status(400).json({ error: '请选择投资类型' });
    let price = Number(req.query.price);
    if (!Number.isFinite(price) && req.query.property_id) {
      const p = db.prepare('SELECT price_value FROM properties WHERE id=?').get(Number(req.query.property_id));
      price = p && p.price_value ? Number(p.price_value) : NaN;
    }
    if (!Number.isFinite(price)) return res.status(400).json({ error: '请提供价格,或选择一套标有价格的房源' });
    const rows = db.prepare(
      'SELECT i.id,i.name,i.email,i.phone,i.lang,x.price_min,x.price_max' +
      ' FROM investors i JOIN investor_interests x ON x.investor_id=i.id' +
      " WHERE i.status='active' AND x.kind=?" +
      ' AND (x.price_min IS NULL OR x.price_min <= ?)' +
      ' AND (x.price_max IS NULL OR x.price_max >= ?)' +
      ' ORDER BY i.id DESC LIMIT 500').all(kind, price, price);
    res.json({ kind, price, count: rows.length, investors: rows });
  });

  /* ---------- 后台:导出名单(含意向,通用表导出拿不到跨表数据) ---------- */
  app.get('/api/admin/investors/export.csv', requireAuth, (req, res) => {
    const rows = db.prepare("SELECT * FROM investors WHERE ?='' OR status=? ORDER BY id")
      .all(String(req.query.status || ''), String(req.query.status || ''));
    const cell = v => { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const head = ['id', '姓名', '邮箱', '电话', '状态', '语言', '意向', '来源', '备注', '登记时间', '更新时间'];
    const body = rows.map(r => {
      const want = interestsOf(r.id).map(x => kindLabel(x.kind) + ' ' + rangeLabel(x.price_min, x.price_max)).join(' / ');
      return [r.id, r.name, r.email, r.phone, r.status === 'active' ? '有效' : '已退订',
        r.lang === 'en' ? 'EN' : '中文', want, r.source, r.note, r.created_at, r.updated_at].map(cell).join(',');
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="thepoint-investors-' + new Date().toISOString().slice(0, 10) + '.csv"');
    res.send('﻿' + head.join(',') + '\n' + body.join('\n'));   /* BOM:Excel 打开中文不乱码 */
    alog(req, 'export_investors', 'table', null, 'investors', '导出 ' + rows.length + ' 条');
  });

  app.put('/api/admin/investors/:id', requireAuth, (req, res) => {
    const b = req.body || {}, id = Number(req.params.id);
    const old = db.prepare('SELECT id,email,status FROM investors WHERE id=?').get(id);
    if (!old) return res.status(404).json({ error: '记录不存在' });
    const set = [], args = [];
    if ('note' in b) { set.push('note=?'); args.push(S(b.note, 500)); }
    if ('status' in b) {
      if (!['active', 'unsubscribed'].includes(b.status)) return res.status(400).json({ error: '无效状态' });
      set.push('status=?'); args.push(b.status);
    }
    if (!set.length) return res.status(400).json({ error: '没有可更新的字段' });
    db.prepare('UPDATE investors SET ' + set.join(',') + ",updated_at=datetime('now','localtime') WHERE id=?").run(...args, id);
    if (b.status && b.status !== old.status) alog(req, 'investor_status', 'investor', id, old.email, b.status);
    res.json({ ok: true });
  });

  app.delete('/api/admin/investors/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const old = db.prepare('SELECT email FROM investors WHERE id=?').get(id);
    db.prepare('DELETE FROM investor_interests WHERE investor_id=?').run(id);
    const info = db.prepare('DELETE FROM investors WHERE id=?').run(id);
    if (old) alog(req, 'delete_investor', 'investor', id, old.email, '');
    res.json({ ok: info.changes > 0 });
  });
};
