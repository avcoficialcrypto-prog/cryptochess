// ============================================================
// CryptoChess - Google reCAPTCHA v2 Verification
// ============================================================

const express = require('express');
const router = express.Router();
const https = require('https');

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY || '';

// Verify reCAPTCHA token
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, error: 'No token provided' });
    }

    // If no secret key configured, skip verification (dev mode)
    if (!RECAPTCHA_SECRET) {
      console.log('[reCAPTCHA] No secret key configured, skipping verification (dev mode)');
      return res.json({ success: true, message: 'Verification skipped (dev mode)' });
    }

    // Verify with Google reCAPTCHA API
    const postData = `secret=${encodeURIComponent(RECAPTCHA_SECRET)}&response=${encodeURIComponent(token)}&remoteip=${encodeURIComponent(req.ip || '')}`;

    const options = {
      hostname: 'www.google.com',
      path: '/recaptcha/api/siteverify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
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
            reject(new Error('Invalid response from Google'));
          }
        });
      });
      request.on('error', reject);
      request.write(postData);
      request.end();
    });

    if (result.success) {
      console.log('[reCAPTCHA] Verification passed, score:', result.score);
      res.json({ success: true });
    } else {
      console.log('[reCAPTCHA] Verification failed:', result['error-codes']);
      res.status(403).json({
        success: false,
        error: 'Verification failed',
        errors: result['error-codes']
      });
    }
  } catch (err) {
    console.error('[reCAPTCHA] Error:', err);
    res.status(500).json({ success: false, error: 'Server error during verification' });
  }
});

module.exports = router;
