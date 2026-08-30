// ============================================================
// CryptoChess - Cloudflare Turnstile Verification
// ============================================================

const express = require('express');
const router = express.Router();
const https = require('https');

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || '';

// Verify Turnstile token
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, error: 'No token provided' });
    }

    // If no secret key configured, skip verification (dev mode)
    if (!TURNSTILE_SECRET) {
      console.log('[Turnstile] No secret key configured, skipping verification');
      return res.json({ success: true, message: 'Verification skipped (dev mode)' });
    }

    // Verify with Cloudflare
    const verifyData = JSON.stringify({
      secret: TURNSTILE_SECRET,
      response: token,
      remoteip: req.ip,
    });

    const options = {
      hostname: 'challenges.cloudflare.com',
      path: '/turnstile/v0/siteverify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(verifyData),
      },
    };

    const result = await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid response from Cloudflare'));
          }
        });
      });
      request.on('error', reject);
      request.write(verifyData);
      request.end();
    });

    if (result.success) {
      res.json({ success: true });
    } else {
      console.log('[Turnstile] Verification failed:', result);
      res.status(403).json({ success: false, error: 'Verification failed', errors: result['error-codes'] });
    }
  } catch (err) {
    console.error('[Turnstile] Error:', err);
    res.status(500).json({ success: false, error: 'Server error during verification' });
  }
});

module.exports = router;
