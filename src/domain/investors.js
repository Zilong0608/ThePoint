'use strict';
/* 投资者意向:类型与价格档位的唯一事实源。
   前台表单、后台筛选、匹配查询都从这里取,改档位只改这一处。
   注意:入库存的是 min/max 数值而非档位 id —— 将来重划档位,老数据依然能被正确匹配。 */

const KINDS = [
  { id: 'rental',  label_zh: '收租房',   label_en: 'Rental property' },
  { id: 'land',    label_zh: '土地',     label_en: 'Land' },
  { id: 'project', label_zh: '开发项目', label_en: 'Development project' }
];

/* 单位:纽币。min 为 null 表示不设下限,max 为 null 表示不设上限 */
const PRICE_BANDS = [
  { id: 'u500',    label_zh: '50 万以下',   label_en: 'Under $500k',   min: null,    max: 500000 },
  { id: '500_750', label_zh: '50 – 75 万',  label_en: '$500k – $750k', min: 500000,  max: 750000 },
  { id: '750_1m',  label_zh: '75 – 100 万', label_en: '$750k – $1M',   min: 750000,  max: 1000000 },
  { id: '1m_15',   label_zh: '100 – 150 万',label_en: '$1M – $1.5M',   min: 1000000, max: 1500000 },
  { id: '15_2m',   label_zh: '150 – 200 万',label_en: '$1.5M – $2M',   min: 1500000, max: 2000000 },
  { id: '2m_plus', label_zh: '200 万以上',  label_en: '$2M+',          min: 2000000, max: null }
];

const KIND_IDS = KINDS.map(k => k.id);
const bandById = id => PRICE_BANDS.find(b => b.id === id) || null;
const kindLabel = id => (KINDS.find(k => k.id === id) || {}).label_zh || id;

/* 把一段数值区间描述成人话,后台列表用 */
function rangeLabel(min, max) {
  const m = n => (n % 1000000 === 0 ? (n / 10000) + ' 万' : Math.round(n / 10000) + ' 万');
  if (min == null && max == null) return '不限';
  if (min == null) return m(max) + '以下';
  if (max == null) return m(min) + '以上';
  return m(min) + ' – ' + m(max);
}

/* 校验并规范化前端提交的意向数组。
   接受 [{kind, band}] 或 [{kind, price_min, price_max}],统一输出数值区间。
   非法条目直接丢弃而不是报错 —— 表单里多勾一个空选项不该让整次提交失败。 */
function normalizeInterests(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw.slice(0, 10)) {
    if (!item || typeof item !== 'object') continue;
    const kind = String(item.kind || '');
    if (!KIND_IDS.includes(kind) || seen.has(kind)) continue;   /* 同一类型只保留一条 */
    let min = null, max = null;
    if (item.band) {
      const b = bandById(String(item.band));
      if (!b) continue;
      min = b.min; max = b.max;
    } else {
      const n = v => (v == null || v === '' ? null : Number(v));
      min = n(item.price_min); max = n(item.price_max);
      if ((min != null && !Number.isFinite(min)) || (max != null && !Number.isFinite(max))) continue;
      if (min != null && max != null && min > max) { const t = min; min = max; max = t; }
    }
    seen.add(kind);
    out.push({ kind, price_min: min, price_max: max });
  }
  return out;
}

module.exports = { KINDS, KIND_IDS, PRICE_BANDS, bandById, kindLabel, rangeLabel, normalizeInterests };
