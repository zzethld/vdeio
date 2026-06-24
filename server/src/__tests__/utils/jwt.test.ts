import { describe, it, expect, vi } from 'vitest';

// Set environment variables BEFORE importing the JWT module
process.env.JWT_SECRET = 'test_jwt_secret_key_for_access_tokens';
process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_key_for_refresh_tokens';

import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  JwtPayload,
  JwtError,
} from '../../utils/jwt';

describe('JWT Utilities', () => {
  const payload: JwtPayload = {
    userId: 42,
    storeId: 7,
    deviceId: 'device-abc-123',
    role: 'admin',
  };

  describe('signAccessToken', () => {
    it('should create a token with correct payload fields', () => {
      const token = signAccessToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // header.payload.signature

      // Verify by decoding
      const decoded = verifyAccessToken(token);
      expect(decoded.userId).toBe(42);
      expect(decoded.storeId).toBe(7);
      expect(decoded.deviceId).toBe('device-abc-123');
      expect(decoded.role).toBe('admin');
    });
  });

  describe('signRefreshToken', () => {
    it('should create a refresh token with longer expiry', () => {
      const refreshToken = signRefreshToken(payload);

      expect(refreshToken).toBeDefined();
      expect(typeof refreshToken).toBe('string');
      expect(refreshToken.split('.')).toHaveLength(3);

      // Verify it can be decoded
      const decoded = verifyRefreshToken(refreshToken);
      expect(decoded.userId).toBe(42);
      expect(decoded.role).toBe('admin');
    });

    it('should verify a valid refresh token successfully', () => {
      const refreshToken = signRefreshToken(payload);
      const decoded = verifyRefreshToken(refreshToken);

      expect(decoded).toMatchObject({
        userId: 42,
        storeId: 7,
        deviceId: 'device-abc-123',
        role: 'admin',
      });
    });

    it('should throw JwtError when refresh token is expired', () => {
      vi.useFakeTimers();
      const refreshToken = signRefreshToken(payload);
      // Advance time by 8 days to exceed the 7-day refresh token expiry
      vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000);

      expect(() => verifyRefreshToken(refreshToken)).toThrow(JwtError);
      expect(() => verifyRefreshToken(refreshToken)).toThrow('Refresh token has expired');
      vi.useRealTimers();
    });

    it('should throw JwtError for invalid refresh token', () => {
      expect(() => verifyRefreshToken('not.a.valid.token')).toThrow(JwtError);
      expect(() => verifyRefreshToken('not.a.valid.token')).toThrow('Invalid refresh token');
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify a valid access token', () => {
      const token = signAccessToken(payload);
      const decoded = verifyAccessToken(token);

      expect(decoded.userId).toBe(42);
      expect(decoded.storeId).toBe(7);
      expect(decoded.deviceId).toBe('device-abc-123');
      expect(decoded.role).toBe('admin');
    });

    it('should throw JwtError when access token is expired', () => {
      vi.useFakeTimers();
      const token = signAccessToken(payload);
      // Advance time by 3 hours to exceed the 2-hour access token expiry
      vi.advanceTimersByTime(3 * 60 * 60 * 1000);

      expect(() => verifyAccessToken(token)).toThrow(JwtError);
      expect(() => verifyAccessToken(token)).toThrow('Access token has expired');
      vi.useRealTimers();
    });
  });

  describe('token payload shape', () => {
    it('should have correct shape with all required fields', () => {
      const token = signAccessToken(payload);
      const decoded = verifyAccessToken(token);

      expect(decoded).toHaveProperty('userId');
      expect(decoded).toHaveProperty('storeId');
      expect(decoded).toHaveProperty('deviceId');
      expect(decoded).toHaveProperty('role');
      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');

      expect(typeof decoded.userId).toBe('number');
      expect(decoded.role).toMatch(/^(admin|operator)$/);
    });

    it('should handle null storeId and deviceId', () => {
      const minimalPayload: JwtPayload = {
        userId: 99,
        storeId: null,
        deviceId: null,
        role: 'operator',
      };

      const token = signAccessToken(minimalPayload);
      const decoded = verifyAccessToken(token);

      expect(decoded.userId).toBe(99);
      expect(decoded.storeId).toBeNull();
      expect(decoded.deviceId).toBeNull();
      expect(decoded.role).toBe('operator');
    });
  });
});
