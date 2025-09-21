import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_DIR = path.join(__dirname, '../../logs');
const DATA_DIR = path.join(__dirname, '../../data');
const ERROR_LOG_FILE = path.join(LOG_DIR, 'error.log');
const COMBINED_LOG_FILE = path.join(LOG_DIR, 'combined.log');

/**
 * Log levels
 */
export const LogLevel = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

/**
 * Ensure log and data directories exist
 */
async function ensureLogDirectory() {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create directories:', error);
  }
}

/**
 * Format log entry
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} context - Additional context
 * @returns {string} Formatted log entry
 */
function formatLogEntry(level, message, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    ...context
  };
  
  return JSON.stringify(entry) + '\n';
}

/**
 * Write log to file
 * @param {string} filename - Log file name
 * @param {string} entry - Log entry
 */
async function writeLog(filename, entry) {
  try {
    await ensureLogDirectory();
    await fs.appendFile(filename, entry);
  } catch (error) {
    console.error('Failed to write log:', error);
  }
}

/**
 * Log error with context
 * @param {Error} error - Error object
 * @param {Object} context - Additional context
 */
export async function logError(error, context = {}) {
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    code: error.code,
    status: error.status,
    ...context
  };

  const entry = formatLogEntry(LogLevel.ERROR, error.message, errorInfo);
  
  await Promise.all([
    writeLog(ERROR_LOG_FILE, entry),
    writeLog(COMBINED_LOG_FILE, entry)
  ]);

  // Also log to console in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('Error logged:', errorInfo);
  }
}

/**
 * Log warning
 * @param {string} message - Warning message
 * @param {Object} context - Additional context
 */
export async function logWarn(message, context = {}) {
  const entry = formatLogEntry(LogLevel.WARN, message, context);
  await writeLog(COMBINED_LOG_FILE, entry);

  if (process.env.NODE_ENV !== 'production') {
    console.warn('Warning:', message, context);
  }
}

/**
 * Log info
 * @param {string} message - Info message
 * @param {Object} context - Additional context
 */
export async function logInfo(message, context = {}) {
  const entry = formatLogEntry(LogLevel.INFO, message, context);
  await writeLog(COMBINED_LOG_FILE, entry);

  if (process.env.NODE_ENV !== 'production') {
    console.log('Info:', message, context);
  }
}

/**
 * Log debug
 * @param {string} message - Debug message
 * @param {Object} context - Additional context
 */
export async function logDebug(message, context = {}) {
  if (process.env.NODE_ENV === 'production' && !process.env.DEBUG) {
    return;
  }

  const entry = formatLogEntry(LogLevel.DEBUG, message, context);
  await writeLog(COMBINED_LOG_FILE, entry);

  console.log('Debug:', message, context);
}

/**
 * Log API request
 * @param {string} method - HTTP method
 * @param {string} url - Request URL
 * @param {Object} options - Additional options
 */
export async function logApiRequest(method, url, options = {}) {
  const context = {
    method,
    url,
    ...options
  };

  await logInfo(`API Request: ${method} ${url}`, context);
}

/**
 * Log API response
 * @param {string} method - HTTP method
 * @param {string} url - Request URL
 * @param {number} status - Response status
 * @param {number} duration - Request duration in ms
 */
export async function logApiResponse(method, url, status, duration) {
  const context = {
    method,
    url,
    status,
    duration
  };

  const level = status >= 400 ? LogLevel.ERROR : LogLevel.INFO;
  const message = `API Response: ${method} ${url} - ${status} (${duration}ms)`;

  const entry = formatLogEntry(level, message, context);
  
  if (status >= 400) {
    await writeLog(ERROR_LOG_FILE, entry);
  }
  await writeLog(COMBINED_LOG_FILE, entry);
}

/**
 * Error logger middleware
 * @param {Error} error - Error object
 * @param {Request} req - Request object
 * @param {Response} res - Response object
 * @param {Function} next - Next middleware
 */
export async function errorLoggerMiddleware(error, req, res, next) {
  await logError(error, {
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    body: req.body,
    headers: req.headers,
    ip: req.ip
  });

  next(error);
}

/**
 * Request logger middleware
 * @param {Request} req - Request object
 * @param {Response} res - Response object
 * @param {Function} next - Next middleware
 */
export function requestLoggerMiddleware(req, res, next) {
  const start = Date.now();
  
  res.on('finish', async () => {
    const duration = Date.now() - start;
    await logApiResponse(req.method, req.url, res.statusCode, duration);
  });

  next();
}

/**
 * Clean old log files
 * @param {number} daysToKeep - Number of days to keep logs
 */
export async function cleanOldLogs(daysToKeep = 30) {
  try {
    const files = await fs.readdir(LOG_DIR);
    const now = Date.now();
    const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(LOG_DIR, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtime.getTime() > maxAge) {
        await fs.unlink(filePath);
        console.log(`Deleted old log file: ${file}`);
      }
    }
  } catch (error) {
    console.error('Failed to clean old logs:', error);
  }
}

/**
 * Get log file size
 * @returns {Object} Log file sizes
 */
export async function getLogFileSizes() {
  try {
    const [errorStats, combinedStats] = await Promise.all([
      fs.stat(ERROR_LOG_FILE).catch(() => ({ size: 0 })),
      fs.stat(COMBINED_LOG_FILE).catch(() => ({ size: 0 }))
    ]);

    return {
      error: errorStats.size,
      combined: combinedStats.size,
      total: errorStats.size + combinedStats.size
    };
  } catch (error) {
    console.error('Failed to get log file sizes:', error);
    return { error: 0, combined: 0, total: 0 };
  }
}