import fetch from 'node-fetch';
import { getAccessToken } from './tokenManager.js';
import { retryWithBackoff, isRetryableError } from '../utils/retry.js';
import { handleRateLimit, FreeeRateLimiter } from '../utils/rateLimit.js';
import { logError, logApiRequest, logApiResponse } from '../utils/errorLogger.js';

const FREEE_API_BASE_URL = process.env.FREEE_API_BASE_URL || 'https://api.freee.co.jp';
const rateLimiter = new FreeeRateLimiter();

export async function getJournals(params = {}) {
  return retryWithBackoff(async (attempt) => {
    await rateLimiter.acquire();
    
    const token = await getAccessToken('freee');
    const companyId = params.company_id || process.env.FREEE_COMPANY_ID;
    
    if (!companyId) {
      throw new Error('company_id is required for journals API');
    }
    
    const queryParams = {
      company_id: companyId,
      ...params
    };
    
    const query = new URLSearchParams(queryParams).toString();
    const url = `${FREEE_API_BASE_URL}/api/1/journals?${query}`;
    
    await logApiRequest('GET', url, { attempt });
    const startTime = Date.now();
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    
    const responseTime = Date.now() - startTime;
    const body = await response.text();
    await logApiResponse('GET', url, response.status, responseTime);
    
    if (!response.ok) {
      const error = new Error(`freee API error: ${response.status} ${body}`);
      error.status = response.status;
      error.response = body;
      
      // Handle rate limiting
      if (response.status === 429) {
        await handleRateLimit(response);
      }
      
      // Check if error is retryable
      if (!isRetryableError(response.status)) {
        await logError(error, { endpoint: 'journals', attempt });
        throw error;
      }
      
      throw error;
    }

    return JSON.parse(body);
  }, {
    maxRetries: 3,
    shouldRetry: (error) => {
      return error.status && isRetryableError(error.status);
    }
  });
}

export async function getItems(params = {}) {
  return retryWithBackoff(async (attempt) => {
    await rateLimiter.acquire();
    
    const token = await getAccessToken('freee');
    const companyId = params.company_id || process.env.FREEE_COMPANY_ID;
    
    if (!companyId) {
      throw new Error('company_id is required for items API');
    }
    
    const queryParams = { company_id: companyId, ...params };
    const query = new URLSearchParams(queryParams).toString();
    const url = `${FREEE_API_BASE_URL}/api/1/items?${query}`;
    
    await logApiRequest('GET', url, { attempt });
    const startTime = Date.now();
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    const responseTime = Date.now() - startTime;
    const body = await response.text();
    await logApiResponse('GET', url, response.status, responseTime);
    
    if (!response.ok) {
      const error = new Error(`freee API error: ${response.status} ${body}`);
      error.status = response.status;
      
      if (response.status === 429) {
        await handleRateLimit(response);
      }
      
      if (!isRetryableError(response.status)) {
        await logError(error, { endpoint: 'items', attempt });
        throw error;
      }
      
      throw error;
    }

    return JSON.parse(body);
  });
}

export async function getSections(params = {}) {
  return retryWithBackoff(async (attempt) => {
    await rateLimiter.acquire();
    
    const token = await getAccessToken('freee');
    const companyId = params.company_id || process.env.FREEE_COMPANY_ID;
    
    if (!companyId) {
      throw new Error('company_id is required for sections API');
    }
    
    const queryParams = { company_id: companyId, ...params };
    const query = new URLSearchParams(queryParams).toString();
    const url = `${FREEE_API_BASE_URL}/api/1/sections?${query}`;
    
    await logApiRequest('GET', url, { attempt });
    const startTime = Date.now();
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    const responseTime = Date.now() - startTime;
    const body = await response.text();
    await logApiResponse('GET', url, response.status, responseTime);
    
    if (!response.ok) {
      const error = new Error(`freee API error: ${response.status} ${body}`);
      error.status = response.status;
      
      if (response.status === 429) {
        await handleRateLimit(response);
      }
      
      if (!isRetryableError(response.status)) {
        await logError(error, { endpoint: 'sections', attempt });
        throw error;
      }
      
      throw error;
    }

    return JSON.parse(body);
  });
}

