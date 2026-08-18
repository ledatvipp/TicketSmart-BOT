import { createSafeRouter } from '../security/router.js';
import {
  listKnowledge, getKnowledge, createKnowledge, updateKnowledge, deleteKnowledge,
  previewKnowledgeSearch, searchKnowledgeForBot, reindexKnowledge, importFaqs,
  knowledgeOverview, restoreKnowledgeRevision, archiveKnowledge,
  addKnowledgeAlias, deleteKnowledgeAlias,
} from '../controllers/knowledgeController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireBotSecret } from '../middleware/botAuth.js';
import { requirePermission } from '../security/policy.js';

const router = createSafeRouter();
router.get('/bot/search', requireBotSecret, searchKnowledgeForBot);
router.get('/overview', requireAuth, requirePermission('knowledge.view'), knowledgeOverview);
router.get('/search', requireAuth, requirePermission('knowledge.view'), previewKnowledgeSearch);
router.get('/', requireAuth, requirePermission('knowledge.view'), listKnowledge);
router.post('/reindex/all', requireAuth, requirePermission('knowledge.manage'), reindexKnowledge);
router.post('/import/faqs', requireAuth, requirePermission('knowledge.manage'), importFaqs);
router.get('/:id', requireAuth, requirePermission('knowledge.view'), getKnowledge);
router.post('/', requireAuth, requirePermission('knowledge.manage'), createKnowledge);
router.put('/:id', requireAuth, requirePermission('knowledge.manage'), updateKnowledge);
router.post('/:id/archive', requireAuth, requirePermission('knowledge.manage'), archiveKnowledge);
router.post('/:id/restore/:revisionId', requireAuth, requirePermission('knowledge.manage'), restoreKnowledgeRevision);
router.post('/:id/aliases', requireAuth, requirePermission('knowledge.manage'), addKnowledgeAlias);
router.delete('/:id/aliases/:aliasId', requireAuth, requirePermission('knowledge.manage'), deleteKnowledgeAlias);
router.delete('/:id', requireAuth, requirePermission('knowledge.manage'), deleteKnowledge);
router.post('/reindex/:id', requireAuth, requirePermission('knowledge.manage'), reindexKnowledge);
export default router;
