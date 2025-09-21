import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockFetch = jest.fn();
const mockGetAccessToken = jest.fn();
const mockLogApiRequest = jest.fn().mockResolvedValue(undefined);
const mockLogApiResponse = jest.fn().mockResolvedValue(undefined);
const mockLogError = jest.fn().mockResolvedValue(undefined);
const mockHandleRateLimit = jest.fn().mockResolvedValue(undefined);
const mockRateLimiterAcquire = jest.fn().mockResolvedValue(true);

class MockRateLimiter {
  constructor() {
    this.acquire = mockRateLimiterAcquire;
  }
}

jest.unstable_mockModule('../../src/utils/retry.js', async () => {
  const actual = await import('../../src/utils/retry.js');
  return {
    ...actual,
    retryWithBackoff: async (fn, options) => {
      try {
        return await fn(0);
      } catch (error) {
        throw error;
      }
    },
    isRetryableError: (status) => status >= 500 || status === 429,
    sleep: async () => {}
  };
});

jest.unstable_mockModule('node-fetch', () => ({
  default: mockFetch
}));

jest.unstable_mockModule('../../src/services/tokenManager.js', () => ({
  getAccessToken: mockGetAccessToken
}));

jest.unstable_mockModule('../../src/utils/errorLogger.js', () => ({
  logApiRequest: mockLogApiRequest,
  logApiResponse: mockLogApiResponse,
  logError: mockLogError
}));

jest.unstable_mockModule('../../src/utils/rateLimit.js', () => ({
  FreeeRateLimiter: MockRateLimiter,
  handleRateLimit: mockHandleRateLimit
}));

const { getItems } = await import('../../src/services/freeeClient.js');

describe('freeeClient', () => {
  beforeEach(() => {
    process.env.FREEE_API_BASE_URL = 'https://api.freee.co.jp';
    process.env.FREEE_COMPANY_ID = 'test-company-id';
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockRateLimiterAcquire.mockResolvedValue(true);
    delete process.env.FREEE_COMPANY_ID;
  });

  describe('getItems', () => {
    test('品目一覧を正常に取得できること', async () => {
      const mockToken = 'mock-access-token';
      const mockResponse = {
        items: [
          {
            id: 1001,
            code: 'ITEM001',
            name: 'ソフトウェアライセンス',
            shortcut1: 'ライセンス',
            shortcut2: 'SW'
          }
        ]
      };

      mockGetAccessToken.mockResolvedValue(mockToken);
      
      const mockFetchResponse = {
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse))
      };
      mockFetch.mockResolvedValue(mockFetchResponse);

      const result = await getItems();

      expect(mockGetAccessToken).toHaveBeenCalledWith('freee');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.freee.co.jp/api/1/items?company_id=test-company-id',
        {
          headers: {
            Authorization: `Bearer ${mockToken}`
          }
        }
      );
      expect(result).toEqual(mockResponse);
    });

    test('パラメータ付きで品目一覧を取得できること', async () => {
      const mockToken = 'mock-access-token';
      const params = { company_id: 123 };
      
      mockGetAccessToken.mockResolvedValue(mockToken);
      
      const mockFetchResponse = {
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify({ items: [] }))
      };
      mockFetch.mockResolvedValue(mockFetchResponse);

      await getItems(params);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.freee.co.jp/api/1/items?company_id=123',
        {
          headers: {
            Authorization: `Bearer ${mockToken}`
          }
        }
      );
    });

    test('APIがエラーレスポンスを返した場合、エラーをスローすること', async () => {
      const mockToken = 'mock-access-token';
      mockGetAccessToken.mockResolvedValue(mockToken);
      
      const mockFetchResponse = {
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue('Unauthorized')
      };
      mockFetch.mockResolvedValue(mockFetchResponse);

      await expect(getItems()).rejects.toThrow('freee API error: 401 Unauthorized');
    });

    test('ネットワークエラーが発生した場合、エラーをスローすること', async () => {
      const mockToken = 'mock-access-token';
      mockGetAccessToken.mockResolvedValue(mockToken);
      
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(getItems()).rejects.toThrow('Network error');
    });

    test('トークン取得に失敗した場合、エラーをスローすること', async () => {
      mockGetAccessToken.mockRejectedValue(new Error('Token refresh failed'));

      await expect(getItems()).rejects.toThrow('Token refresh failed');
    });

    test('APIリクエストとレスポンスが正しい引数でロギングされること', async () => {
      const mockToken = 'mock-access-token';
      const params = { company_id: 987 };
      const mockResponse = { items: [] };

      mockGetAccessToken.mockResolvedValue(mockToken);
      const mockFetchResponse = {
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse))
      };
      mockFetch.mockResolvedValue(mockFetchResponse);

      await getItems(params);

      const expectedUrl = 'https://api.freee.co.jp/api/1/items?company_id=987';

      expect(mockLogApiRequest).toHaveBeenCalledWith('GET', expectedUrl, { attempt: 0 });
      expect(mockLogApiResponse).toHaveBeenCalledWith('GET', expectedUrl, 200, expect.any(Number));
    });
  });
});
