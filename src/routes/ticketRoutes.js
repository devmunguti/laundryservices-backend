import { Router } from 'express';
import {
  getTicketMetrics,
  getTickets,
  getTicketById,
  createTicket,
  addTicketMessage,
  updateTicketStatus
} from '../controllers/ticketController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();

router.use(authenticate);

router.get('/metrics', getTicketMetrics);
router.get('/', getTickets);
router.get('/:id', getTicketById);
router.post('/', createTicket);
router.post('/:id/messages', addTicketMessage);
router.patch('/:id/status', updateTicketStatus);

export default router;
