import { createSafeRouter } from '../security/router.js';
import {
  createDetection, updateDetectionStatus, submitFeedback, searchFaqsForBot,
  getDetectionForBot, createActionExecution, intelligenceOverview, listDetections,
  listActionExecutions, reviewFeedback, getConversationForBot, upsertConversationForBot,
  clearConversationForBot, listConversations, approvedTrainingExamplesForBot,
} from '../controllers/intelligenceController.js';
import { requireBotSecret } from '../middleware/botAuth.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../security/policy.js';

const router = createSafeRouter();
router.post('/detections', requireBotSecret, createDetection);
router.get('/detections/:id/bot', requireBotSecret, getDetectionForBot);
router.patch('/detections/:id', requireBotSecret, updateDetectionStatus);
router.post('/feedback', requireBotSecret, submitFeedback);
router.post('/actions', requireBotSecret, createActionExecution);
router.get('/faqs', requireBotSecret, searchFaqsForBot);
router.get('/training-examples/bot', requireBotSecret, approvedTrainingExamplesForBot);
router.get('/conversations/context', requireBotSecret, getConversationForBot);
router.post('/conversations/context', requireBotSecret, upsertConversationForBot);
router.delete('/conversations/context', requireBotSecret, clearConversationForBot);

router.get('/overview', requireAuth, requirePermission('intelligence.view'), intelligenceOverview);
router.get('/detections', requireAuth, requirePermission('intelligence.view'), listDetections);
router.get('/actions', requireAuth, requirePermission('intelligence.view'), listActionExecutions);
router.get('/conversations', requireAuth, requirePermission('intelligence.view'), listConversations);
router.patch('/feedback/:id', requireAuth, requirePermission('intelligence.review'), reviewFeedback);
export default router;
