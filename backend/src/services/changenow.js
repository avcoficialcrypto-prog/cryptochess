// ============================================================
// CryptoChess - ChangeNOW Auto-Sweep Service (SQLite)
// ============================================================

const { query } = require('../db/connection');

const SWEEP_THRESHOLD_USDC = parseFloat(process.env.SWEEP_THRESHOLD_USDC || '50');
const CHANGENOW_API_URL = 'https://api.changenow.io/v2';
const SWEEP_INTERVAL_MS = 60 * 1000;

let sweepTimer = null;
let isSweeping = false;

async function getCommissionBalance() {
  const result = query('SELECT COALESCE(SUM(amount_usdc), 0) as total FROM commission_pool');
  return parseFloat(result.rows[0]?.total || 0);
}

async function createChangeNOWOrder(fromAmount, toAddress) {
  const apiKey = process.env.CHANGENOW_API_KEY;
  if (!apiKey) throw new Error('CHANGENOW_API_KEY not configured');

  console.log(`[CHANGENOW] Creating order: ${fromAmount} USDC -> XMR`);

  const response = await fetch(`${CHANGENOW_API_URL}/exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-changenow-api-key': apiKey
    },
    body: JSON.stringify({
      from_currency: 'usdt',
      to_currency: 'xmr',
      from_amount: fromAmount.toString(),
      receiver_address: toAddress,
      flow: 'standard'
    })
  });

  if (!response.ok) throw new Error(`ChangeNOW API error: ${response.status}`);
  return await response.json();
}

async function executeSweep() {
  if (isSweeping) return { success: false, reason: 'already_sweeping' };

  const operatorXmrAddress = process.env.OPERATOR_XMR_ADDRESS;
  if (!operatorXmrAddress) return { success: false, reason: 'no_xmr_address' };

  isSweeping = true;
  try {
    const balance = await getCommissionBalance();
    if (balance < SWEEP_THRESHOLD_USDC) {
      isSweeping = false;
      return { success: false, reason: 'below_threshold', balance };
    }

    console.log(`[SWEEP] Threshold reached: ${balance} USDC`);
    const order = await createChangeNOWOrder(balance, operatorXmrAddress);

    await query(
      `INSERT INTO sweep_orders (usdc_amount, changenow_order_id, status) VALUES ($1, $2, $3)`,
      [balance, order.id, order.status]
    );

    console.log(`[SWEEP] Order created: ${order.id} | ${balance} USDC -> XMR`);
    isSweeping = false;
    return { success: true, orderId: order.id, amount: balance };
  } catch (err) {
    isSweeping = false;
    console.error('[SWEEP] Failed:', err.message);
    return { success: false, reason: 'error', error: err.message };
  }
}

function startSweepMonitor() {
  if (sweepTimer) return;
  console.log(`[SWEEP] Monitor started | Threshold: ${SWEEP_THRESHOLD_USDC} USDC`);
  sweepTimer = setInterval(async () => {
    try {
      const balance = await getCommissionBalance();
      if (balance >= SWEEP_THRESHOLD_USDC) await executeSweep();
    } catch (err) {
      console.error('[SWEEP] Monitor error:', err.message);
    }
  }, SWEEP_INTERVAL_MS);
}

function stopSweepMonitor() {
  if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
}

module.exports = { getCommissionBalance, executeSweep, startSweepMonitor, stopSweepMonitor, SWEEP_THRESHOLD_USDC };
