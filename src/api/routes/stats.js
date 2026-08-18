import { createSafeRouter } from '../security/router.js';
import {
  getOverview, getChart, getByOption,
  getHeatmap, getTopRequesters, getDistribution, getTagCloud, getMoveAnalytics, exportMoveCsv, exportCsv,
} from '../controllers/statsController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../security/policy.js';

const router = createSafeRouter();
router.use(requireAuth, requirePermission('analytics.view'));
router.get('/overview', getOverview);
router.get('/chart', getChart);
router.get('/by-option', getByOption);
router.get('/heatmap', getHeatmap);
router.get('/top-requesters', getTopRequesters);
router.get('/distribution', getDistribution);
router.get('/tag-cloud', getTagCloud);
router.get('/moves', getMoveAnalytics);
router.get('/moves/export.csv', requirePermission('analytics.export'), exportMoveCsv);
router.get('/export.csv', requirePermission('analytics.export'), exportCsv);
export default router;
