import { createSafeRouter } from '../security/router.js';
import { runAutoActions } from '../controllers/autoActionsController.js';
import { requireBotSecret } from '../middleware/botAuth.js';

const router = createSafeRouter();
router.post('/run', requireBotSecret, runAutoActions);
export default router;
