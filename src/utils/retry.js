/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after the specified time
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.initialDelay - Initial delay in milliseconds (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in milliseconds (default: 30000)
 * @param {number} options.factor - Exponential factor (default: 2)
 * @param {boolean} options.jitter - Add random jitter to delays (default: true)
 * @param {Function} options.onRetry - Callback function called on each retry
 * @param {Function} options.shouldRetry - Function to determine if should retry (default: always true)
 * @returns {Promise} Result of the function
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    factor = 2,
    jitter = true,
    onRetry = null,
    shouldRetry = () => true
  } = options;

  let lastError;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      
      if (attempt >= maxRetries) {
        break;
      }

      if (!shouldRetry(error, attempt)) {
        throw error;
      }

      let delay = Math.min(initialDelay * Math.pow(factor, attempt), maxDelay);
      
      if (jitter) {
        delay = delay * (0.5 + Math.random() * 0.5);
      }

      if (onRetry) {
        await onRetry(error, attempt + 1, delay);
      }

      await sleep(delay);
      attempt++;
    }
  }

  const retryError = new Error(`Failed after ${attempt} retries: ${lastError.message}`);
  retryError.cause = lastError;
  retryError.attempts = attempt;
  throw retryError;
}

/**
 * Retry with fixed delay
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries
 * @param {number} options.delay - Fixed delay between retries
 * @returns {Promise} Result of the function
 */
export async function retryWithFixedDelay(fn, options = {}) {
  const { maxRetries = 3, delay = 1000 } = options;
  
  return retryWithBackoff(fn, {
    maxRetries,
    initialDelay: delay,
    factor: 1,
    jitter: false
  });
}

/**
 * Check if error is retryable
 * @param {Error} error - Error to check
 * @returns {boolean} True if error is retryable
 */
export function isRetryableError(error) {
  // Network errors
  if (error.code === 'ECONNREFUSED' || 
      error.code === 'ETIMEDOUT' || 
      error.code === 'ECONNRESET' ||
      error.code === 'EPIPE') {
    return true;
  }

  // HTTP status codes that are retryable
  if (error.status) {
    const retryableStatuses = [
      408, // Request Timeout
      429, // Too Many Requests
      500, // Internal Server Error
      502, // Bad Gateway
      503, // Service Unavailable
      504  // Gateway Timeout
    ];
    return retryableStatuses.includes(error.status);
  }

  // Fetch errors
  if (error.message && (
    error.message.includes('fetch failed') ||
    error.message.includes('network') ||
    error.message.includes('timeout')
  )) {
    return true;
  }

  return false;
}

/**
 * Retry decorator for class methods
 * @param {Object} options - Retry options
 * @returns {Function} Decorator function
 */
export function retry(options = {}) {
  return function (target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args) {
      return retryWithBackoff(() => originalMethod.apply(this, args), options);
    };

    return descriptor;
  };
}