import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'cache.db');

let db = null;

/**
 * Initialize SQLite database for caching
 */
export async function initializeCache() {
  try {
    // Ensure data directory exists
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });

    // Create cache table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        cache_key TEXT PRIMARY KEY,
        endpoint TEXT NOT NULL,
        data TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        access_count INTEGER DEFAULT 0,
        last_accessed INTEGER
      );
      
      CREATE INDEX IF NOT EXISTS idx_endpoint ON cache(endpoint);
      CREATE INDEX IF NOT EXISTS idx_expires_at ON cache(expires_at);
    `);

    // Create cache statistics table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS cache_stats (
        endpoint TEXT PRIMARY KEY,
        hit_count INTEGER DEFAULT 0,
        miss_count INTEGER DEFAULT 0,
        total_size INTEGER DEFAULT 0,
        last_cleared INTEGER
      );
    `);

    console.log('Cache database initialized');
    
    // Schedule periodic cleanup
    setInterval(() => {
      cleanExpiredCache().catch(console.error);
    }, 60 * 60 * 1000); // Every hour
    
    return db;
  } catch (error) {
    console.error('Failed to initialize cache database:', error);
    throw error;
  }
}

/**
 * Generate cache key from parameters
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Query parameters
 * @returns {string} Cache key
 */
function generateCacheKey(endpoint, params = {}) {
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      if (params[key] !== undefined && params[key] !== null) {
        acc[key] = params[key];
      }
      return acc;
    }, {});
  
  const paramString = JSON.stringify(sortedParams);
  const hash = crypto.createHash('sha256')
    .update(`${endpoint}:${paramString}`)
    .digest('hex');
  
  return hash;
}

/**
 * Get data from cache
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Query parameters
 * @returns {Object|null} Cached data or null if not found/expired
 */
export async function getFromCache(endpoint, params = {}) {
  if (!db) {
    await initializeCache();
  }
  
  const cacheKey = generateCacheKey(endpoint, params);
  const now = Date.now();
  
  try {
    const row = await db.get(
      `SELECT * FROM cache 
       WHERE cache_key = ? AND expires_at > ?`,
      [cacheKey, now]
    );
    
    if (row) {
      // Update access statistics
      await db.run(
        `UPDATE cache 
         SET access_count = access_count + 1, 
             last_accessed = ?
         WHERE cache_key = ?`,
        [now, cacheKey]
      );
      
      // Update hit statistics
      await updateCacheStats(endpoint, true);
      
      return {
        data: JSON.parse(row.data),
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
        cached_at: row.created_at,
        expires_at: row.expires_at
      };
    }
    
    // Update miss statistics
    await updateCacheStats(endpoint, false);
    return null;
  } catch (error) {
    console.error('Cache read error:', error);
    return null;
  }
}

/**
 * Save data to cache
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Query parameters
 * @param {any} data - Data to cache
 * @param {Object} options - Cache options
 * @returns {boolean} Success status
 */
