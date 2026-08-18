// Chấp nhận JWT từ dashboard hoặc bot secret. Actor của dashboard luôn lấy từ JWT;
// X-Bot-Actor chỉ được đọc sau khi bot secret đã được xác minh.
import { authenticateAccessToken } from './auth.js';
import { isValidBotRequest, parseBotActor } from './botAuth.js';

export async function botOrAuth(req, res, next) {
  if (isValidBotRequest(req)) {
    req.authKind = 'bot';
    req.user = parseBotActor(req);
    return next();
  }

  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Cần access token hoặc bot secret', code: 'TOKEN_MISSING' });
  }
  try {
    req.user = await authenticateAccessToken(auth.slice(7));
    req.authKind = 'user';
    next();
  } catch (err) {
    if (err?.name === 'TokenExpiredError') return res.status(401).json({ success: false, code: 'TOKEN_EXPIRED', message: 'Token hết hạn' });
    return res.status(401).json({ success: false, code: 'TOKEN_INVALID', message: 'Token không hợp lệ' });
  }
}
