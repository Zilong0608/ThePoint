'use strict';
function normalizeSchedule(value){
  if(value==null || value==='')return '';
  const date=new Date(String(value));
  if(!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(String(value)) || !Number.isFinite(date.getTime())){
    const error=new Error('定时发布时间无效，请重新选择');error.status=400;throw error;
  }
  return date.toISOString();
}
const due = (prefix='') => `(${prefix}scheduled_at='' OR ${prefix}scheduled_at IS NULL OR julianday(${prefix}scheduled_at)<=julianday('now'))`;
module.exports={normalizeSchedule,due};
