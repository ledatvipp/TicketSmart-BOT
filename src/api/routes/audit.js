import { createSafeRouter } from '../security/router.js';
import { getAuditLog } from '../controllers/auditController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../security/policy.js';

const router = createSafeRouter();
router.get('/', requireAuth, requirePermission('audit.view'), getAuditLog);

export default router;
