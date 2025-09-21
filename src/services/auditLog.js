import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'audit.db');

let db = null;

/**
 * Initialize SQLite database for audit logging
 */
export async function initializeAuditLog() {
  try {
    // Ensure data directory exists
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });

    // Create audit log table with comprehensive tracking
    await db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        user_id TEXT,
        session_id TEXT,
        ip_address TEXT,
        method TEXT,
        endpoint TEXT,
        query_params TEXT,
        request_body TEXT,
        response_status INTEGER,
        response_time INTEGER,
        company_id TEXT,
        resource_type TEXT,
        resource_id TEXT,
        action TEXT,
        old_value TEXT,
        new_value TEXT,
        error_message TEXT,
        metadata TEXT,
        hash TEXT NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_timestamp ON audit_log(timestamp);
      CREATE INDEX IF NOT EXISTS idx_event_type ON audit_log(event_type);
      CREATE INDEX IF NOT EXISTS idx_user_id ON audit_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_endpoint ON audit_log(endpoint);
      CREATE INDEX IF NOT EXISTS idx_resource ON audit_log(resource_type, resource_id);
    `);

    // Create audit summary table for analytics
    await db.exec(`
      CREATE TABLE IF NOT EXISTS audit_summary (
        date TEXT PRIMARY KEY,
        total_requests INTEGER DEFAULT 0,
        unique_users INTEGER DEFAULT 0,
        successful_requests INTEGER DEFAULT 0,
        failed_requests INTEGER DEFAULT 0,
        avg_response_time INTEGER DEFAULT 0,
        endpoints_accessed TEXT,
        resources_modified TEXT
      );
    `);

    console.log('Audit log database initialized');
    
    // Schedule daily summary generation
    setInterval(() => {
      generateDailySummary().catch(console.error);
    }, 24 * 60 * 60 * 1000); // Every 24 hours
    
    return db;
  } catch (error) {
    console.error('Failed to initialize audit log database:', error);
    throw error;
  }
}

/**
 * Generate hash for audit log entry to ensure integrity
 * @param {Object} entry - Audit log entry
 * @returns {string} SHA-256 hash
 */
function generateAuditHash(entry) {
  const content = JSON.stringify({
    timestamp: entry.timestamp,
    event_type: entry.event_type,
    endpoint: entry.endpoint,
    user_id: entry.user_id,
    action: entry.action
  });
  
  return crypto.createHash('sha256')
    .update(content)
    .digest('hex');
}

/**
 * Log an audit event
 * @param {Object} event - Event details
 * @returns {boolean} Success status
 */
export async function logAuditEvent(event) {
  if (!db) {
    await initializeAuditLog();
  }
  
  const entry = {
    timestamp: Date.now(),
    event_type: event.type || 'UNKNOWN',
    user_id: event.user_id || null,
    session_id: event.session_id || null,
    ip_address: event.ip_address || null,
    method: event.method || null,
    endpoint: event.endpoint || null,
    query_params: event.query_params ? JSON.stringify(event.query_params) : null,
    request_body: event.request_body ? JSON.stringify(sanitizeRequestBody(event.request_body)) : null,
    response_status: event.response_status || null,
    response_time: event.response_time || null,
    company_id: event.company_id || process.env.FREEE_COMPANY_ID || null,
    resource_type: event.resource_type || null,
    resource_id: event.resource_id || null,
    action: event.action || null,
    old_value: event.old_value ? JSON.stringify(event.old_value) : null,
    new_value: event.new_value ? JSON.stringify(event.new_value) : null,
    error_message: event.error_message || null,
    metadata: event.metadata ? JSON.stringify(event.metadata) : null
  };
  
  entry.hash = generateAuditHash(entry);
  
  try {
    await db.run(
      `INSERT INTO audit_log (
        timestamp, event_type, user_id, session_id, ip_address,
        method, endpoint, query_params, request_body,
        response_status, response_time, company_id,
        resource_type, resource_id, action,
        old_value, new_value, error_message, metadata, hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.timestamp, entry.event_type, entry.user_id, entry.session_id, entry.ip_address,
        entry.method, entry.endpoint, entry.query_params, entry.request_body,
        entry.response_status, entry.response_time, entry.company_id,
        entry.resource_type, entry.resource_id, entry.action,
        entry.old_value, entry.new_value, entry.error_message, entry.metadata, entry.hash
      ]
    );
    
    return true;
  } catch (error) {
    console.error('Failed to log audit event:', error);
    return false;
  }
}

/**
 * Sanitize request body to remove sensitive information
 * @param {Object} body - Request body
 * @returns {Object} Sanitized body
 */
