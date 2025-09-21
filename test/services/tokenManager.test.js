import { jest } from '@jest/globals';
import * as tokenManager from '../../src/services/tokenManager.js';

// Mock node-fetch
jest.unstable_mockModule('node-fetch', () => ({
  default: jest.fn()
}));

// Mock tokenStorage
jest.unstable_mockModule('../../src/services/tokenStorage.js', () => ({
  loadSecureTokens: jest.fn(),
  saveSecureTokens: jest.fn(),
  storeTokenSecurely: jest.fn(),
  getStoredToken: jest.fn(),
  isTokenExpired: jest.fn()
}));

const fetch = (await import('node-fetch')).default;
const tokenStorage = await import('../../src/services/tokenStorage.js');

describe('Token Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FREEE_CLIENT_ID = 'test-client-id';
    process.env.FREEE_CLIENT_SECRET = 'test-client-secret';
    delete process.env.FREEE_ACCESS_TOKEN;
  });

  describe('getAccessToken', () => {
    it('should return cached token if not expired', async () => {
      const mockToken = 'cached-access-token';
      const futureExpiry = Date.now() + 3600000;
      
      tokenStorage.loadSecureTokens.mockResolvedValue({
        freee: {
          access_token: mockToken,
          expires_at: futureExpiry
        }
      });

      await tokenManager.initializeTokens();
      const token = await tokenManager.getAccessToken('freee');
      
      expect(token).toBe(mockToken);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should refresh token when expired', async () => {
      const oldToken = 'old-access-token';
      const newToken = 'new-access-token';
      const refreshToken = 'refresh-token';
      const pastExpiry = Date.now() - 3600000;
      
      tokenStorage.getStoredToken.mockResolvedValue({
        access_token: oldToken,
        refresh_token: refreshToken,
        expires_at: pastExpiry
      });

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          access_token: newToken,
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
          created_at: Date.now() / 1000,
          scope: 'read write',
          token_type: 'Bearer'
        })
      };
      
      fetch.mockResolvedValue(mockResponse);
      
      tokenStorage.storeTokenSecurely.mockResolvedValue({
        access_token: newToken,
        expires_at: Date.now() + 3600000
      });

      const token = await tokenManager.getAccessToken('freee');
      
      expect(token).toBe(newToken);
      expect(fetch).toHaveBeenCalledWith(
        'https://accounts.secure.freee.co.jp/public_api/token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        })
      );
      expect(tokenStorage.storeTokenSecurely).toHaveBeenCalled();
    });

    it('should throw error when refresh token is missing', async () => {
      tokenStorage.getStoredToken.mockResolvedValue(null);

      await expect(tokenManager.getAccessToken('freee')).rejects.toThrow(
        'No refresh token available for freee'
      );
    });

    it('should throw error when refresh request fails', async () => {
      tokenStorage.getStoredToken.mockResolvedValue({
        refresh_token: 'refresh-token',
        expires_at: Date.now() - 3600000
      });

      const mockResponse = {
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue('Unauthorized')
      };
      
      fetch.mockResolvedValue(mockResponse);

      await expect(tokenManager.getAccessToken('freee')).rejects.toThrow(
        'Failed to refresh freee token: 401 - Unauthorized'
      );
    });

    it('should use environment variable token if available', async () => {
      const envToken = 'env-access-token';
      process.env.FREEE_ACCESS_TOKEN = envToken;

      const token = await tokenManager.getAccessToken('freee');
      
      expect(token).toBe(envToken);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should throw error for unknown provider', async () => {
      await expect(tokenManager.getAccessToken('unknown')).rejects.toThrow(
        'Unknown provider: unknown'
      );
    });
  });

  describe('storeInitialTokens', () => {
    it('should store initial tokens securely', async () => {
      const tokenData = {
        access_token: 'initial-access-token',
        refresh_token: 'initial-refresh-token',
        expires_in: 3600,
        scope: 'read write',
        token_type: 'Bearer'
      };

      const savedToken = {
        ...tokenData,
        expires_at: Date.now() + 3600000
      };

      tokenStorage.storeTokenSecurely.mockResolvedValue(savedToken);

      const result = await tokenManager.storeInitialTokens('freee', tokenData);
      
      expect(result).toEqual(savedToken);
      expect(tokenStorage.storeTokenSecurely).toHaveBeenCalledWith('freee', tokenData);
    });
  });

  describe('initializeTokens', () => {
    it('should initialize tokens from storage', async () => {
      const storedTokens = {
        freee: {
          access_token: 'stored-freee-token',
          expires_at: Date.now() + 3600000
        },
        quickbooks: {
          access_token: 'stored-qb-token',
          expires_at: Date.now() + 3600000
        }
      };

      tokenStorage.loadSecureTokens.mockResolvedValue(storedTokens);

      await tokenManager.initializeTokens();
      
      expect(tokenStorage.loadSecureTokens).toHaveBeenCalled();
    });

    it('should handle initialization errors gracefully', async () => {
      tokenStorage.loadSecureTokens.mockRejectedValue(new Error('Failed to load'));

      await expect(tokenManager.initializeTokens()).resolves.not.toThrow();
    });
  });

  describe('Token refresh with buffer', () => {
    it('should refresh token before expiry with buffer time', async () => {
      const bufferSeconds = 300; // 5 minutes
      const expiryWithinBuffer = Date.now() + (bufferSeconds - 60) * 1000; // 4 minutes from now
      const newToken = 'refreshed-token';
      
      tokenStorage.getStoredToken.mockResolvedValue({
        access_token: 'old-token',
        refresh_token: 'refresh-token',
        expires_at: expiryWithinBuffer
      });

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          access_token: newToken,
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
          created_at: Date.now() / 1000,
          scope: 'read write',
          token_type: 'Bearer'
        })
      };
      
      fetch.mockResolvedValue(mockResponse);
      
      tokenStorage.storeTokenSecurely.mockResolvedValue({
        access_token: newToken,
        expires_at: Date.now() + 3600000
      });

      const token = await tokenManager.getAccessToken('freee');
      
      expect(token).toBe(newToken);
      expect(fetch).toHaveBeenCalled();
    });
  });
});