import express from 'express';
import { 
  queryAuditLogs, 
  getAuditStatistics, 
  exportAuditLogs,
  verifyAuditLogIntegrity 
} from '../services/auditLog.js';

const router = express.Router();

// -----------------------
// Query audit logs
// -----------------------
router.get('/logs', async (req, res, next) => {
  try {
    const {
      start_date,
      end_date,
      event_type,
      user_id,
      endpoint,
      resource_type,
      resource_id,
      limit = 100,
      offset = 0
    } = req.query;
    
    const filters = {
      start_date,
      end_date,
      event_type,
      user_id,
      endpoint,
      resource_type,
      resource_id,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };
    
    const logs = await queryAuditLogs(filters);
    
    res.json({
      logs,
      metadata: {
        limit: filters.limit,
        offset: filters.offset,
        count: logs.length,
        filters: Object.keys(filters).reduce((acc, key) => {
          if (filters[key] !== undefined && filters[key] !== null) {
            acc[key] = filters[key];
          }
          return acc;
        }, {})
      }
    });
  } catch (error) {
    next(error);
  }
});

// -----------------------
// Get audit statistics
// -----------------------
router.get('/statistics', async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    
    const stats = await getAuditStatistics({
      start_date,
      end_date
    });
    
    res.json({
      statistics: stats,
      metadata: {
        period: {
          start: start_date || 'all',
          end: end_date || 'all'
        },
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

// -----------------------
// Export audit logs
// -----------------------
router.get('/export', async (req, res, next) => {
  try {
    const {
      start_date,
      end_date,
      event_type,
      format = 'json'
    } = req.query;
    
    const filters = {
      start_date,
      end_date,
      event_type
    };
    
    const exported = await exportAuditLogs(filters, format);
    
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.csv"`);
      res.send(exported);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.json"`);
      res.send(exported);
    }
  } catch (error) {
    next(error);
  }
});

// -----------------------
// Verify log integrity
// -----------------------
router.get('/verify/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const isValid = await verifyAuditLogIntegrity(parseInt(id));
    
    res.json({
      log_id: id,
      integrity_valid: isValid,
      verified_at: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// -----------------------
// Get audit summary by event type
// -----------------------
router.get('/summary/events', async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    
    const filters = { start_date, end_date };
    const logs = await queryAuditLogs(filters);
    
    // Group by event type
    const summary = logs.reduce((acc, log) => {
      if (!acc[log.event_type]) {
        acc[log.event_type] = {
          count: 0,
          avg_response_time: 0,
          total_response_time: 0,
          endpoints: new Set(),
          users: new Set()
        };
      }
      
      const type = acc[log.event_type];
      type.count++;
      
      if (log.response_time) {
        type.total_response_time += log.response_time;
        type.avg_response_time = type.total_response_time / type.count;
      }
      
      if (log.endpoint) type.endpoints.add(log.endpoint);
      if (log.user_id) type.users.add(log.user_id);
      
      return acc;
    }, {});
    
    // Convert sets to arrays for JSON serialization
    Object.keys(summary).forEach(key => {
      summary[key].endpoints = Array.from(summary[key].endpoints);
      summary[key].users = Array.from(summary[key].users);
      summary[key].unique_endpoints = summary[key].endpoints.length;
      summary[key].unique_users = summary[key].users.length;
      delete summary[key].total_response_time;
    });
    
    res.json({
      summary,
      metadata: {
        period: {
          start: start_date || 'all',
          end: end_date || 'all'
        },
        total_logs: logs.length,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

// -----------------------
// Get audit summary by user
// -----------------------
router.get('/summary/users', async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    
    const filters = { start_date, end_date };
    const logs = await queryAuditLogs(filters);
    
    // Group by user
    const summary = logs.reduce((acc, log) => {
      const userId = log.user_id || 'anonymous';
      
      if (!acc[userId]) {
        acc[userId] = {
          request_count: 0,
          error_count: 0,
          endpoints_accessed: new Set(),
          event_types: new Set(),
          avg_response_time: 0,
          total_response_time: 0,
          first_activity: log.timestamp,
          last_activity: log.timestamp
        };
      }
      
      const user = acc[userId];
      user.request_count++;
      
      if (log.response_status >= 400) {
        user.error_count++;
      }
      
      if (log.response_time) {
        user.total_response_time += log.response_time;
        user.avg_response_time = user.total_response_time / user.request_count;
      }
      
      if (log.endpoint) user.endpoints_accessed.add(log.endpoint);
      if (log.event_type) user.event_types.add(log.event_type);
      
      user.first_activity = Math.min(user.first_activity, log.timestamp);
      user.last_activity = Math.max(user.last_activity, log.timestamp);
      
      return acc;
    }, {});
    
    // Convert sets to arrays and format timestamps
    Object.keys(summary).forEach(key => {
      summary[key].endpoints_accessed = Array.from(summary[key].endpoints_accessed);
      summary[key].event_types = Array.from(summary[key].event_types);
      summary[key].unique_endpoints = summary[key].endpoints_accessed.length;
      summary[key].error_rate = summary[key].request_count > 0 
        ? (summary[key].error_count / summary[key].request_count * 100).toFixed(2) 
        : 0;
      summary[key].first_activity = new Date(summary[key].first_activity).toISOString();
      summary[key].last_activity = new Date(summary[key].last_activity).toISOString();
      delete summary[key].total_response_time;
    });
    
    res.json({
      summary,
      metadata: {
        period: {
          start: start_date || 'all',
          end: end_date || 'all'
        },
        unique_users: Object.keys(summary).length,
        total_logs: logs.length,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;