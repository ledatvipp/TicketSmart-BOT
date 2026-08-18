// Router quản lý options
import { createSafeRouter } from '../security/router.js';
import {
  getOptions,
  getOptionById,
  createOption,
  updateOption,
  deleteOption,
  toggleOption,
} from '../controllers/optionController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { botOrAuth } from '../middleware/botOrAuth.js';
import { requirePermission, requirePermissionOrBot } from '../security/policy.js';

const router = createSafeRouter();

// GET /api/options — Danh sách options (dashboard hoặc bot đã xác thực)
router.get('/', botOrAuth, requirePermissionOrBot('ticket.view'), getOptions);

// GET /api/options/:id — Chi tiết option (yêu cầu auth)
router.get('/:id', requireAuth, requirePermission('ticket.view'), getOptionById);

// POST /api/options — Tạo option mới (yêu cầu ADMIN)
router.post('/', requireAuth, requireAdmin, createOption);

// PUT /api/options/:id — Cập nhật option (yêu cầu ADMIN)
router.put('/:id', requireAuth, requireAdmin, updateOption);

// DELETE /api/options/:id — Xóa option (yêu cầu ADMIN)
router.delete('/:id', requireAuth, requireAdmin, deleteOption);

// PATCH /api/options/:id/toggle — Toggle active/inactive (yêu cầu ADMIN)
router.patch('/:id/toggle', requireAuth, requireAdmin, toggleOption);

export default router;
