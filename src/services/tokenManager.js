import fetch from 'node-fetch';
import { 
  loadSecureTokens, 
  saveSecureTokens, 
  storeTokenSecurely,
  getStoredToken,
  isTokenExpired 
} from './tokenStorage.js';

let cachedTokens = {};
let tokenExpiresAt = {};

const FREEE_TOKEN_URL = 'https://accounts.secure.freee.co.jp/public_api/token';
const REFRESH_BUFFER_SECONDS = 300; // Refresh 5 minutes before expiry

async function refreshFreeeToken() {
  if (!process.env.FREEE_CLIENT_ID || !process.env.FREEE_CLIENT_SECRET) {
    throw new Error('FREEE_CLIENT_ID and FREEE_CLIENT_SECRET must be set in environment variables');
  }

  const storedToken = await getStoredToken('freee');
  if (!storedToken?.refresh_token) {
    throw new Error('No refresh token available for freee. Please authenticate first.');
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: storedToken.refresh_token,
    client_id: process.env.FREEE_CLIENT_ID,
    client_secret: process.env.FREEE_CLIENT_SECRET,
    redirect_uri: process.env.FREEE_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob'
  });

  const response = await fetch(FREEE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh freee token: ${response.status} - ${errorText}`);
  }

  const tokenData = await response.json();
  
  const savedToken = await storeTokenSecurely('freee', tokenData);
  
  cachedTokens.freee = savedToken.access_token;
  tokenExpiresAt.freee = savedToken.expires_at;

  return savedToken.access_token;
}

async function refreshQuickBooksToken() {
  if (!process.env.QB_CLIENT_ID || !process.env.QB_CLIENT_SECRET) {
    throw new Error('QB_CLIENT_ID and QB_CLIENT_SECRET must be set in environment variables');
  }

  const storedToken = await getStoredToken('quickbooks');
  if (!storedToken?.refresh_token) {
    throw new Error('No refresh token available for QuickBooks. Please authenticate first.');
  }

  throw new Error('QuickBooks token refresh not yet implemented');
}

async function requestToken(provider) {
  if (provider === 'freee') {
    if (process.env.FREEE_ACCESS_TOKEN) {
      return {
        token: process.env.FREEE_ACCESS_TOKEN,
        expiresIn: 3600
      };
    }
    
    const token = await refreshFreeeToken();
    return {
      token,
      expiresIn: 3600
    };
  }

  if (provider === 'quickbooks') {
    if (process.env.QB_ACCESS_TOKEN) {
      return {
        token: process.env.QB_ACCESS_TOKEN,
        expiresIn: 3600
      };
    }
    
    const token = await refreshQuickBooksToken();
    return {
      token,
      expiresIn: 3600
    };
  }

  throw new Error(`Unknown provider: ${provider}`);
}

export async function getAccessToken(provider) {
  const now = Date.now();
  
  if (cachedTokens[provider] && tokenExpiresAt[provider]) {
    const bufferTime = REFRESH_BUFFER_SECONDS * 1000;
    if (tokenExpiresAt[provider] - bufferTime > now) {
      return cachedTokens[provider];
    }
  }

  const { token, expiresIn } = await requestToken(provider);
  cachedTokens[provider] = token;
  tokenExpiresAt[provider] = now + expiresIn * 1000;
  return cachedTokens[provider];
}

export async function initializeTokens() {
  try {
    const storedTokens = await loadSecureTokens();
    
    if (storedTokens.freee?.access_token) {
      cachedTokens.freee = storedTokens.freee.access_token;
      tokenExpiresAt.freee = storedTokens.freee.expires_at || 0;
    }
    
    if (storedTokens.quickbooks?.access_token) {
      cachedTokens.quickbooks = storedTokens.quickbooks.access_token;
      tokenExpiresAt.quickbooks = storedTokens.quickbooks.expires_at || 0;
    }
    
    console.log('Token manager initialized successfully');
  } catch (error) {
    console.warn('Failed to initialize tokens from storage:', error.message);
  }
}

export async function storeInitialTokens(provider, tokenData) {
  const savedToken = await storeTokenSecurely(provider, tokenData);
  
  cachedTokens[provider] = savedToken.access_token;
  tokenExpiresAt[provider] = savedToken.expires_at;
  
  console.log(`Initial tokens stored for ${provider}`);
  return savedToken;
}