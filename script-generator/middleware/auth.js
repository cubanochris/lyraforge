const crypto = require('crypto');

module.exports = function adminAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const [type, encoded] = header.split(' ');
  if (type !== 'Basic' || !encoded) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const decoded = Buffer.from(encoded, 'base64').toString();
  const colonIndex = decoded.indexOf(':');
  const password = decoded.slice(colonIndex + 1);
  try {
    if (!process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Authentication required' });
    const match = password.length === process.env.ADMIN_PASSWORD.length &&
      crypto.timingSafeEqual(Buffer.from(password), Buffer.from(process.env.ADMIN_PASSWORD));
    if (!match) return res.status(401).json({ error: 'Invalid password' });
  } catch (_) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  next();
};
