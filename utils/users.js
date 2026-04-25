/**
 * 用户数据加载公共工具
 *
 * 将 auth.js / reviews.js / user.js 中重复的 loadUserWithWorks 函数统一到此处
 */

const db = require('../config/database');
const { formatUserRow, formatWorkRow, maskPhoneNumber } = require('./serializers');

async function loadUserWithWorks(userId) {
  const row = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!row) {
    return null;
  }
  const works = await db.all(
    'SELECT * FROM user_works WHERE user_id = ? ORDER BY is_pinned DESC, created_at DESC',
    [userId],
  );
  if (!row.masked_phone_number && row.phone_number) {
    row.masked_phone_number = maskPhoneNumber(row.phone_number);
  }
  return formatUserRow(row, works.map(formatWorkRow));
}

module.exports = {
  loadUserWithWorks,
};
