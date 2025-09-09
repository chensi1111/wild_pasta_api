const response = require("../utils/response_codes");
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_ACCESS_SECRET;
function sendError(res, code, msg, status = 400) {
  return res.status(status).json({ code, msg });
}
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization']; 
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return sendError(res, response.unauthorized, '缺少 access token', 401);
  }
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded; 
    next(); 
  } catch (err) {
    sendError(res, response.invalid_accessToken, '無效的 access token', 401);
  }
}

module.exports = verifyToken;