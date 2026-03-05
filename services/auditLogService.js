const AuditLog = require('../models/auditLogModel');

/**
 * Audit Log Service
 * Provides centralized audit logging for all critical exam-related operations
 * Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8
 */

/**
 * Log an audit event
 * 
 * @param {Object} params - Audit event parameters
 * @param {ObjectId} params.userId - ID of user performing the action
 * @param {String} params.action - Action being performed (must match enum in model)
 * @param {String} params.resource - Resource type (exam, submission, result, etc.)
 * @param {ObjectId} params.resourceId - ID of the resource being acted upon
 * @param {Object} params.details - Additional details about the action
 * @param {String} params.ipAddress - IP address of the request
 * @param {String} params.userAgent - User agent string from the request
 * 
 * @returns {Promise<AuditLog>} Created audit log entry
 */
const logAuditEvent = async ({
  userId,
  action,
  resource,
  resourceId,
  details = {},
  ipAddress,
  userAgent
}) => {
  try {
    // Validate required fields
    if (!userId || !action || !resource || !resourceId || !ipAddress || !userAgent) {
      console.error('Missing required fields for audit log:', {
        userId: !!userId,
        action: !!action,
        resource: !!resource,
        resourceId: !!resourceId,
        ipAddress: !!ipAddress,
        userAgent: !!userAgent
      });
      throw new Error('Missing required fields for audit log');
    }

    // Create audit log entry
    const auditLog = await AuditLog.create({
      userId,
      action,
      resource,
      resourceId,
      details,
      ipAddress,
      userAgent
    });

    return auditLog;
  } catch (error) {
    // Log error but don't throw - audit logging should not break main functionality
    console.error('Error creating audit log:', error);
    return null;
  }
};

/**
 * Get audit logs for a specific user
 * 
 * @param {ObjectId} userId - User ID to fetch logs for
 * @param {Object} options - Query options
 * @param {Number} options.limit - Maximum number of logs to return
 * @param {Number} options.skip - Number of logs to skip (for pagination)
 * @param {String} options.action - Filter by specific action
 * @param {Date} options.startDate - Filter logs after this date
 * @param {Date} options.endDate - Filter logs before this date
 * 
 * @returns {Promise<Array<AuditLog>>} Array of audit logs
 */
const getUserAuditLogs = async (userId, options = {}) => {
  try {
    const {
      limit = 50,
      skip = 0,
      action,
      startDate,
      endDate
    } = options;

    const query = { userId };

    if (action) {
      query.action = action;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate('userId', 'name email role')
      .lean();

    return logs;
  } catch (error) {
    console.error('Error fetching user audit logs:', error);
    throw error;
  }
};

/**
 * Get audit logs for a specific resource
 * 
 * @param {String} resource - Resource type (exam, submission, result, etc.)
 * @param {ObjectId} resourceId - Resource ID to fetch logs for
 * @param {Object} options - Query options
 * @param {Number} options.limit - Maximum number of logs to return
 * @param {Number} options.skip - Number of logs to skip (for pagination)
 * 
 * @returns {Promise<Array<AuditLog>>} Array of audit logs
 */
const getResourceAuditLogs = async (resource, resourceId, options = {}) => {
  try {
    const { limit = 50, skip = 0 } = options;

    const logs = await AuditLog.find({ resource, resourceId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate('userId', 'name email role')
      .lean();

    return logs;
  } catch (error) {
    console.error('Error fetching resource audit logs:', error);
    throw error;
  }
};

/**
 * Get audit logs by action type
 * 
 * @param {String} action - Action type to filter by
 * @param {Object} options - Query options
 * @param {Number} options.limit - Maximum number of logs to return
 * @param {Number} options.skip - Number of logs to skip (for pagination)
 * @param {Date} options.startDate - Filter logs after this date
 * @param {Date} options.endDate - Filter logs before this date
 * 
 * @returns {Promise<Array<AuditLog>>} Array of audit logs
 */
const getAuditLogsByAction = async (action, options = {}) => {
  try {
    const {
      limit = 50,
      skip = 0,
      startDate,
      endDate
    } = options;

    const query = { action };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate('userId', 'name email role')
      .lean();

    return logs;
  } catch (error) {
    console.error('Error fetching audit logs by action:', error);
    throw error;
  }
};

/**
 * Get audit statistics
 * 
 * @param {Object} options - Query options
 * @param {Date} options.startDate - Start date for statistics
 * @param {Date} options.endDate - End date for statistics
 * 
 * @returns {Promise<Object>} Audit statistics
 */
const getAuditStatistics = async (options = {}) => {
  try {
    const { startDate, endDate } = options;

    const matchStage = {};
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) {
        matchStage.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        matchStage.createdAt.$lte = new Date(endDate);
      }
    }

    const stats = await AuditLog.aggregate([
      ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    const totalLogs = await AuditLog.countDocuments(matchStage);

    return {
      totalLogs,
      actionBreakdown: stats
    };
  } catch (error) {
    console.error('Error fetching audit statistics:', error);
    throw error;
  }
};

module.exports = {
  logAuditEvent,
  getUserAuditLogs,
  getResourceAuditLogs,
  getAuditLogsByAction,
  getAuditStatistics
};
