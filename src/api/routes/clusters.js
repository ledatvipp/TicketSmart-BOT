import { createSafeRouter } from '../security/router.js';
import { getClusters, createCluster, updateCluster, deleteCluster, toggleCluster } from '../controllers/clusterController.js';
import { requireAuth } from '../middleware/auth.js';
import { botOrAuth } from '../middleware/botOrAuth.js';
import { requirePermission, requirePermissionOrBot } from '../security/policy.js';

const router = createSafeRouter();
router.get('/', botOrAuth, requirePermissionOrBot('ticket.view'), getClusters);
router.post('/', requireAuth, requirePermission('cluster.manage'), createCluster);
router.put('/:id', requireAuth, requirePermission('cluster.manage'), updateCluster);
router.delete('/:id', requireAuth, requirePermission('cluster.manage'), deleteCluster);
router.patch('/:id/toggle', requireAuth, requirePermission('cluster.manage'), toggleCluster);
export default router;
