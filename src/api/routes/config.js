import { createSafeRouter } from '../security/router.js';
import { getConfig, updateConfig, publishSetupMessage, sendAnnouncement } from '../controllers/configController.js';
import { deleteOpenRouterKey, getAiProvider, playgroundOpenRouter, setOpenRouterKey, testOpenRouter } from '../controllers/aiProviderController.js';
import { requireAuth } from '../middleware/auth.js';
import { botOrAuth } from '../middleware/botOrAuth.js';
import { requirePermission, requirePermissionOrBot } from '../security/policy.js';

const router = createSafeRouter();
router.get('/', botOrAuth, requirePermissionOrBot('config.manage'), getConfig);
router.get('/ai-provider', requireAuth, requirePermission('config.manage'), getAiProvider);
router.put('/ai-provider/key', requireAuth, requirePermission('config.manage'), setOpenRouterKey);
router.delete('/ai-provider/key', requireAuth, requirePermission('config.manage'), deleteOpenRouterKey);
router.post('/ai-provider/test', requireAuth, requirePermission('config.manage'), testOpenRouter);
router.post('/ai-provider/playground', requireAuth, requirePermission('config.manage'), playgroundOpenRouter);
router.put('/', requireAuth, requirePermission('config.manage'), updateConfig);
router.post('/setup-message', requireAuth, requirePermission('config.manage'), publishSetupMessage);
router.post('/announcement', requireAuth, requirePermission('config.manage'), sendAnnouncement);
export default router;
