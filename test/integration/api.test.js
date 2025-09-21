import { describe, test, expect, beforeAll } from '@jest/globals';
import 'dotenv/config';

describe('Freee API Integration Tests', () => {
  let apiBase;
  let headers;
  let companyId;
  
  beforeAll(() => {
    // Ensure required environment variables are set
    if (!process.env.FREEE_ACCESS_TOKEN) {
      throw new Error('FREEE_ACCESS_TOKEN is required. Run scripts/get_token.js first.');
    }
    
    if (!process.env.FREEE_COMPANY_ID) {
      throw new Error('FREEE_COMPANY_ID is required. Run scripts/get_company.js first.');
    }
    
    apiBase = process.env.FREEE_API_BASE_URL || 'https://api.freee.co.jp';
    companyId = process.env.FREEE_COMPANY_ID;
    headers = {
      'Authorization': `Bearer ${process.env.FREEE_ACCESS_TOKEN}`,
      'Accept': 'application/json'
    };
  });
  
  test('getJournals - can fetch journal data', async () => {
    const { getJournals } = await import('../../src/services/freeeClient.js');
    
    // Get journals for current month
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-${new Date(year, now.getMonth() + 1, 0).getDate()}`;
    
    const result = await getJournals({
      company_id: companyId,
      start_date: startDate,
      end_date: endDate,
      download_type: 'generic',
      limit: 5
    });
    
    expect(result).toBeDefined();
    
    // The journals API returns a job response for download_type='generic'
    // It provides a status_url to check the job status
    console.log('Journals response:', result);
    
    if (result.journals && typeof result.journals === 'object' && result.journals.status_url) {
      // This is an async job response
      expect(result.journals).toHaveProperty('id');
      expect(result.journals).toHaveProperty('status_url');
      expect(result.journals).toHaveProperty('company_id', parseInt(companyId));
      expect(result.journals).toHaveProperty('download_type', 'generic');
    } else if (Array.isArray(result.journals)) {
      // Direct journal data
      expect(Array.isArray(result.journals)).toBe(true);
    } else {
      // No journal data
      expect(result.journals).toBeDefined();
    }
  });
  
  test('getAccountItems - can fetch account items', async () => {
    const { getAccountItems } = await import('../../src/services/freeeClient.js');
    
    const result = await getAccountItems({
      company_id: companyId
    });
    
    expect(result).toBeDefined();
    expect(result).toHaveProperty('account_items');
    expect(Array.isArray(result.account_items)).toBe(true);
    
    if (result.account_items.length > 0) {
      const firstItem = result.account_items[0];
      expect(firstItem).toHaveProperty('id');
      expect(firstItem).toHaveProperty('name');
    }
  });
  
  test('getPartners - can fetch partners', async () => {
    const { getPartners } = await import('../../src/services/freeeClient.js');
    
    const result = await getPartners({
      company_id: companyId,
      limit: 5
    });
    
    expect(result).toBeDefined();
    expect(result).toHaveProperty('partners');
    expect(Array.isArray(result.partners)).toBe(true);
  });
  
  test('getSections - can fetch sections', async () => {
    const { getSections } = await import('../../src/services/freeeClient.js');
    
    const result = await getSections({
      company_id: companyId
    });
    
    expect(result).toBeDefined();
    expect(result).toHaveProperty('sections');
    expect(Array.isArray(result.sections)).toBe(true);
  });
  
  test('getTags - can fetch tags', async () => {
    const { getTags } = await import('../../src/services/freeeClient.js');
    
    const result = await getTags({
      company_id: companyId
    });
    
    expect(result).toBeDefined();
    expect(result).toHaveProperty('tags');
    expect(Array.isArray(result.tags)).toBe(true);
  });
  
  test('getItems - can fetch items', async () => {
    const { getItems } = await import('../../src/services/freeeClient.js');
    
    const result = await getItems({
      company_id: companyId
    });
    
    expect(result).toBeDefined();
    expect(result).toHaveProperty('items');
    expect(Array.isArray(result.items)).toBe(true);
  });
});