import fetch from 'node-fetch';
import { getAccessToken } from './tokenManager.js';

const QB_API_BASE_URL = process.env.QB_API_BASE_URL || 'https://quickbooks.api.intuit.com';

export async function getQuickBooksJournals(params = {}) {
  const token = await getAccessToken('quickbooks');
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${QB_API_BASE_URL}/v3/company/:companyId/journalentry?${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`quickbooks API error: ${response.status} ${body}`);
  }

  return response.json();
}
