// Router quản lý staff
import { createSafeRouter } from '../security/router.js';
import {
  getStaff,
  addStaff,
  updateStaffRole,
  deleteStaff,
  getLeaderboard,
  getStaffInfo,
} from '../controllers/staffController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { botOrAuth } from '../middleware/botOrAuth.js';
import { requirePermission } from '../security/policy.js';

const router = createSafeRouter();

// Đặt trước /:discordId để tránh conflict routing
router.get('/leaderboard', requireAuth, requirePermission('analytics.view'), getLeaderboard);
router.get('/', botOrAuth, requireAdmin, getStaff);

// Cả web + bot (botOrAuth)
router.post('/', botOrAuth, requireAdmin, addStaff);
router.patch('/:discordId/role', botOrAuth, requireAdmin, updateStaffRole);
router.delete('/:discordId', botOrAuth, requireAdmin, deleteStaff);

// Info chi tiết 1 staff
router.get('/:discordId', botOrAuth, requireAdmin, getStaffInfo);

export default router;
