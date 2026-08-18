import { createSafeRouter } from '../security/router.js';
import { listCanned, createCanned, updateCanned, deleteCanned, lookupCanned } from '../controllers/cannedController.js';
import { requireAuth } from '../middleware/auth.js';
import { botOrAuth } from '../middleware/botOrAuth.js';
import { requireBotSecret } from '../middleware/botAuth.js';
import { requirePermission, requirePermissionOrBot } from '../security/policy.js';

const router = createSafeRouter();
router.get('/lookup/:shortcut', requireBotSecret, lookupCanned);
router.get('/', botOrAuth, requirePermissionOrBot('canned.view'), listCanned);
router.post('/', requireAuth, requirePermission('canned.manage'), createCanned);
router.put('/:id', requireAuth, requirePermission('canned.manage'), updateCanned);
router.delete('/:id', requireAuth, requirePermission('canned.manage'), deleteCanned);
export default router;
