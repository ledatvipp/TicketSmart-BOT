import { createSafeRouter } from '../security/router.js';
import { list, create, update, remove } from '../controllers/autoTagController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../security/policy.js';

const router = createSafeRouter();
router.use(requireAuth, requirePermission('config.manage'));
router.get('/', list);
router.post('/', create);
router.put('/:id', update);
router.delete('/:id', remove);
export default router;