export async function saveToCache(endpoint, params = {}, data, options = {}) {
  if (!db) {
    await initializeCache();
  }
  
  const {
    ttl = 300000, // Default 5 minutes
    metadata = null
  } = options;
  
  const cacheKey = generateCacheKey(endpoint, params);
  const now = Date.now();
  const expiresAt = now + ttl;
  
  try {
    const dataString = JSON.stringify(data);
    const metadataString = metadata ? JSON.stringify(metadata) : null;
    
    await db.run(
      `INSERT OR REPLACE INTO cache 
       (cache_key, endpoint, data, metadata, created_at, expires_at, access_count, last_accessed)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [cacheKey, endpoint, dataString, metadataString, now, expiresAt, now]
    );
    
    // Update total size statistics
    await db.run(
      `UPDATE cache_stats 
       SET total_size = (SELECT SUM(LENGTH(data)) FROM cache WHERE endpoint = ?)
       WHERE endpoint = ?`,
      [endpoint, endpoint]
    );
    
    return true;
  } catch (error) {
    console.error('Cache write error:', error);
    return false;
  }
}

/**
 * Invalidate cache for specific endpoint
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Query parameters (optional)
 * @returns {boolean} Success status
 */
export async function invalidateCache(endpoint, params = null) {
  if (!db) {
    await initializeCache();
  }
  
  try {
    if (params) {
      // Invalidate specific cache entry
      const cacheKey = generateCacheKey(endpoint, params);
      await db.run('DELETE FROM cache WHERE cache_key = ?', [cacheKey]);
    } else {
      // Invalidate all cache entries for endpoint
      await db.run('DELETE FROM cache WHERE endpoint = ?', [endpoint]);
    }
    
    return true;
  } catch (error) {
    console.error('Cache invalidation error:', error);
    return false;
  }
}

/**
 * Clean expired cache entries
 * @returns {number} Number of entries removed
 */
export async function cleanExpiredCache() {
  if (!db) {
    await initializeCache();
  }
  
  const now = Date.now();
  
  try {
    const result = await db.run(
      'DELETE FROM cache WHERE expires_at <= ?',
      [now]
    );
    
    console.log(`Cleaned ${result.changes} expired cache entries`);
    return result.changes;
  } catch (error) {
    console.error('Cache cleanup error:', error);
    return 0;
  }
}

/**
 * Update cache statistics
 * @param {string} endpoint - API endpoint
 * @param {boolean} isHit - Whether it was a cache hit
 */
async function updateCacheStats(endpoint, isHit) {
  try {
    await db.run(
      `INSERT INTO cache_stats (endpoint, hit_count, miss_count)
       VALUES (?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
       hit_count = hit_count + ?,
       miss_count = miss_count + ?`,
      [endpoint, isHit ? 1 : 0, isHit ? 0 : 1, isHit ? 1 : 0, isHit ? 0 : 1]
    );
  } catch (error) {
    console.error('Failed to update cache stats:', error);
  }
}

/**
 * Get cache statistics
 * @param {string} endpoint - API endpoint (optional)
 * @returns {Object} Cache statistics
 */
export async function getCacheStats(endpoint = null) {
  if (!db) {
    await initializeCache();
  }
  
  try {
    if (endpoint) {
      const stats = await db.get(
        'SELECT * FROM cache_stats WHERE endpoint = ?',
        [endpoint]
      );
      
      const cacheInfo = await db.get(
        `SELECT COUNT(*) as entry_count, 
                SUM(LENGTH(data)) as total_size,
                AVG(access_count) as avg_access_count
         FROM cache WHERE endpoint = ?`,
        [endpoint]
      );
      
      return {
        endpoint,
        ...stats,
        ...cacheInfo,
        hit_rate: stats ? (stats.hit_count / (stats.hit_count + stats.miss_count) * 100).toFixed(2) : 0
      };
    } else {
      const stats = await db.all('SELECT * FROM cache_stats');
      
      const overallStats = await db.get(
        `SELECT COUNT(*) as total_entries,
                SUM(LENGTH(data)) as total_size,
                AVG(access_count) as avg_access_count
         FROM cache`
      );
      
      return {
        endpoints: stats,
        overall: overallStats
      };
    }
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    return null;
  }
}

/**
 * Clear all cache
 * @returns {boolean} Success status
 */
export async function clearAllCache() {
  if (!db) {
    await initializeCache();
  }
  
  try {
    await db.run('DELETE FROM cache');
    await db.run('UPDATE cache_stats SET last_cleared = ?', [Date.now()]);
    console.log('All cache cleared');
    return true;
  } catch (error) {
    console.error('Failed to clear cache:', error);
    return false;
  }
}

/**
 * Cache middleware for Express
 * @param {Object} options - Cache options
 * @returns {Function} Express middleware
 */
export function cacheMiddleware(options = {}) {
  const {
    ttl = 300000, // Default 5 minutes
    endpoints = [] // Specific endpoints to cache
  } = options;
  
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }
    
    // Check if endpoint should be cached
    const endpoint = req.path;
    if (endpoints.length > 0 && !endpoints.includes(endpoint)) {
      return next();
    }
    
    // Try to get from cache
    const cached = await getFromCache(endpoint, req.query);
    
    if (cached) {
      return res.json({
        ...cached.data,
        _cache: {
          hit: true,
          cached_at: cached.cached_at,
          expires_at: cached.expires_at
        }
      });
    }
    
    // Store original json method
    const originalJson = res.json.bind(res);
    
    // Override json method to save to cache
    res.json = function(data) {
      // Save to cache asynchronously
      saveToCache(endpoint, req.query, data, { ttl }).catch(console.error);
      
      // Send response with cache miss indicator
      originalJson({
        ...data,
        _cache: {
          hit: false
        }
      });
    };
    
    next();
  };
}

/**
 * Get cache configuration for specific endpoints
 * @returns {Object} Cache configuration
 */
export function getCacheConfig() {
  return {
    '/freee/account_items': { ttl: 3600000 }, // 1 hour
    '/freee/partners': { ttl: 1800000 }, // 30 minutes
    '/freee/items': { ttl: 1800000 }, // 30 minutes
    '/freee/sections': { ttl: 3600000 }, // 1 hour
    '/freee/taxes': { ttl: 86400000 }, // 24 hours
    '/freee/tags': { ttl: 1800000 }, // 30 minutes
    '/freee/journals': { ttl: 300000 }, // 5 minutes
    '/freee/monthly-trends': { ttl: 900000 }, // 15 minutes
    '/freee/variance-analysis': { ttl: 900000 }, // 15 minutes
    '/freee/entry-route-analysis': { ttl: 900000 }, // 15 minutes
    '/freee/partner-yearly-summary': { ttl: 1800000 }, // 30 minutes
  };
}