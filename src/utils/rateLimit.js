import { sleep } from './retry.js';

/**
 * Rate limiter with token bucket algorithm
 */
export class RateLimiter {
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || 10;
    this.refillRate = options.refillRate || 1; // tokens per second
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Acquire a token, wait if necessary
   */
  async acquire() {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }

    // Calculate wait time
    const tokensNeeded = 1 - this.tokens;
    const waitTime = (tokensNeeded / this.refillRate) * 1000; // milliseconds
    
    await sleep(waitTime);
    return this.acquire();
  }

  /**
   * Check if token is available without waiting
   */
  tryAcquire() {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }
    
    return false;
  }
}

/**
 * Handle rate limit response from API
 * @param {Response} response - HTTP response object
 * @returns {Promise<boolean>} True if should retry, false otherwise
 */
export async function handleRateLimit(response) {
  if (response.status !== 429) {
    return false;
  }

  // Check for Retry-After header
  const retryAfter = response.headers.get('Retry-After');
  const rateLimitReset = response.headers.get('X-RateLimit-Reset');
  const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
  
  let waitTime = 60000; // Default to 60 seconds
  
  if (retryAfter) {
    // Retry-After can be in seconds or HTTP date
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      waitTime = seconds * 1000;
    } else {
      // Try to parse as date
      const retryDate = new Date(retryAfter);
      if (!isNaN(retryDate.getTime())) {
        waitTime = Math.max(0, retryDate.getTime() - Date.now());
      }
    }
  } else if (rateLimitReset) {
    // Unix timestamp
    const resetTime = parseInt(rateLimitReset, 10) * 1000;
    waitTime = Math.max(0, resetTime - Date.now());
  }

  // Add small buffer to avoid edge cases
  waitTime += 1000;

  console.log(`Rate limited. Waiting ${waitTime / 1000} seconds before retry...`);
  await sleep(waitTime);
  
  return true;
}

/**
 * Extract rate limit info from response headers
 * @param {Response} response - HTTP response object
 * @returns {Object} Rate limit information
 */
export function getRateLimitInfo(response) {
  return {
    limit: parseInt(response.headers.get('X-RateLimit-Limit') || '0', 10),
    remaining: parseInt(response.headers.get('X-RateLimit-Remaining') || '0', 10),
    reset: parseInt(response.headers.get('X-RateLimit-Reset') || '0', 10),
    retryAfter: response.headers.get('Retry-After')
  };
}

/**
 * Rate limit middleware for fetch
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {RateLimiter} limiter - Rate limiter instance
 * @returns {Promise<Response>} Fetch response
 */
export async function rateLimitedFetch(url, options = {}, limiter = null) {
  if (limiter) {
    await limiter.acquire();
  }

  const response = await fetch(url, options);
  
  if (response.status === 429) {
    const shouldRetry = await handleRateLimit(response);
    if (shouldRetry) {
      return rateLimitedFetch(url, options, limiter);
    }
  }

  return response;
}

/**
 * Create a rate limited function
 * @param {Function} fn - Function to rate limit
 * @param {Object} options - Rate limiter options
 * @returns {Function} Rate limited function
 */
export function createRateLimitedFunction(fn, options = {}) {
  const limiter = new RateLimiter(options);
  
  return async function (...args) {
    await limiter.acquire();
    return fn.apply(this, args);
  };
}

/**
 * Freee API specific rate limiter
 */
export class FreeeRateLimiter extends RateLimiter {
  constructor() {
    super({
      maxTokens: 5,      // Freee allows 5 requests
      refillRate: 5 / 60 // per minute
    });
  }
}

/**
 * QuickBooks API specific rate limiter
 */
export class QuickBooksRateLimiter extends RateLimiter {
  constructor() {
    super({
      maxTokens: 10,      // QuickBooks allows more requests
      refillRate: 10 / 60 // per minute
    });
  }
}