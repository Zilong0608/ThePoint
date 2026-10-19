'use strict';
const { safeUrl } = require('../../public/assets/js/content');
function invalid(message) { const error = new Error(message); error.status = 400; throw error; }
function normalizeProperty(data, previous = {}) {
  const moved=['address','suburb','city'].some(key=>key in data && String(data[key]||'').trim()!==String(previous[key]||'').trim());
  // Changing an address must never leave the old house's map pin behind.
  if(moved && !('latitude' in data || 'longitude' in data)){data.latitude=null;data.longitude=null;}
  if('latitude' in data || 'longitude' in data){
    const lat='latitude' in data?data.latitude:previous.latitude;
    const lng='longitude' in data?data.longitude:previous.longitude;
    if(lat==null && lng==null){data.latitude=null;data.longitude=null;}
    else if(typeof lat!=='number'||typeof lng!=='number'||!Number.isFinite(lat)||!Number.isFinite(lng)||lat < -90||lat > 90||lng < -180||lng > 180)invalid('请填写有效且成对的地图经纬度，或同时清空');
    else {data.latitude=lat;data.longitude=lng;}
  }
  const combined = { listing_kind:'sale', rent_period:'week', status:'在售', ...previous, ...data };
  if (!['sale','rent'].includes(combined.listing_kind)) invalid('请选择出售或出租');
  if (combined.listing_kind === 'rent') {
    if (!['week','month'].includes(combined.rent_period)) invalid('租金周期应为每周或每月');
    if (combined.status === '在售') data.status = '在租';
    if (combined.status === '已售') data.status = '已租';
  } else {
    if (combined.status === '在租') data.status = '在售';
    if (combined.status === '已租') data.status = '已售';
    data.bond = null; data.available_from = '';
  }
  const status = data.status || combined.status;
  if (!['在售','已售','在租','已租','下架'].includes(status)) invalid('无效房源状态');
  for (const field of ['price_value','bond','beds','baths','garages']) {
    const value = data[field];
    if (value != null && (!Number.isFinite(value) || value < 0)) invalid('价格、押金和房间数必须是非负数');
  }
  if (data.available_from && !validDate(data.available_from)) invalid('可入住日期格式应为 YYYY-MM-DD');
  for (const field of ['images','floorplans']) {
    if (!(field in data)) continue;
    let images; try { images = JSON.parse(data[field]); } catch (_) { invalid('图片列表格式不正确'); }
    if (!Array.isArray(images) || images.length > 30 || images.some(url=>typeof url !== 'string' || !safeUrl(url,true))) invalid('图片列表包含无效地址，或超过 30 张');
  }
  data.updated_at = new Date().toISOString();
  return data;
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
function aucklandNow() {
  const parts = new Intl.DateTimeFormat('en-NZ',{timeZone:'Pacific/Auckland',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const get = type => parts.find(p=>p.type===type).value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
function validateViewing(body, property) {
  if (!property || !['在售','在租'].includes(property.status)) invalid('该房源当前不接受预约看房');
  if (!String(body.name || '').trim()) invalid('请填写您的称呼');
  if (!String(body.phone || '').trim() && !String(body.email || '').trim()) invalid('请至少填写电话或邮箱');
  const value = String(body.viewing_at || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !validDate(value.slice(0,10)) || Number(value.slice(11,13)) > 23 || Number(value.slice(14)) > 59) invalid('请选择有效的看房日期与时间');
  if (value <= aucklandNow()) invalid('请选择未来的意向时间（新西兰时间）');
  return value;
}
module.exports = { normalizeProperty, validateViewing, aucklandNow };
