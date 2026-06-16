import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import type { DingTalkUserInfo } from '../../services/dingtalk';

vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
  config: vi.fn(),
}));

describe('DingTalk Service', () => {
  let getQRCodeUrl: typeof import('../../services/dingtalk').getQRCodeUrl;
  let getUserInfoByCode: typeof import('../../services/dingtalk').getUserInfoByCode;
  let mockFetch: ReturnType<typeof vi.fn>;
  const ORIGINAL_APP_KEY = process.env.DINGTALK_APP_KEY;
  const ORIGINAL_APP_SECRET = process.env.DINGTALK_APP_SECRET;
  const ORIGINAL_REDIRECT_URI = process.env.DINGTALK_REDIRECT_URI;

  beforeAll(async () => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    // Set env vars BEFORE dynamic import so module reads them
    process.env.DINGTALK_APP_KEY = 'test-app-key';
    process.env.DINGTALK_APP_SECRET = 'test-app-secret';
    process.env.DINGTALK_REDIRECT_URI = 'http://localhost:3000/callback';

    const dingtalk = await import('../../services/dingtalk');
    getQRCodeUrl = dingtalk.getQRCodeUrl;
    getUserInfoByCode = dingtalk.getUserInfoByCode;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    process.env.DINGTALK_APP_KEY = ORIGINAL_APP_KEY;
    process.env.DINGTALK_APP_SECRET = ORIGINAL_APP_SECRET;
    process.env.DINGTALK_REDIRECT_URI = ORIGINAL_REDIRECT_URI;
  });

  describe('getQRCodeUrl', () => {
    it('returns correct URL with state parameter', () => {
      const url = getQRCodeUrl('test-state-123');
      expect(url).toContain('https://login.dingtalk.com/login/qrcode.htm');
      expect(url).toContain('goto=' + encodeURIComponent('http://localhost:3000/callback'));
      expect(url).toContain('appkey=test-app-key');
      expect(url).toContain('state=test-state-123');
    });
  });

  describe('getUserInfoByCode', () => {
    it('exchanges authCode for user info via DingTalk API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          expireIn: 7200,
        }),
      } as Response);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          unionId: 'union-id-123',
          nick: 'Test User',
          mobile: '13800138001',
          avatarUrl: 'https://example.com/avatar.png',
        }),
      } as Response);

      const result = await getUserInfoByCode('auth-code-123');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.dingtalk.com/v1.0/oauth2/userAccessToken',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('auth-code-123'),
        })
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.dingtalk.com/v1.0/contact/users/me',
        expect.objectContaining({
          method: 'GET',
          headers: { 'x-acs-dingtalk-access-token': 'test-access-token' },
        })
      );
      expect(result).toEqual<DingTalkUserInfo>({
        dingtalkId: 'union-id-123',
        name: 'Test User',
        phone: '13800138001',
        avatar: 'https://example.com/avatar.png',
      });
    });

    it('throws when token request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      } as Response);

      await expect(getUserInfoByCode('bad-code')).rejects.toThrow(
        'Failed to get access token: 400 Bad Request'
      );
    });

    it('throws when access token not found in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ refreshToken: 'test-refresh', expireIn: 7200 }),
      } as Response);

      await expect(getUserInfoByCode('no-token-code')).rejects.toThrow(
        'Access token not found in response'
      );
    });

    it('throws when user info request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          expireIn: 7200,
        }),
      } as Response);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      } as Response);

      await expect(getUserInfoByCode('forbidden-code')).rejects.toThrow(
        'Failed to get user info: 403 Forbidden'
      );
    });
  });

  describe('mock mode', () => {
    it('returns fixed user data when DINGTALK_APP_KEY is not set', async () => {
      delete process.env.DINGTALK_APP_KEY;
      delete process.env.DINGTALK_APP_SECRET;
      vi.resetModules();

      const dingtalk = await import('../../services/dingtalk');
      const result = await dingtalk.getUserInfoByCode('mock-auth-code');

      expect(result.dingtalkId).toBe('mock_mock-aut');
      expect(result.name).toBe('Mock User');
      expect(result.phone).toBe('13800138000');
      expect(result.avatar).toBe('https://static.dingtalk.com/media/mock_avatar.png');

      // Restore env for other tests
      process.env.DINGTALK_APP_KEY = 'test-app-key';
      process.env.DINGTALK_APP_SECRET = 'test-app-secret';
      vi.resetModules();
    });
  });
});