function sanitizeRequestBody(body) {
  const sanitized = { ...body };
  const sensitiveFields = [
    'password', 'token', 'secret', 'access_token', 
    'refresh_token', 'api_key', 'private_key'
  ];
  
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

/**
 * Audit log middleware for Express
 * @returns {Function} Express middleware
 */
export function auditMiddleware() {
  return async (req, res, next) => {
    const startTime = Date.now();
    const sessionId = crypto.randomUUID();
    
    // Store session ID for later use
    req.auditSessionId = sessionId;
    
    // Override res.json to capture response
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      const responseTime = Date.now() - startTime;
      
      // Log the audit event
      logAuditEvent({
        type: 'API_REQUEST',
        session_id: sessionId,
        user_id: req.user?.id || 'anonymous',
        ip_address: req.ip || req.connection.remoteAddress,
        method: req.method,
        endpoint: req.path,
        query_params: req.query,
        request_body: req.body,
        response_status: res.statusCode,
        response_time: responseTime,
        metadata: {
          user_agent: req.headers['user-agent'],
          referer: req.headers.referer
        }
      }).catch(console.error);
      
      // Send original response
      originalJson(data);
    };
    
    // Log error responses
    res.on('finish', () => {
      if (res.statusCode >= 400) {
        const responseTime = Date.now() - startTime;
        
        logAuditEvent({
          type: 'API_ERROR',
          session_id: sessionId,
          user_id: req.user?.id || 'anonymous',
          ip_address: req.ip || req.connection.remoteAddress,
          method: req.method,
          endpoint: req.path,
          query_params: req.query,
          request_body: req.body,
          response_status: res.statusCode,
          response_time: responseTime,
          error_message: res.statusMessage
        }).catch(console.error);
      }
    });
    
    next();
  };
}

/**
 * Log a data modification event
 * @param {Object} params - Event parameters
 * @returns {boolean} Success status
 */
export async function logDataModification(params) {
  return logAuditEvent({
    type: 'DATA_MODIFICATION',
    ...params,
    action: params.action || 'UPDATE'
  });
}

/**
 * Log an authentication event
 * @param {Object} params - Event parameters
 * @returns {boolean} Success status
 */
export async function logAuthEvent(params) {
  return logAuditEvent({
    type: 'AUTHENTICATION',
    ...params
  });
}

/**
 * Log a system event
 * @param {Object} params - Event parameters
 * @returns {boolean} Success status
 */
export async function logSystemEvent(params) {
  return logAuditEvent({
    type: 'SYSTEM',
    ...params
  });
}

/**
 * Query audit logs
 * @param {Object} filters - Query filters
 * @returns {Array} Audit log entries
 */
export async function queryAuditLogs(filters = {}) {
  if (!db) {
    await initializeAuditLog();
  }
  
  let query = 'SELECT * FROM audit_log WHERE 1=1';
  const params = [];
  
  if (filters.start_date) {
    query += ' AND timestamp >= ?';
    params.push(new Date(filters.start_date).getTime());
  }
  
  if (filters.end_date) {
    query += ' AND timestamp <= ?';
    params.push(new Date(filters.end_date).getTime());
  }
  
  if (filters.event_type) {
    query += ' AND event_type = ?';
    params.push(filters.event_type);
  }
  
  if (filters.user_id) {
    query += ' AND user_id = ?';
    params.push(filters.user_id);
  }
  
  if (filters.endpoint) {
    query += ' AND endpoint LIKE ?';
    params.push(`%${filters.endpoint}%`);
  }
  
  if (filters.resource_type) {
    query += ' AND resource_type = ?';
    params.push(filters.resource_type);
  }
  
  if (filters.resource_id) {
    query += ' AND resource_id = ?';
    params.push(filters.resource_id);
  }
  
  // Add sorting and limiting
  query += ' ORDER BY timestamp DESC';
  
  if (filters.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }
  
  if (filters.offset) {
    query += ' OFFSET ?';
    params.push(filters.offset);
  }
  
  try {
    const rows = await db.all(query, params);
    
    // Parse JSON fields
    return rows.map(row => ({
      ...row,
      query_params: row.query_params ? JSON.parse(row.query_params) : null,
      request_body: row.request_body ? JSON.parse(row.request_body) : null,
      old_value: row.old_value ? JSON.parse(row.old_value) : null,
      new_value: row.new_value ? JSON.parse(row.new_value) : null,
      metadata: row.metadata ? JSON.parse(row.metadata) : null
    }));
  } catch (error) {
    console.error('Failed to query audit logs:', error);
    return [];
  }
}

/**
 * Generate daily audit summary
 * @returns {boolean} Success status
 */
