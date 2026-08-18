import { createSafeRouter } from '../security/router.js';
import { discordCallback, localLogin, refresh, logout, logoutAll, getMe } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = createSafeRouter();
router.post('/discord', discordCallback);
router.post('/local', localLogin);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.post('/logout-all', requireAuth, logoutAll);
router.get('/me', requireAuth, getMe);
export default router;
