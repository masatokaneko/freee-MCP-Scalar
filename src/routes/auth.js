import express from 'express';
import fetch from 'node-fetch';
import { storeInitialTokens } from '../services/tokenManager.js';

const router = express.Router();

const FREEE_AUTH_BASE_URL = 'https://accounts.secure.freee.co.jp';
const FREEE_TOKEN_URL = `${FREEE_AUTH_BASE_URL}/public_api/token`;

// freee OAuth認証開始
router.get('/freee', (req, res) => {
  if (!process.env.FREEE_CLIENT_ID) {
    return res.status(500).send('FREEE_CLIENT_ID not configured');
  }

  const redirectUri = process.env.FREEE_REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/auth/freee/callback`;
  
  const authUrl = new URL(`${FREEE_AUTH_BASE_URL}/public_api/authorize`);
  authUrl.searchParams.append('client_id', process.env.FREEE_CLIENT_ID);
  authUrl.searchParams.append('redirect_uri', redirectUri);
  authUrl.searchParams.append('response_type', 'code');
  
  console.log('Redirecting to freee OAuth:', authUrl.toString());
  res.redirect(authUrl.toString());
});

// freee OAuth コールバック
router.get('/freee/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    console.error('OAuth error:', error);
    return res.status(400).send(`Authentication failed: ${error}`);
  }

  if (!code) {
    return res.status(400).send('No authorization code received');
  }

  try {
    const redirectUri = process.env.FREEE_REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/auth/freee/callback`;
    
    // アクセストークンを取得
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: process.env.FREEE_CLIENT_ID,
      client_secret: process.env.FREEE_CLIENT_SECRET
    });

    console.log('Exchanging code for token...');
    const response = await fetch(FREEE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token exchange failed:', response.status, errorText);
      return res.status(response.status).send(`Token exchange failed: ${errorText}`);
    }

    const tokenData = await response.json();
    console.log('Token received successfully');
    
    // トークンを安全に保存
    await storeInitialTokens('freee', tokenData);
    
    res.send(`
      <html>
        <head>
          <title>認証成功</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 50px; text-align: center; }
            .success { color: green; font-size: 24px; margin-bottom: 20px; }
            .info { background: #f0f0f0; padding: 20px; border-radius: 5px; margin: 20px auto; max-width: 600px; }
            .token-info { text-align: left; font-family: monospace; }
          </style>
        </head>
        <body>
          <div class="success">✅ freee認証が成功しました！</div>
          <div class="info">
            <h3>トークン情報</h3>
            <div class="token-info">
              <p>アクセストークン: ${tokenData.access_token ? '取得済み' : '未取得'}</p>
              <p>リフレッシュトークン: ${tokenData.refresh_token ? '取得済み' : '未取得'}</p>
              <p>有効期限: ${tokenData.expires_in}秒</p>
              <p>会社ID: ${tokenData.company_id || '不明'}</p>
            </div>
            <p>トークンは暗号化されて保存されました。</p>
            <p>今後は自動的にトークンがリフレッシュされます。</p>
          </div>
          <p><a href="/">ホームに戻る</a></p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send(`Authentication error: ${error.message}`);
  }
});

// 手動でトークンを設定（デバッグ用）
router.post('/freee/manual', async (req, res) => {
  const { access_token, refresh_token, expires_in, company_id } = req.body;

  if (!access_token || !refresh_token) {
    return res.status(400).json({ error: 'access_token and refresh_token are required' });
  }

  try {
    const tokenData = {
      access_token,
      refresh_token,
      expires_in: expires_in || 3600,
      company_id,
      token_type: 'Bearer',
      created_at: Date.now()
    };

    await storeInitialTokens('freee', tokenData);
    res.json({ message: 'Token stored successfully' });
  } catch (error) {
    console.error('Manual token storage error:', error);
    res.status(500).json({ error: error.message });
  }
});

// トークン状態確認
router.get('/status', async (req, res) => {
  try {
    const { getStoredToken, isTokenExpired } = await import('../services/tokenStorage.js');
    
    const freeeToken = await getStoredToken('freee');
    const freeeExpired = await isTokenExpired('freee');
    
    res.json({
      freee: {
        hasToken: !!freeeToken,
        hasAccessToken: !!freeeToken?.access_token,
        hasRefreshToken: !!freeeToken?.refresh_token,
        isExpired: freeeExpired,
        expiresAt: freeeToken?.expires_at ? new Date(freeeToken.expires_at).toISOString() : null,
        companyId: freeeToken?.company_id
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;