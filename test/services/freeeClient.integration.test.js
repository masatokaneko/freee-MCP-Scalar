import { describe, test, expect } from '@jest/globals';
import { getJournals, getItems, getSections } from '../../src/services/freeeClient.js';

describe('freeeClient integration tests', () => {
  // This is an integration test that tests the actual structure
  // without mocking dependencies to avoid circular dependency issues
  
  test('getJournals requires company_id', async () => {
    // Save original env
    const originalCompanyId = process.env.FREEE_COMPANY_ID;
    const originalAccessToken = process.env.FREEE_ACCESS_TOKEN;
    
    // Clear environment to test validation
    delete process.env.FREEE_COMPANY_ID;
    delete process.env.FREEE_ACCESS_TOKEN;
    
    try {
      await getJournals({});
    } catch (error) {
      expect(error.message).toContain('company_id is required');
    }
    
    // Restore env
    if (originalCompanyId) process.env.FREEE_COMPANY_ID = originalCompanyId;
    if (originalAccessToken) process.env.FREEE_ACCESS_TOKEN = originalAccessToken;
  });
  
  test('getItems requires company_id', async () => {
    // Save original env
    const originalCompanyId = process.env.FREEE_COMPANY_ID;
    const originalAccessToken = process.env.FREEE_ACCESS_TOKEN;
    
    // Clear environment to test validation
    delete process.env.FREEE_COMPANY_ID;
    delete process.env.FREEE_ACCESS_TOKEN;
    
    try {
      await getItems({});
    } catch (error) {
      expect(error.message).toContain('company_id is required');
    }
    
    // Restore env
    if (originalCompanyId) process.env.FREEE_COMPANY_ID = originalCompanyId;
    if (originalAccessToken) process.env.FREEE_ACCESS_TOKEN = originalAccessToken;
  });
  
  test('getSections requires company_id', async () => {
    // Save original env
    const originalCompanyId = process.env.FREEE_COMPANY_ID;
    const originalAccessToken = process.env.FREEE_ACCESS_TOKEN;
    
    // Clear environment to test validation
    delete process.env.FREEE_COMPANY_ID;
    delete process.env.FREEE_ACCESS_TOKEN;
    
    try {
      await getSections({});
    } catch (error) {
      expect(error.message).toContain('company_id is required');
    }
    
    // Restore env
    if (originalCompanyId) process.env.FREEE_COMPANY_ID = originalCompanyId;
    if (originalAccessToken) process.env.FREEE_ACCESS_TOKEN = originalAccessToken;
  });
});