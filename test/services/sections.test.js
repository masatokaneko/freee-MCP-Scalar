import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockFetch = jest.fn();
const mockGetAccessToken = jest.fn();

jest.unstable_mockModule('node-fetch', () => ({
  default: mockFetch
}));

jest.unstable_mockModule('../../src/services/tokenManager.js', () => ({
  getAccessToken: mockGetAccessToken
}));

const { getSections } = await import('../../src/services/freeeClient.js');

describe('freeeClient - getSections', () => {
  beforeEach(() => {
    process.env.FREEE_API_BASE_URL = 'https://api.freee.co.jp';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSections', () => {
    test('部門一覧を正常に取得できること', async () => {
      const mockToken = 'mock-access-token';
      const mockResponse = {
        sections: [
          {
            id: 2001,
            name: '営業部',
            long_name: '東京本社営業部',
            shortcut1: '営業',
            shortcut2: 'SALES',
            parent_id: null
          },
          {
            id: 2002,
            name: '開発部',
            long_name: '東京本社開発部',
            shortcut1: '開発',
            shortcut2: 'DEV',
            parent_id: null
          }
        ]
      };

      mockGetAccessToken.mockResolvedValue(mockToken);
      
      const mockFetchResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      };
      mockFetch.mockResolvedValue(mockFetchResponse);

      const result = await getSections();

      expect(mockGetAccessToken).toHaveBeenCalledWith('freee');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.freee.co.jp/api/1/sections?',
        {
          headers: {
            Authorization: `Bearer ${mockToken}`
          }
        }
      );
      expect(result).toEqual(mockResponse);
    });

    test('親部門IDを持つ部門も正しく取得できること', async () => {
      const mockToken = 'mock-access-token';
      const mockResponse = {
        sections: [
          {
            id: 2003,
            name: '営業1課',
            long_name: '東京本社営業部営業1課',
            shortcut1: '営1',
            shortcut2: null,
            parent_id: 2001
          }
        ]
      };

      mockGetAccessToken.mockResolvedValue(mockToken);
      
      const mockFetchResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      };
      mockFetch.mockResolvedValue(mockFetchResponse);

      const result = await getSections();

      expect(result).toEqual(mockResponse);
    });

    test('パラメータ付きで部門一覧を取得できること', async () => {
      const mockToken = 'mock-access-token';
      const params = { company_id: 123 };
      
      mockGetAccessToken.mockResolvedValue(mockToken);
      
      const mockFetchResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ sections: [] })
      };
      mockFetch.mockResolvedValue(mockFetchResponse);

      await getSections(params);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.freee.co.jp/api/1/sections?company_id=123',
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
        status: 403,
        text: jest.fn().mockResolvedValue('Forbidden')
      };
      mockFetch.mockResolvedValue(mockFetchResponse);

      await expect(getSections()).rejects.toThrow('freee API error: 403 Forbidden');
    });
  });
});