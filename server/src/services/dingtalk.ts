import dotenv from 'dotenv';

dotenv.config();

const DINGTALK_APP_KEY = process.env.DINGTALK_APP_KEY || '';
const DINGTALK_APP_SECRET = process.env.DINGTALK_APP_SECRET || '';
const REDIRECT_URI = process.env.DINGTALK_REDIRECT_URI || 'http://localhost:3000/api/v1/auth/dingtalk/callback';

// For MVP, mock mode is supported when DINGTALK_APP_KEY is not set
export const IS_MOCK_MODE = !DINGTALK_APP_KEY;

export interface DingTalkUserInfo {
  dingtalkId: string;
  name: string;
  phone: string;
  avatar: string;
}

interface UserAccessTokenResponse {
  accessToken: string;
  refreshToken: string;
  expireIn: number;
}

interface ContactUserInfo {
  unionId: string;
  nick: string;
  mobile: string;
  avatarUrl: string;
}

/**
 * Get DingTalk QR code URL for scan login
 */
export function getQRCodeUrl(state: string): string {
  const redirectUri = encodeURIComponent(REDIRECT_URI);
  return `https://login.dingtalk.com/login/qrcode.htm?goto=${redirectUri}&appkey=${DINGTALK_APP_KEY}&state=${state}`;
}

/**
 * Exchange authCode for user info via DingTalk API
 * Step 1: authCode → accessToken
 * Step 2: accessToken → userInfo
 */
export async function getUserInfoByCode(authCode: string): Promise<DingTalkUserInfo> {
  if (IS_MOCK_MODE) {
    // Mock mode: return fake user data for testing
    return {
      dingtalkId: `mock_${authCode.substring(0, 8)}`,
      name: 'Mock User',
      phone: '13800138000',
      avatar: 'https://static.dingtalk.com/media/mock_avatar.png',
    };
  }

  // Step 1: Exchange authCode for accessToken
  const tokenResponse = await fetch('https://api.dingtalk.com/v1.0/oauth2/userAccessToken', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientId: DINGTALK_APP_KEY,
      clientSecret: DINGTALK_APP_SECRET,
      code: authCode,
      grantType: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Failed to get access token: ${tokenResponse.status} ${errorText}`);
  }

  const tokenData = (await tokenResponse.json()) as UserAccessTokenResponse;
  const { accessToken } = tokenData;

  if (!accessToken) {
    throw new Error('Access token not found in response');
  }

  // Step 2: Get user info with accessToken
  // NOTE: DingTalk v1.0 contact API requires header x-acs-dingtalk-access-token
  // (the older x-accessToken header was deprecated and returns 401).
  const userResponse = await fetch('https://api.dingtalk.com/v1.0/contact/users/me', {
    method: 'GET',
    headers: {
      'x-acs-dingtalk-access-token': accessToken,
    },
  });

  if (!userResponse.ok) {
    const errorText = await userResponse.text();
    throw new Error(`Failed to get user info: ${userResponse.status} ${errorText}`);
  }

  const userInfo = (await userResponse.json()) as ContactUserInfo;

  return {
    dingtalkId: userInfo.unionId,
    name: userInfo.nick || '',
    phone: userInfo.mobile || '',
    avatar: userInfo.avatarUrl || '',
  };
}
