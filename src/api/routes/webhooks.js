import { createSafeRouter } from '../security/router.js';
import {
  list,
  create,
  update,
  remove,
  rotateSecret,
  listDeliveries,
  replayDelivery,
} from '../controllers/webhookController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../security/policy.js';

const router = createSafeRouter();
router.use(requireAuth, requirePermission('webhook.manage'));
router.get('/', list);
router.post('/', create);
router.post('/deliveries/:deliveryId/replay', replayDelivery);
router.get('/:id/deliveries', listDeliveries);
router.post('/:id/rotate-secret', rotateSecret);
router.put('/:id', update);
router.delete('/:id', remove);
export default router;
