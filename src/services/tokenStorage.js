import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALGORITHM = 'aes-256-gcm';
const TOKEN_FILE_PATH = path.join(__dirname, '../../.tokens.enc');
const KEY_FILE_PATH = path.join(__dirname, '../../.key');

let encryptionKey;

async function getOrCreateKey() {
  if (encryptionKey) {
    return encryptionKey;
  }

  try {
    const keyData = await fs.readFile(KEY_FILE_PATH);
    encryptionKey = keyData;
    return encryptionKey;
  } catch (error) {
    if (error.code === 'ENOENT') {
      encryptionKey = crypto.randomBytes(32);
      await fs.writeFile(KEY_FILE_PATH, encryptionKey);
      await fs.chmod(KEY_FILE_PATH, 0o600);
      console.log('Encryption key generated and saved');
      return encryptionKey;
    }
    throw error;
  }
}

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

function decrypt(encryptedData) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    encryptionKey,
    Buffer.from(encryptedData.iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
  
  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

export async function loadSecureTokens() {
  try {
    await getOrCreateKey();
    const encryptedData = await fs.readFile(TOKEN_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(encryptedData);
    const decrypted = decrypt(parsed);
    return JSON.parse(decrypted);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    console.error('Failed to load secure tokens:', error.message);
    return {};
  }
}

export async function saveSecureTokens(tokens) {
  try {
    await getOrCreateKey();
    const jsonStr = JSON.stringify(tokens);
    const encrypted = encrypt(jsonStr);
    await fs.writeFile(TOKEN_FILE_PATH, JSON.stringify(encrypted, null, 2));
    await fs.chmod(TOKEN_FILE_PATH, 0o600);
  } catch (error) {
    console.error('Failed to save secure tokens:', error.message);
    throw error;
  }
}

export async function storeTokenSecurely(provider, tokenData) {
  const tokens = await loadSecureTokens();
  
  const now = Date.now();
  const expiresAt = now + ((tokenData.expires_in || 3600) * 1000);
  
  tokens[provider] = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: expiresAt,
    created_at: tokenData.created_at || now,
    scope: tokenData.scope,
    token_type: tokenData.token_type || 'Bearer',
    company_id: tokenData.company_id
  };
  
  await saveSecureTokens(tokens);
  console.log(`Tokens securely stored for ${provider}`);
  
  return tokens[provider];
}

export async function getStoredToken(provider) {
  const tokens = await loadSecureTokens();
  return tokens[provider] || null;
}

export async function deleteStoredToken(provider) {
  const tokens = await loadSecureTokens();
  delete tokens[provider];
  await saveSecureTokens(tokens);
  console.log(`Tokens deleted for ${provider}`);
}

export async function isTokenExpired(provider) {
  const token = await getStoredToken(provider);
  if (!token || !token.expires_at) {
    return true;
  }
  
  const now = Date.now();
  const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
  return token.expires_at - bufferTime <= now;
}