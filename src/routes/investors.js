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
  consent INTEGER DEFAULT 0,             -- 勾了「同意信息用途」这个框
  email_verified INTEGER DEFAULT 0,      -- 地址归属是否验证过。公开表单任何人都能填别人的
                                         -- 邮箱,所以勾了同意 ≠ 地址本人同意。SMTP 接通、
                                         -- 走过邮件确认后才置 1;群发只应发给已验证的地址
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

  /* 老库补字段:CREATE TABLE IF NOT EXISTS 对已存在的表不生效 */
  for (const [col, def] of [['email_verified', 'INTEGER DEFAULT 0']]) {
    const cols = db.prepare('PRAGMA table_info(investors)').all().map(c => c.name);
    if (!cols.includes(col)) db.exec(`ALTER TABLE investors ADD COLUMN ${col} ${def}`);
  }
  /* 邮箱唯一约束。注意:CREATE UNIQUE INDEX IF NOT EXISTS 遇到同名的旧非唯一索引会
     直接跳过(静默不生效),所以必须先按唯一性检查、不满足就重建。
     库里已有重复邮箱时建不起来,此时只记日志,不能让服务起不来。 */
  const emailIdx = db.prepare("SELECT \"unique\" u FROM pragma_index_list('investors') WHERE name='idx_investors_email'").get();
  if (!emailIdx || !emailIdx.u) {
    try {
      db.exec('DROP INDEX IF EXISTS idx_investors_email');
      db.exec('CREATE UNIQUE INDEX idx_investors_email ON investors(email)');
    } catch (e) {
      db.exec('CREATE INDEX IF NOT EXISTS idx_investors_email ON investors(email)');
      console.error('investors.email 存在重复,唯一约束未建立,请先清理重复邮箱:', e.message);
    }
  }

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
    const existing = db.prepare('SELECT id FROM investors WHERE email=?').get(email);
    if (existing) {
      /* 这个邮箱已经登记过。此处无法证明提交者就是本人 ——
         任何人都能拿别人的邮箱来 POST。所以:
           · 绝不回传已有记录的 token(它是读写该记录的唯一凭证)
           · 绝不改动已有记录(否则等于让陌生人覆盖别人的意向、并解除其退订)
         本人要改意向,走当初那条专属链接;链接丢了需后台协助。

         ⚠ 已知未解决:新建会返回 profile_url、这里不会,响应形状不同,
         因此「某邮箱是否登记过」仍可被未登录者探测出来。要彻底消除,
         必须改成「链接只发往该邮箱」—— 等 SMTP 接通后一并处理。
         在那之前这是有意接受的残留风险,别再把它描述成已修复。 */
      return res.json({ ok: true });
    }
    const token = newToken();
    const info = db.prepare('INSERT INTO investors (name,email,phone,token,consent,lang,source,utm,landing) VALUES (?,?,?,?,1,?,?,?,?)')
      .run(name, email, phone, token, lang, S(b.source, 40), S(b.utm, 500), S(b.landing, 300));
    saveInterests(Number(info.lastInsertRowid), interests);
    /* 仅新建时回传专属链接:这条记录的内容全部由本次提交者自己填写,不含他人数据 */
    res.json({ ok: true, profile_url: '/investors.html?token=' + token });
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
    /* 姓名电话来自公开表单(谁都能提交)。Excel 会把 = + - @ 开头的单元格当公式执行,
       加引号也拦不住 —— 必须前置一个单引号,否则管理员一打开导出文件就可能中招。 */
    const cell = v => {
      v = v == null ? '' : String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
      if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
      return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    const head = ['id', '姓名', '邮箱', '邮箱已验证', '电话', '状态', '语言', '意向', '来源', '备注', '登记时间', '更新时间'];
    const body = rows.map(r => {
      const want = interestsOf(r.id).map(x => kindLabel(x.kind) + ' ' + rangeLabel(x.price_min, x.price_max)).join(' / ');
      return [r.id, r.name, r.email, r.email_verified ? '是' : '否(未经邮件确认)', r.phone, r.status === 'active' ? '有效' : '已退订',
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
