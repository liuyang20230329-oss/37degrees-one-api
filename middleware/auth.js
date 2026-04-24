const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || '37degrees-dev-secret';

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
