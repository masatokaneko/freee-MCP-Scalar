#!/usr/bin/env node
import 'dotenv/config';
import http from 'http';
import url from 'url';
import crypto from 'crypto';
import fetch from 'node-fetch';
import open from 'open';

const CLIENT_ID = process.env.FREEE_CLIENT_ID || '611963754455770';
const CLIENT_SECRET = process.env.FREEE_CLIENT_SECRET || 'fFfbKTl-4gZLWFAZZdWqA2-oUWmET-xPlv-lyzargjO8oppQP6pWDnlLk0u5rJjnNAGXjstHrNfsAKoXUhtbJQ';
const REDIRECT_URI = 'http://127.0.0.1:8080/callback';
const AUTH_URL = 'https://accounts.secure.freee.co.jp/public_api/authorize';
const TOKEN_URL = 'https://accounts.secure.freee.co.jp/public_api/token';

// Generate state for security
const state = crypto.randomBytes(16).toString('hex');

// Create authorization URL
const authorizationUrl = `${AUTH_URL}?` + new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  state: state
}).toString();

console.log('Starting OAuth flow...');
console.log('Authorization URL:', authorizationUrl);

// Create a simple HTTP server to handle the callback
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  if (parsedUrl.pathname === '/callback') {
    const code = parsedUrl.query.code;
    const returnedState = parsedUrl.query.state;
    
    if (returnedState !== state) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('State mismatch - possible CSRF attack');
      server.close();
      return;
    }
    
    if (code) {
      console.log('Authorization code received:', code);
      
      try {
        // Exchange code for token
        const tokenResponse = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code: code,
            redirect_uri: REDIRECT_URI
          }).toString()
        });
        
        if (!tokenResponse.ok) {
          const error = await tokenResponse.text();
          throw new Error(`Token exchange failed: ${tokenResponse.status} ${error}`);
        }
        
        const tokenData = await tokenResponse.json();
        
        console.log('\n✅ Successfully obtained tokens!');
        console.log('Access Token:', tokenData.access_token);
        console.log('Refresh Token:', tokenData.refresh_token);
        console.log('Expires In:', tokenData.expires_in, 'seconds');
        
        // Save to .env file
        const envContent = `
# Freee API Tokens (obtained ${new Date().toISOString()})
FREEE_ACCESS_TOKEN=${tokenData.access_token}
FREEE_REFRESH_TOKEN=${tokenData.refresh_token}
FREEE_TOKEN_EXPIRES_AT=${new Date(Date.now() + tokenData.expires_in * 1000).toISOString()}
`;
        
        console.log('\nAdd these to your .env file:', envContent);
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body>
              <h1>✅ Authentication Successful!</h1>
              <p>You can close this window and return to the terminal.</p>
              <pre>${envContent}</pre>
            </body>
          </html>
        `);
        
      } catch (error) {
        console.error('Error exchanging code for token:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error: ' + error.message);
      }
      
      server.close();
    } else {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('No authorization code received');
      server.close();
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(8080, '127.0.0.1', () => {
  console.log('Callback server listening on http://127.0.0.1:8080');
  console.log('\nOpening browser for authentication...');
  console.log('If the browser doesn\'t open, manually visit:');
  console.log(authorizationUrl);
  
  // Try to open the browser automatically
  import('open').then(module => {
    module.default(authorizationUrl);
  }).catch(() => {
    console.log('Could not open browser automatically.');
  });
});

// Handle server errors
server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close();
  process.exit(0);
});