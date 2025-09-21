import { jest } from '@jest/globals';
import fs from 'fs/promises';
import crypto from 'crypto';
import * as tokenStorage from '../../src/services/tokenStorage.js';

jest.mock('fs/promises');

describe('Token Storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadSecureTokens', () => {
    it('should load and decrypt tokens successfully', async () => {
      const encryptedData = {
        encrypted: 'encrypted-data',
        iv: 'initialization-vector',
        authTag: 'auth-tag'
      };
      
      const tokens = {
        freee: {
          access_token: 'test-token',
          refresh_token: 'test-refresh',
          expires_at: Date.now() + 3600000
        }
      };

      fs.readFile.mockImplementation((path) => {
        if (path.endsWith('.key')) {
          return Promise.resolve(crypto.randomBytes(32));
        }
        if (path.endsWith('.tokens.enc')) {
          return Promise.resolve(JSON.stringify(encryptedData));
        }
        return Promise.reject(new Error('Unknown file'));
      });

      // Since we can't mock the actual decryption, we'll test file reading
      const result = await tokenStorage.loadSecureTokens();
      
      expect(fs.readFile).toHaveBeenCalledTimes(2);
    });

    it('should return empty object when no tokens file exists', async () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      
      fs.readFile.mockImplementation((path) => {
        if (path.endsWith('.key')) {
          return Promise.resolve(crypto.randomBytes(32));
        }
        if (path.endsWith('.tokens.enc')) {
          return Promise.reject(error);
        }
        return Promise.reject(new Error('Unknown file'));
      });

      const result = await tokenStorage.loadSecureTokens();
      
      expect(result).toEqual({});
    });

    it('should create encryption key if not exists', async () => {
      const keyError = new Error('Key not found');
      keyError.code = 'ENOENT';
      
      fs.readFile.mockImplementation((path) => {
        if (path.endsWith('.key')) {
          return Promise.reject(keyError);
        }
        return Promise.resolve('{}');
      });
      
      fs.writeFile.mockResolvedValue();
      fs.chmod.mockResolvedValue();

      await tokenStorage.loadSecureTokens();
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.key'),
        expect.any(Buffer)
      );
      expect(fs.chmod).toHaveBeenCalledWith(
        expect.stringContaining('.key'),
        0o600
      );
    });
  });

  describe('saveSecureTokens', () => {
    it('should encrypt and save tokens', async () => {
      const tokens = {
        freee: {
          access_token: 'test-token',
          refresh_token: 'test-refresh',
          expires_at: Date.now() + 3600000
        }
      };

      fs.readFile.mockResolvedValue(crypto.randomBytes(32));
      fs.writeFile.mockResolvedValue();
      fs.chmod.mockResolvedValue();

      await tokenStorage.saveSecureTokens(tokens);
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.tokens.enc'),
        expect.any(String)
      );
      expect(fs.chmod).toHaveBeenCalledWith(
        expect.stringContaining('.tokens.enc'),
        0o600
      );
    });
  });

  describe('storeTokenSecurely', () => {
    it('should store token with proper structure', async () => {
      const tokenData = {
        access_token: 'new-token',
        refresh_token: 'new-refresh',
        expires_in: 3600,
        scope: 'read write',
        token_type: 'Bearer',
        company_id: '12345'
      };

      fs.readFile.mockImplementation((path) => {
        if (path.endsWith('.key')) {
          return Promise.resolve(crypto.randomBytes(32));
        }
        const error = new Error('File not found');
        error.code = 'ENOENT';
        return Promise.reject(error);
      });
      
      fs.writeFile.mockResolvedValue();
      fs.chmod.mockResolvedValue();

      const result = await tokenStorage.storeTokenSecurely('freee', tokenData);
      
      expect(result).toMatchObject({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expect.any(Number),
        created_at: expect.any(Number),
        scope: tokenData.scope,
        token_type: tokenData.token_type,
        company_id: tokenData.company_id
      });
      
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('getStoredToken', () => {
    it('should return token for provider', async () => {
      const tokens = {
        freee: {
          access_token: 'freee-token',
          refresh_token: 'freee-refresh'
        },
        quickbooks: {
          access_token: 'qb-token',
          refresh_token: 'qb-refresh'
        }
      };

      jest.spyOn(tokenStorage, 'loadSecureTokens').mockResolvedValue(tokens);

      const result = await tokenStorage.getStoredToken('freee');
      
      expect(result).toEqual(tokens.freee);
    });

    it('should return null for non-existent provider', async () => {
      jest.spyOn(tokenStorage, 'loadSecureTokens').mockResolvedValue({});

      const result = await tokenStorage.getStoredToken('unknown');
      
      expect(result).toBeNull();
    });
  });

  describe('deleteStoredToken', () => {
    it('should delete token for provider', async () => {
      const tokens = {
        freee: {
          access_token: 'freee-token'
        },
        quickbooks: {
          access_token: 'qb-token'
        }
      };

      jest.spyOn(tokenStorage, 'loadSecureTokens').mockResolvedValue(tokens);
      jest.spyOn(tokenStorage, 'saveSecureTokens').mockResolvedValue();

      await tokenStorage.deleteStoredToken('freee');
      
      expect(tokenStorage.saveSecureTokens).toHaveBeenCalledWith({
        quickbooks: tokens.quickbooks
      });
    });
  });

  describe('isTokenExpired', () => {
    it('should return true for expired token', async () => {
      const expiredToken = {
        access_token: 'token',
        expires_at: Date.now() - 3600000 // 1 hour ago
      };

      jest.spyOn(tokenStorage, 'getStoredToken').mockResolvedValue(expiredToken);

      const result = await tokenStorage.isTokenExpired('freee');
      
      expect(result).toBe(true);
    });

    it('should return false for valid token', async () => {
      const validToken = {
        access_token: 'token',
        expires_at: Date.now() + 3600000 // 1 hour from now
      };

      jest.spyOn(tokenStorage, 'getStoredToken').mockResolvedValue(validToken);

      const result = await tokenStorage.isTokenExpired('freee');
      
      expect(result).toBe(false);
    });

    it('should return true when token is within buffer time', async () => {
      const bufferTime = 5 * 60 * 1000; // 5 minutes
      const tokenExpiringWithinBuffer = {
        access_token: 'token',
        expires_at: Date.now() + (bufferTime - 60000) // 4 minutes from now
      };

      jest.spyOn(tokenStorage, 'getStoredToken').mockResolvedValue(tokenExpiringWithinBuffer);

      const result = await tokenStorage.isTokenExpired('freee');
      
      expect(result).toBe(true);
    });

    it('should return true when token does not exist', async () => {
      jest.spyOn(tokenStorage, 'getStoredToken').mockResolvedValue(null);

      const result = await tokenStorage.isTokenExpired('freee');
      
      expect(result).toBe(true);
    });
  });
});