/**
 * 认证中间件 - JWT Token 签发与校验
 *
 * 提供两个核心能力：
 * - signToken(user)：根据用户信息生成 JWT，有效期 7 天
 * - authenticateToken(req, res, next)：Express 中间件，从 Authorization 头中
 *   提取 Bearer Token 并验证，验证通过后将解码后的 payload 挂载到 req.auth
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || '37degrees-dev-secret';

module.exports.JWT_SECRET = JWT_SECRET;

function signToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      phoneNumber: user.phone_number,
    },
    JWT_SECRET,
    {
      expiresIn: '7d',
    },
  );
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    res.status(401).json({
      error: '需要登录后继续访问。',
    });
    return;
  }

  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch (_) {
    res.status(401).json({
      error: '登录态已失效，请重新登录。',
    });
  }
}

module.exports = {
  authenticateToken,
  signToken,
};