export async function getTaxes(params = {}) {
  return retryWithBackoff(async (attempt) => {
    await rateLimiter.acquire();
    
    const token = await getAccessToken('freee');
    const companyId = params.company_id || process.env.FREEE_COMPANY_ID;
    
    if (!companyId) {
      throw new Error('company_id is required for taxes API');
    }
    
    const queryParams = { company_id: companyId, ...params };
    const query = new URLSearchParams(queryParams).toString();
    const url = `${FREEE_API_BASE_URL}/api/1/taxes/companies/${companyId}`;
    
    await logApiRequest('GET', url, { attempt });
    const startTime = Date.now();
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    const responseTime = Date.now() - startTime;
    const body = await response.text();
    await logApiResponse('GET', url, response.status, responseTime);
    
    if (!response.ok) {
      const error = new Error(`freee API error: ${response.status} ${body}`);
      error.status = response.status;
      
      if (response.status === 429) {
        await handleRateLimit(response);
      }
      
      if (!isRetryableError(response.status)) {
        await logError(error, { endpoint: 'taxes', attempt });
        throw error;
      }
      
      throw error;
    }

    return JSON.parse(body);
  });
}

export async function getTags(params = {}) {
  return retryWithBackoff(async (attempt) => {
    await rateLimiter.acquire();
    
    const token = await getAccessToken('freee');
    const companyId = params.company_id || process.env.FREEE_COMPANY_ID;
    
    if (!companyId) {
      throw new Error('company_id is required for tags API');
    }
    
    const queryParams = { company_id: companyId, ...params };
    const query = new URLSearchParams(queryParams).toString();
    const url = `${FREEE_API_BASE_URL}/api/1/tags?${query}`;
    
    await logApiRequest('GET', url, { attempt });
    const startTime = Date.now();
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    const responseTime = Date.now() - startTime;
    const body = await response.text();
    await logApiResponse('GET', url, response.status, responseTime);
    
    if (!response.ok) {
      const error = new Error(`freee API error: ${response.status} ${body}`);
      error.status = response.status;
      
      if (response.status === 429) {
        await handleRateLimit(response);
      }
      
      if (!isRetryableError(response.status)) {
        await logError(error, { endpoint: 'tags', attempt });
        throw error;
      }
      
      throw error;
    }

    return JSON.parse(body);
  });
}

export async function getPartners(params = {}) {
  return retryWithBackoff(async (attempt) => {
    await rateLimiter.acquire();
    
    const token = await getAccessToken('freee');
    const companyId = params.company_id || process.env.FREEE_COMPANY_ID;
    
    if (!companyId) {
      throw new Error('company_id is required for getPartners');
    }
    
    const query = new URLSearchParams({
      company_id: companyId,
      ...params
    }).toString();
    const url = `${FREEE_API_BASE_URL}/api/1/partners?${query}`;
    
    const start = Date.now();
    await logApiRequest('GET', url);
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const duration = Date.now() - start;
    await logApiResponse('GET', url, response.status, duration);

    if (response.status === 429) {
      await handleRateLimit(response);
      throw new Error('Rate limited');
    }

    if (!response.ok) {
      const body = await response.text();
      const error = new Error(`freee API error: ${response.status} ${body}`);
      error.status = response.status;
      await logError(error, { endpoint: 'getPartners', params });
      throw error;
    }

    return response.json();
  }, {
    maxRetries: 3,
    shouldRetry: (error) => isRetryableError(error)
  });
}

export async function getAccountItems(params = {}) {
  return retryWithBackoff(async (attempt) => {
    await rateLimiter.acquire();
    
    const token = await getAccessToken('freee');
    const companyId = params.company_id || process.env.FREEE_COMPANY_ID;
    
    if (!companyId) {
      throw new Error('company_id is required for getAccountItems');
    }
    
    const query = new URLSearchParams({
      company_id: companyId,
      ...params
    }).toString();
    const url = `${FREEE_API_BASE_URL}/api/1/account_items?${query}`;
    
    const start = Date.now();
    await logApiRequest('GET', url);
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const duration = Date.now() - start;
    await logApiResponse('GET', url, response.status, duration);

    if (response.status === 429) {
      await handleRateLimit(response);
      throw new Error('Rate limited');
    }

    if (!response.ok) {
      const body = await response.text();
      const error = new Error(`freee API error: ${response.status} ${body}`);
      error.status = response.status;
      await logError(error, { endpoint: 'getAccountItems', params });
      throw error;
    }

    return response.json();
  }, {
    maxRetries: 3,
    shouldRetry: (error) => isRetryableError(error)
  });
}
