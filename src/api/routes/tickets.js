import { createSafeRouter } from '../security/router.js';
import {
  getTickets, getTicketById, getTicketByChannel, getTicketAiContext, createTicket,
  claimTicket, assignTicket, closeTicket, replyTicket, bulkUpdate,
  claimByChannel, assignByChannel, closeByChannel, moveByChannel, updateTicketWorkflowByChannel,
  updateTicketNote, updateTicketPriority, updateTicketTags, updateTicketWorkflow,
  updateTicketChannel, cancelTicketCreation, watchTicket, unwatchTicket,
  downloadTranscript, getTicketHistory, getTicketMoves, sendTicketToChannel,
} from '../controllers/ticketController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireBotSecret } from '../middleware/botAuth.js';
import { botOrAuth } from '../middleware/botOrAuth.js';
import { requirePermission, requirePermissionOrBot, requireTicketAccess } from '../security/policy.js';

const router = createSafeRouter();

router.get('/', botOrAuth, requirePermissionOrBot('ticket.view'), getTickets);
router.get('/history', botOrAuth, requirePermissionOrBot('ticket.view'), getTicketHistory);
router.post('/bulk', requireAuth, requirePermission('ticket.bulk'), bulkUpdate);

// Bot-only channel operations.
router.get('/by-channel/:channelId/ai-context', requireBotSecret, getTicketAiContext);
router.get('/by-channel/:channelId', requireBotSecret, getTicketByChannel);
router.patch('/by-channel/:channelId/claim', botOrAuth, requirePermissionOrBot('ticket.claim'), claimByChannel);
router.patch('/by-channel/:channelId/assign', botOrAuth, requirePermissionOrBot('ticket.assign'), assignByChannel);
router.patch('/by-channel/:channelId/close', botOrAuth, requirePermissionOrBot('ticket.close'), closeByChannel);
router.patch('/by-channel/:channelId/move', requireBotSecret, moveByChannel);
router.patch('/by-channel/:channelId/workflow', requireBotSecret, updateTicketWorkflowByChannel);
router.post('/', requireBotSecret, createTicket);
router.patch('/:id/channel', requireBotSecret, updateTicketChannel);
router.delete('/:id/creation', requireBotSecret, cancelTicketCreation);

// Dashboard + trusted bot. Object scope is checked by requireTicketAccess/controller.
router.get('/:id', botOrAuth, requirePermissionOrBot('ticket.view'), getTicketById);
router.get('/:id/moves', requireAuth, requirePermission('ticket.view'), getTicketMoves);
router.get('/:id/transcript.md', requireAuth, requirePermission('ticket.export'), downloadTranscript);
router.patch('/:id/claim', botOrAuth, requirePermissionOrBot('ticket.claim'), claimTicket);
router.patch('/:id/assign', botOrAuth, requirePermissionOrBot('ticket.assign'), assignTicket);
router.patch('/:id/close', botOrAuth, requirePermissionOrBot('ticket.close'), closeTicket);
router.post('/:id/reply', requireAuth, requirePermission('ticket.reply'), requireTicketAccess, replyTicket);
router.post('/:id/send-to-channel', botOrAuth, requirePermissionOrBot('ticket.sendToChannel'), requireTicketAccess, sendTicketToChannel);
router.patch('/:id/note', botOrAuth, requirePermissionOrBot('ticket.note'), requireTicketAccess, updateTicketNote);
router.patch('/:id/priority', botOrAuth, requirePermissionOrBot('ticket.priority'), requireTicketAccess, updateTicketPriority);
router.patch('/:id/tags', botOrAuth, requirePermissionOrBot('ticket.tags'), requireTicketAccess, updateTicketTags);
router.patch('/:id/workflow', requireAuth, requirePermission('ticket.workflow'), requireTicketAccess, updateTicketWorkflow);
router.post('/:id/watch', botOrAuth, requirePermissionOrBot('ticket.watch'), requireTicketAccess, watchTicket);
router.post('/:id/unwatch', botOrAuth, requirePermissionOrBot('ticket.watch'), requireTicketAccess, unwatchTicket);

export default router;
