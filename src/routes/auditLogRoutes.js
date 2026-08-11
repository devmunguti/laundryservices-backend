import { Router } from 'express';
import { getAuditLogs, getAuditMetrics, exportAuditLogs } from '../controllers/auditLogController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';

const router = Router();

// Protect all audit log endpoints: Authentication + Admin Authorization required
router.use(authenticate, authorizeRoles('admin'));

router.get('/', getAuditLogs);
router.get('/metrics', getAuditMetrics);
router.get('/export', exportAuditLogs);

export default router;
