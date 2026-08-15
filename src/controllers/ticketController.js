import Ticket from '../models/Ticket.js';
import User from '../models/User.js';
import { createAuditLog } from '../services/auditLogService.js';

/**
 * GET /api/tickets/metrics
 * Tally ticket statuses and urgent priorities for overview analytics
 */
export const getTicketMetrics = async (req, res, next) => {
  try {
    const [total, openCount, inProgressCount, resolvedCount, closedCount, urgentCount] = await Promise.all([
      Ticket.countDocuments({}),
      Ticket.countDocuments({ status: 'Open' }),
      Ticket.countDocuments({ status: 'In_Progress' }),
      Ticket.countDocuments({ status: 'Resolved' }),
      Ticket.countDocuments({ status: 'Closed' }),
      Ticket.countDocuments({ priority: { $in: ['Urgent', 'High'] }, status: { $ne: 'Resolved' } })
    ]);

    return res.status(200).json({
      success: true,
      data: {
        total,
        open: openCount,
        inProgress: inProgressCount,
        resolved: resolvedCount,
        closed: closedCount,
        urgent: urgentCount
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tickets
 * Role-filtered ticket listing (Customer/Provider: own tickets; Admin: all tickets with filters)
 */
export const getTickets = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const { status, priority, search } = req.query;
    const query = {};

    // Role-based access restriction
    if (req.user.role !== 'admin') {
      query.user = req.user.id;
    }

    if (status && status !== 'All') {
      query.status = status;
    }

    if (priority && priority !== 'All') {
      query.priority = priority;
    }

    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [{ ticketId: searchRegex }, { subject: searchRegex }];
    }

    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .populate('user', 'fullName email role phone')
        .populate('assignedAdmin', 'fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Ticket.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        tickets,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tickets/:id
 */
export const getTicketById = async (req, res, next) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('user', 'fullName email role phone')
      .populate('assignedAdmin', 'fullName')
      .populate('messages.sender', 'fullName role email');

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (req.user.role !== 'admin' && ticket.user._id.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    return res.status(200).json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/tickets
 * Create new support ticket
 */
export const createTicket = async (req, res, next) => {
  try {
    const { subject, initialMessage, priority = 'Medium', orderId } = req.body;

    if (!subject || !initialMessage) {
      return res.status(400).json({ success: false, message: 'Subject and initial message are required.' });
    }

    const ticket = new Ticket({
      user: req.user.id,
      subject,
      priority,
      order: orderId || null,
      messages: [
        {
          sender: req.user.id,
          text: initialMessage,
          createdAt: new Date()
        }
      ]
    });

    await ticket.save();

    await createAuditLog({
      req,
      user: req.user,
      action: 'Ticket Created',
      details: `Created support ticket ${ticket.ticketId}: '${subject}'`,
      status: 'Success',
      category: 'System'
    });

    return res.status(201).json({
      success: true,
      message: 'Support ticket created successfully',
      data: ticket
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/tickets/:id/messages
 * Append reply message to ticket thread
 */
export const addTicketMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!text || text.trim() === '') {
      return res.status(400).json({ success: false, message: 'Message text is required.' });
    }

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (req.user.role !== 'admin' && ticket.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    ticket.messages.push({
      sender: req.user.id,
      text: text.trim(),
      createdAt: new Date()
    });

    if (ticket.status === 'Open' && req.user.role === 'admin') {
      ticket.status = 'In_Progress';
    }

    await ticket.save();

    return res.status(200).json({
      success: true,
      message: 'Message added successfully',
      data: ticket
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/tickets/:id/status
 * Update ticket status & priority (Admin or ticket owner to close)
 */
export const updateTicketStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, priority } = req.body;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (req.user.role !== 'admin' && ticket.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (status) ticket.status = status;
    if (priority && req.user.role === 'admin') ticket.priority = priority;

    await ticket.save();

    await createAuditLog({
      req,
      user: req.user,
      action: 'Ticket Status Updated',
      details: `Updated ticket ${ticket.ticketId} status to '${ticket.status}'`,
      status: 'Success',
      category: 'System'
    });

    return res.status(200).json({
      success: true,
      message: `Ticket status updated to ${ticket.status}`,
      data: ticket
    });
  } catch (error) {
    next(error);
  }
};
