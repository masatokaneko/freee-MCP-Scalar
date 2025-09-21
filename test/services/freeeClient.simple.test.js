import { describe, test, expect } from '@jest/globals';

describe('freeeClient basic import test', () => {
  test('should import freeeClient module without crashing', async () => {
    // This test simply verifies that the module can be imported
    const module = await import('../../src/services/freeeClient.js');
    
    // Verify key exports exist
    expect(module.getJournals).toBeDefined();
    expect(module.getItems).toBeDefined();
    expect(module.getSections).toBeDefined();
    expect(module.getTaxes).toBeDefined();
    expect(module.getTags).toBeDefined();
    expect(module.getPartners).toBeDefined();
    expect(module.getAccountItems).toBeDefined();
    
    // Verify they are functions
    expect(typeof module.getJournals).toBe('function');
    expect(typeof module.getItems).toBe('function');
    expect(typeof module.getSections).toBe('function');
    expect(typeof module.getTaxes).toBe('function');
    expect(typeof module.getTags).toBe('function');
    expect(typeof module.getPartners).toBe('function');
    expect(typeof module.getAccountItems).toBe('function');
  });
});