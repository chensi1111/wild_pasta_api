const crypto = require('crypto');

/**
 * 生成綠界 CheckMacValue
 * @param {object} params 綠界回傳的欄位
 * @param {string} hashKey 綠界 HashKey
 * @param {string} hashIV  綠界 HashIV
 * @returns {string} CheckMacValue
 */
function genCheckMacValue(params, hashKey, hashIV) {
  // 1. 排除 CheckMacValue 本身
  const entries = Object.entries(params)
    .filter(([key]) => key !== 'CheckMacValue')
    .sort(([a], [b]) => a.localeCompare(b, 'en', { sensitivity: 'base' }));

  // 2. 組成字串 HashKey=xxx&key1=val1&key2=val2...&HashIV=xxx
  let raw = `HashKey=${hashKey}&` +
            entries.map(([k, v]) => `${k}=${v}`).join('&') +
            `&HashIV=${hashIV}`;

  // 3. URL encode 並轉小寫
  raw = encodeURIComponent(raw).toLowerCase();

  // 4. 替換特殊字元，符合綠界規則
  raw = raw.replace(/%20/g, '+')
           .replace(/%21/g, '!')
           .replace(/%28/g, '(')
           .replace(/%29/g, ')')
           .replace(/%2a/g, '*')
           .replace(/%2d/g, '-')
           .replace(/%2e/g, '.')
           .replace(/%5f/g, '_');

  // 5. SHA256 加密並轉大寫
  const hash = crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
  return hash;
}

module.exports = { genCheckMacValue };