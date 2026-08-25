import Notification from '../models/Notification.js';

/**
 * GET /api/notifications
 * Retrieves paginated in-app notifications for the authenticated user.
 */
export const getUserNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const readFilter = req.query.read;

    const query = { user: userId };
    if (readFilter === 'true') query.read = true;
    if (readFilter === 'false') query.read = false;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({ user: userId, read: false })
    ]);

    return res.status(200).json({
      success: true,
      data: {
        notifications,
        unreadCount,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit) || 1,
          limit
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/notifications/unread-count
 * Lightweight endpoint to get current unread count for badges.
 */
export const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    const unreadCount = await Notification.countDocuments({ user: userId, read: false });

    return res.status(200).json({
      success: true,
      data: { unreadCount }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notifications/:id/read
 * Marks a single notification as read.
 */
export const markNotificationAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id;

    const notification = await Notification.findOne({ _id: id, user: userId });
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    notification.read = true;
    notification.readAt = new Date();
    await notification.save();

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
      data: notification
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notifications/read-all
 * Marks all notifications for the authenticated user as read.
 */
export const markAllNotificationsAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;

    await Notification.updateMany(
      { user: userId, read: false },
      { $set: { read: true, readAt: new Date() } }
    );

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/notifications/:id
 * Dismisses / deletes a notification.
 */
export const deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id;

    const result = await Notification.deleteOne({ _id: id, user: userId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Notification removed.'
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getUserNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification
};
