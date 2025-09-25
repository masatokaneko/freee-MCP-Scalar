import fetch from 'node-fetch';
import { getAccessToken } from './tokenManager.js';
import { retryWithBackoff, isRetryableError } from '../utils/retry.js';

const BASE_URL = 'https://api.freee.co.jp/api/1';

async function callFreeeEndpoint(path, { method = 'GET', params = {}, headers = {}, body } = {}) {
  const token = await getAccessToken('freee');
  const url = new URL(`${BASE_URL}${path}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach(item => {
        if (item !== undefined && item !== null) {
          url.searchParams.append(key, String(item));
        }
      });
    } else {
      url.searchParams.append(key, String(value));
    }
  });

  return retryWithBackoff(async () => {
    const response = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...headers,
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`freee API error: ${response.status} ${text}`);
      error.status = response.status;
      error.response = text;
      if (!isRetryableError(response.status)) {
        throw error;
      }
      throw error;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    return response.text();
  });
}

export async function fetchTrialPL({ companyId, startDate, endDate, displayType = 'group' }) {
  return callFreeeEndpoint('/reports/trial_pl', {
    params: {
      company_id: companyId,
      start_date: startDate,
      end_date: endDate,
      account_item_display_type: displayType,
    },
  });
}

export async function fetchTrialPLItems({ companyId, startDate, endDate, itemIds }) {
  return callFreeeEndpoint('/reports/trial_pl_items', {
    params: {
      company_id: companyId,
      start_date: startDate,
      end_date: endDate,
    },
  });
}

export async function fetchTrialPLSections({ companyId, startDate, endDate, sectionId }) {
  return callFreeeEndpoint('/reports/trial_pl_sections', {
    params: {
      company_id: companyId,
      start_date: startDate,
      end_date: endDate,
      section_ids: String(sectionId),
    },
  });
}

export async function fetchTrialBS({ companyId, startDate, endDate, displayType = 'group' }) {
  return callFreeeEndpoint('/reports/trial_bs', {
    params: {
      company_id: companyId,
      start_date: startDate,
      end_date: endDate,
      account_item_display_type: displayType,
    },
  });
}

export async function fetchTrialBalance({ companyId, startDate, endDate, segment }) {
  const params = {
    company_id: companyId,
    start_date: startDate,
    end_date: endDate,
  };
  if (segment) params.segment = segment;
  return callFreeeEndpoint('/reports/trial_balance', { params });
}

export async function fetchTrialGeneralLedger({ companyId, startDate, endDate, accountItemId }) {
  return callFreeeEndpoint('/reports/trial_general_ledger', {
    params: {
      company_id: companyId,
      start_date: startDate,
      end_date: endDate,
      account_item_id: accountItemId,
    },
  });
}

export async function fetchDeals({ companyId, params = {} }) {
  return callFreeeEndpoint('/deals', {
    params: {
      company_id: companyId,
      limit: 500,
      ...params,
    },
  });
}

export async function fetchTransactions({ companyId, params = {} }) {
  return callFreeeEndpoint('/wallet_txns', {
    params: {
      company_id: companyId,
      limit: 500,
      ...params,
    },
  });
}

export async function fetchInvoices({ companyId, params = {} }) {
  return callFreeeEndpoint('/invoices', {
    params: {
      company_id: companyId,
      limit: 500,
      ...params,
    },
  });
}

export async function fetchExpenseApplications({ companyId, params = {} }) {
  return callFreeeEndpoint('/expense_applications', {
    params: {
      company_id: companyId,
      limit: 500,
      ...params,
    },
  });
}

export async function fetchApprovalRequests({ companyId, params = {} }) {
  return callFreeeEndpoint('/approval_requests', {
    params: {
      company_id: companyId,
      limit: 500,
      ...params,
    },
  });
}

export async function downloadJournalsGenericV2({ companyId, startDate, endDate, encoding = 'utf-8' }) {
  const params = {
    company_id: companyId,
    start_date: startDate,
    end_date: endDate,
    download_type: 'generic_v2',
    encoding,
  };

  const startResponse = await callFreeeEndpoint('/journals', { params });

  const statusUrl = `${startResponse.journals.status_url}?company_id=${companyId}`;
  let downloadUrl;
  for (let attempt = 0; attempt < 180; attempt++) {
    const token = await getAccessToken('freee');
    const statusResponse = await fetch(statusUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!statusResponse.ok) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }
    const statusJson = await statusResponse.json();
    if (statusJson.journals?.download_url) {
      downloadUrl = `${statusJson.journals.download_url}?company_id=${companyId}`;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!downloadUrl) {
    throw new Error('Timed out waiting for journals export');
  }

  const token = await getAccessToken('freee');
  const response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to download journals: ${response.status} ${text}`);
  }
  return response.arrayBuffer();
}
