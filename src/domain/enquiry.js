'use strict';
/* 咨询意图。姑姑的要求:「need including clients all details, and full name, question,
   need a viewing, or info pack acquire」+「让客户自填」+「And call the agent」——
   也就是让客户自己把来意一次填清楚,省掉后面来回打电话问。

   刻意分成两列,不要混:
     type   = 这条线索从哪个入口来(首页 / 房源页 / 专家页 / 入驻方页 / 商户入驻 / 订阅),沿用原值不动
     intent = 客户要什么:问问题 / 看房 / 要资料 / 要回电                                           */
const INTENTS = ['question', 'viewing', 'info_pack', 'callback'];

function invalid(message) { const error = new Error(message); error.status = 400; throw error; }

/* 旧前台只发 type=viewing、不带 intent。部署后浏览器里可能还跑着缓存的旧脚本,这里兜住。 */
function resolveIntent(body) {
  const raw = String(body.intent || '').trim();
  if (raw) {
    if (!INTENTS.includes(raw)) invalid('请选择有效的咨询方式');
    return raw;
  }
  return String(body.type || '') === 'viewing' ? 'viewing' : '';
}

/* 客户必须自填的部分。订阅只要邮箱,不走这套。 */
function validateEnquiry(body, intent) {
  const type = String(body.type || '');
  if (type === 'subscribe') {
    if (!String(body.email || '').trim()) invalid('请填写邮箱');
    return;
  }
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const email = String(body.email || '').trim();
  /* 姑姑要的是 full name,不是「王先生」这种称呼 */
  if (name.length < 2) invalid('请填写您的全名');
  /* 看房 / 要资料 / 要回电 本身已说明来意,不再强制写一段话;只有「咨询问题」必须写 */
  if ((intent === 'question' || !intent) && type !== 'viewing' && !String(body.message || '').trim()) invalid('请填写您想咨询的问题');
  if (intent === 'callback' && !phone) invalid('希望经纪人回电,请留下联系电话');
  if ((intent === 'viewing' || intent === 'info_pack' || intent === 'callback') && !phone && !email) invalid('请至少填写电话或邮箱');
}

module.exports = { INTENTS, resolveIntent, validateEnquiry };
