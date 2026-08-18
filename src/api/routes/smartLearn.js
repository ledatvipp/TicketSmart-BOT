import { createSafeRouter } from '../security/router.js';
import { requireBotSecret } from '../middleware/botAuth.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../security/policy.js';
import {
  createCandidateForBot, getCandidateForBot, saveDeliveryRefsForBot, reviewCandidateForBot,
  listCandidates, getCandidate, reviewCandidateFromDashboard, smartLearnOverview,
} from '../controllers/smartLearnController.js';

const router = createSafeRouter();
router.post('/candidates/bot', requireBotSecret, createCandidateForBot);
router.get('/candidates/:id/bot', requireBotSecret, getCandidateForBot);
router.patch('/candidates/:id/delivery/bot', requireBotSecret, saveDeliveryRefsForBot);
router.post('/candidates/:id/review/bot', requireBotSecret, reviewCandidateForBot);
router.get('/overview', requireAuth, requirePermission('smartlearn.view'), smartLearnOverview);
router.get('/candidates', requireAuth, requirePermission('smartlearn.view'), listCandidates);
router.get('/candidates/:id', requireAuth, requirePermission('smartlearn.view'), getCandidate);
router.post('/candidates/:id/review', requireAuth, requirePermission('smartlearn.review'), reviewCandidateFromDashboard);
export default router;
