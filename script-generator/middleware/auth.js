const crypto = require('crypto');

// Returns true if the request carries HTTP Basic auth with the correct admin password.
// Used both by the adminAuth middleware and by routes that conditionally expose
// admin-only fields (e.g. full client record vs. public subset).
function isAdmin(req) {
  const header = req.headers['authorization'] || '';
  const [type, encoded] = header.split(' ');
  if (type !== 'Basic' || !encoded) return false;
  if (!process.env.ADMIN_PASSWORD) return false;
  const decoded = Buffer.from(encoded, 'base64').toString();
  const password = decoded.slice(decoded.indexOf(':') + 1);
  try {
    return password.length === process.env.ADMIN_PASSWORD.length &&
      crypto.timingSafeEqual(Buffer.from(password), Buffer.from(process.env.ADMIN_PASSWORD));
  } catch (_) {
    return false;
  }
}

// Express middleware: rejects with 401 unless the request authenticates as admin.
function adminAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const [type, encoded] = header.split(' ');
  if (type !== 'Basic' || !encoded || !process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  next();
}

module.exports = { adminAuth, isAdmin };
