module.exports = function adminAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const [type, encoded] = header.split(' ');
  if (type !== 'Basic' || !encoded) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const decoded = Buffer.from(encoded, 'base64').toString();
  const colonIndex = decoded.indexOf(':');
  const password = decoded.slice(colonIndex + 1);
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  next();
};
