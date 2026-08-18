import { createSafeRouter } from '../security/router.js';
import { submitRating, listRatings, ratingsByStaff } from '../controllers/ratingController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireBotSecret } from '../middleware/botAuth.js';
import { requirePermission } from '../security/policy.js';

const router = createSafeRouter();
router.post('/', requireBotSecret, submitRating);
router.get('/', requireAuth, requirePermission('analytics.view'), listRatings);
router.get('/by-staff', requireAuth, requirePermission('analytics.view'), ratingsByStaff);
export default router;
