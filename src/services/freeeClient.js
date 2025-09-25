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
    
    // Build query string properly handling array parameters
    const queryParams = new URLSearchParams();
    queryParams.append('company_id', companyId);
    
    // Handle other parameters, excluding arrays and special cases
    for (const [key, value] of Object.entries(params)) {
      if (key !== 'company_id' && key !== 'visible_tags' && key !== 'visible_ids') {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value);
        }
      }
    }
    
    // Handle visible_tags and visible_ids as arrays if present
    if (params.visible_tags && Array.isArray(params.visible_tags)) {
      params.visible_tags.forEach(tag => queryParams.append('visible_tags[]', tag));
    }
    
    if (params.visible_ids && Array.isArray(params.visible_ids)) {
      params.visible_ids.forEach(id => queryParams.append('visible_ids[]', id));
    }
    
    const query = queryParams.toString();
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

    const result = JSON.parse(body);
    
    // 非同期ジョブの場合、ポーリングしてデータを取得
    if (result.journals && result.journals.status_url) {
      console.log(`仕訳帳取得ジョブ開始: ID ${result.journals.id}`);
      return await pollJournalJob(result.journals, token, companyId);
    }
    
    return result;
  }, {
    maxRetries: 3,
    shouldRetry: (error) => {
      return error.status && isRetryableError(error.status);
    }
  });
}

async function pollJournalJob(jobInfo, token, companyId) {
  const maxRetries = 60; // 最大10分（10秒間隔）
  const pollInterval = 10000; // 10秒
  
  for (let i = 0; i < maxRetries; i++) {
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    try {
      // status_urlが相対パスの場合は、フルURLを構築し、company_idも追加
      let statusUrl = jobInfo.status_url.startsWith('http') 
        ? jobInfo.status_url 
        : `${FREEE_API_BASE_URL}${jobInfo.status_url}`;
      
      // URLにcompany_idパラメータを追加
      const url = new URL(statusUrl);
      if (!url.searchParams.has('company_id') && companyId) {
        url.searchParams.append('company_id', companyId);
      }
      statusUrl = url.toString();
      
      // ステータス確認
      const statusResponse = await fetch(statusUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!statusResponse.ok) {
        const errorBody = await statusResponse.text();
        console.error(`Status check error: ${statusResponse.status} - ${errorBody}`);
        throw new Error(`Status check failed: ${statusResponse.status}`);
      }
      
      const statusData = await statusResponse.json();
      
      if (statusData.journals) {
        if (statusData.journals.download_url) {
          console.log(`  ジョブ完了。データをダウンロード中...`);
          
          // download_urlが相対パスの場合は、フルURLを構築
          const downloadUrl = statusData.journals.download_url.startsWith('http') 
            ? statusData.journals.download_url 
            : `${FREEE_API_BASE_URL}${statusData.journals.download_url}`;
          
          // データダウンロード
          const downloadResponse = await fetch(downloadUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          
          if (!downloadResponse.ok) {
            throw new Error(`Download failed: ${downloadResponse.status}`);
          }
          
          const journalData = await downloadResponse.json();
          console.log(`  仕訳データ取得完了: ${journalData.journals ? journalData.journals.length : 0}件`);
          return journalData;
        } else if (statusData.journals.status === 'error') {
          throw new Error(`Job failed: ${JSON.stringify(statusData.journals.error)}`);
        }
      }
      
      console.log(`  処理中... (${i + 1}/${maxRetries})`);
    } catch (error) {
      console.error(`  ポーリングエラー: ${error.message}`);
      if (i === maxRetries - 1) {
        throw error;
      }
    }
  }
  
  throw new Error('Timeout waiting for journal data');
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
    
    // Build query string properly handling array parameters
    const queryParams = new URLSearchParams();
    queryParams.append('company_id', companyId);
    
    // Handle other parameters, excluding arrays and special cases
    for (const [key, value] of Object.entries(params)) {
      if (key !== 'company_id' && key !== 'visible_tags' && key !== 'visible_ids') {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value);
        }
      }
    }
    
    // Handle visible_tags and visible_ids as arrays if present
    if (params.visible_tags && Array.isArray(params.visible_tags)) {
      params.visible_tags.forEach(tag => queryParams.append('visible_tags[]', tag));
    }
    
    if (params.visible_ids && Array.isArray(params.visible_ids)) {
      params.visible_ids.forEach(id => queryParams.append('visible_ids[]', id));
    }
    
    const query = queryParams.toString();
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
