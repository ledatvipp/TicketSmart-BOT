import { createSafeRouter } from '../security/router.js';
import { listFaqs, getFaq, createFaq, updateFaq, deleteFaq, findSimilarTickets } from '../controllers/faqController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../security/policy.js';

const router = createSafeRouter();
router.get('/similar/:id', requireAuth, requirePermission('faq.view'), findSimilarTickets);
router.get('/', requireAuth, requirePermission('faq.view'), listFaqs);
router.get('/:id', requireAuth, requirePermission('faq.view'), getFaq);
router.post('/', requireAuth, requirePermission('faq.manage'), createFaq);
router.put('/:id', requireAuth, requirePermission('faq.manage'), updateFaq);
router.delete('/:id', requireAuth, requirePermission('faq.manage'), deleteFaq);
export default router;
