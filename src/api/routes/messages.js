import { createSafeRouter } from '../security/router.js';
import { appendMessages, getMessages, addInternalMessage } from '../controllers/messageController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireBotSecret } from '../middleware/botAuth.js';
import { requirePermission } from '../security/policy.js';

const router = createSafeRouter();
router.post('/internal', requireAuth, requirePermission('ticket.note'), addInternalMessage);
router.post('/', requireBotSecret, appendMessages);
router.get('/', requireAuth, requirePermission('ticket.view'), getMessages);
export default router;
