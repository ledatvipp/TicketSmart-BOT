import { createSafeRouter } from '../security/router.js';
import { listBanners, createBanner, deleteBanner } from '../controllers/bannersController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../security/policy.js';

const router = createSafeRouter();
router.use(requireAuth, requirePermission('banner.manage'));
router.get('/', listBanners);
router.post('/', createBanner);
router.delete('/:id', deleteBanner);
export default router;
