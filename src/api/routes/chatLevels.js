import { createSafeRouter } from '../security/router.js';
import { botOrAuth } from '../middleware/botOrAuth.js';
import { requirePermissionOrBot } from '../security/policy.js';
import { requireMinecraftLevelSignature } from '../middleware/minecraftLevelAuth.js';
import {
  claimMinecraftGrants,
  completeMinecraftGrant,
  deferMinecraftGrant,
  getLeaderboard,
  getProfile,
  getSetupStatus,
  listGrants,
  retryGrant,
} from '../controllers/chatLevelController.js';

const router = createSafeRouter();

// Bot reads these for Discord commands; dashboard users need the existing config.manage permission.
router.get('/leaderboard', botOrAuth, requirePermissionOrBot('config.manage'), getLeaderboard);
router.get('/profiles/:userId', botOrAuth, requirePermissionOrBot('config.manage'), getProfile);
router.get('/grants', botOrAuth, requirePermissionOrBot('config.manage'), listGrants);
router.post('/grants/:id/retry', botOrAuth, requirePermissionOrBot('config.manage'), retryGrant);
router.get('/setup-status', botOrAuth, requirePermissionOrBot('config.manage'), getSetupStatus);

// Deliberately separate from dashboard/bot credentials: this is the reusable LobbySign HMAC boundary.
router.post('/minecraft/grants/claim', requireMinecraftLevelSignature, claimMinecraftGrants);
router.post('/minecraft/grants/complete', requireMinecraftLevelSignature, completeMinecraftGrant);
router.post('/minecraft/grants/defer', requireMinecraftLevelSignature, deferMinecraftGrant);

export default router;
