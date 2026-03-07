// server/middleware/role.js
module.exports = function(role) {
  return function(req, res, next) {
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Forbidden - Insufficient permissions' });
    }
    next();
  };
};