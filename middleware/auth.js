const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      _id: decoded.userId,
      role: decoded.role,
      name: decoded.name,
      email: decoded.email,
      phone: decoded.phone,
      company: decoded.company,
      position: decoded.position
    };
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};