'use strict';
const crypto=require('node:crypto');
function hashPassword(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(pw, salt, hash) {
  const test = crypto.scryptSync(pw, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(test), Buffer.from(hash));
}


module.exports={hashPassword,verifyPassword};