export async function generateDailySummary() {
  if (!db) {
    await initializeAuditLog();
  }
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  
  const today = new Date(yesterday);
  today.setDate(today.getDate() + 1);
  
  const startTime = yesterday.getTime();
  const endTime = today.getTime();
  const dateStr = yesterday.toISOString().split('T')[0];
  
  try {
    // Get summary statistics
    const stats = await db.get(
      `SELECT 
        COUNT(*) as total_requests,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(CASE WHEN response_status < 400 THEN 1 END) as successful_requests,
        COUNT(CASE WHEN response_status >= 400 THEN 1 END) as failed_requests,
        AVG(response_time) as avg_response_time
      FROM audit_log
      WHERE timestamp >= ? AND timestamp < ?`,
      [startTime, endTime]
    );
    
    // Get endpoint access summary
    const endpoints = await db.all(
      `SELECT endpoint, COUNT(*) as count
      FROM audit_log
      WHERE timestamp >= ? AND timestamp < ?
      GROUP BY endpoint
      ORDER BY count DESC
      LIMIT 10`,
      [startTime, endTime]
    );
    
    // Get resource modification summary
    const resources = await db.all(
      `SELECT resource_type, COUNT(*) as count
      FROM audit_log
      WHERE timestamp >= ? AND timestamp < ?
        AND event_type = 'DATA_MODIFICATION'
      GROUP BY resource_type`,
      [startTime, endTime]
    );
    
    // Save summary
    await db.run(
      `INSERT OR REPLACE INTO audit_summary (
        date, total_requests, unique_users, 
        successful_requests, failed_requests, avg_response_time,
        endpoints_accessed, resources_modified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dateStr,
        stats.total_requests,
        stats.unique_users,
        stats.successful_requests,
        stats.failed_requests,
        Math.round(stats.avg_response_time || 0),
        JSON.stringify(endpoints),
        JSON.stringify(resources)
      ]
    );
    
    console.log(`Generated audit summary for ${dateStr}`);
    return true;
  } catch (error) {
    console.error('Failed to generate audit summary:', error);
    return false;
  }
}

/**
 * Get audit statistics
 * @param {Object} params - Query parameters
 * @returns {Object} Audit statistics
 */
export async function getAuditStatistics(params = {}) {
  if (!db) {
    await initializeAuditLog();
  }
  
  const { start_date, end_date } = params;
  
  let query = 'SELECT * FROM audit_summary WHERE 1=1';
  const queryParams = [];
  
  if (start_date) {
    query += ' AND date >= ?';
    queryParams.push(start_date);
  }
  
  if (end_date) {
    query += ' AND date <= ?';
    queryParams.push(end_date);
  }
  
  query += ' ORDER BY date DESC';
  
  try {
    const summaries = await db.all(query, queryParams);
    
    // Parse JSON fields
    const parsedSummaries = summaries.map(summary => ({
      ...summary,
      endpoints_accessed: summary.endpoints_accessed ? JSON.parse(summary.endpoints_accessed) : [],
      resources_modified: summary.resources_modified ? JSON.parse(summary.resources_modified) : []
    }));
    
    // Calculate aggregate statistics
    const totals = parsedSummaries.reduce((acc, summary) => ({
      total_requests: acc.total_requests + summary.total_requests,
      unique_users: Math.max(acc.unique_users, summary.unique_users),
      successful_requests: acc.successful_requests + summary.successful_requests,
      failed_requests: acc.failed_requests + summary.failed_requests
    }), {
      total_requests: 0,
      unique_users: 0,
      successful_requests: 0,
      failed_requests: 0
    });
    
    return {
      summaries: parsedSummaries,
      totals,
      success_rate: totals.total_requests > 0 
        ? (totals.successful_requests / totals.total_requests * 100).toFixed(2) 
        : 0
    };
  } catch (error) {
    console.error('Failed to get audit statistics:', error);
    return null;
  }
}

/**
 * Verify audit log integrity
 * @param {number} id - Log entry ID
 * @returns {boolean} Verification result
 */
export async function verifyAuditLogIntegrity(id) {
  if (!db) {
    await initializeAuditLog();
  }
  
  try {
    const entry = await db.get('SELECT * FROM audit_log WHERE id = ?', [id]);
    
    if (!entry) {
      return false;
    }
    
    const expectedHash = generateAuditHash({
      timestamp: entry.timestamp,
      event_type: entry.event_type,
      endpoint: entry.endpoint,
      user_id: entry.user_id,
      action: entry.action
    });
    
    return entry.hash === expectedHash;
  } catch (error) {
    console.error('Failed to verify audit log integrity:', error);
    return false;
  }
}

/**
 * Export audit logs
 * @param {Object} filters - Query filters
 * @param {string} format - Export format (json, csv)
 * @returns {string} Exported data
 */
export async function exportAuditLogs(filters = {}, format = 'json') {
  const logs = await queryAuditLogs(filters);
  
  if (format === 'json') {
    return JSON.stringify(logs, null, 2);
  } else if (format === 'csv') {
    const headers = [
      'timestamp', 'event_type', 'user_id', 'endpoint', 
      'method', 'response_status', 'response_time'
    ];
    
    const csv = [
      headers.join(','),
      ...logs.map(log => headers.map(h => log[h] || '').join(','))
    ].join('\n');
    
    return csv;
  }
  
  throw new Error(`Unsupported export format: ${format}`);
}