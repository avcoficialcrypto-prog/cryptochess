// ============================================================
// CryptoChess - ChangeNOW Auto-Sweep Service
// Automatically converts accumulated USDC commissions to XMR
// Triggers when commission pool reaches 50 USDC threshold
// ============================================================

const { query, getClient } = require('../db/connection');

// Configuration
const SWEEP_THRESHOLD_USDC = 50;
const CHANGENOW_API_URL = 'https://api.changenow.io/v2';
const SWEEP_INTERVAL_MS = 60 * 1000; // Check every 60 seconds

let sweepTimer = null;
let isSweeping = false;

/**
 * Get the current commission pool balance
 */
async function getCommissionBalance() {
  const result = await query(
    `SELECT total_accumulated FROM commission_pool ORDER BY created_at DESC LIMIT 1`
  );
  if (result.rows.length === 0) return 0;
  return parseFloat(result.rows[0].total_accumulated);
}

/**
 * Create a ChangeNOW exchange order
 * @param {number} fromAmount - USDC amount to swap
 * @param {string} toAddress - XMR wallet address
 * @returns {Promise<Object>} ChangeNOW order details
 */
async function createChangeNOWOrder(fromAmount, toAddress) {
  const apiKey = process.env.CHANGENOW_API_KEY;
  if (!apiKey) {
    throw new Error('CHANGENOW_API_KEY not configured');
  }

  console.log(`[CHANGENOW] Creating exchange order: ${fromAmount} USDC -> XMR to ${toAddress.substring(0, 8)}...`);

  const response = await fetch(`${CHANGENOW_API_URL}/exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-changenow-api-key': apiKey
    },
    body: JSON.stringify({
      from_currency: 'usdt',  // USDC on most platforms uses USDT ticker
      to_currency: 'xmr',
      from_amount: fromAmount.toString(),
      receiver_address: toAddress,
      flow: 'standard'
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ChangeNOW API error (${response.status}): ${error}`);
  }

  const order = await response.json();
  console.log(`[CHANGENOW] Order created: ${order.id} | Status: ${order.status}`);
  return order;
}

/**
 * Check status of an existing ChangeNOW order
 */
async function checkOrderStatus(orderId) {
  const apiKey = process.env.CHANGENOW_API_KEY;
  const response = await fetch(
    `${CHANGENOW_API_URL}/transactions/${orderId}`,
    {
      headers: { 'x-changenow-api-key': apiKey }
    }
  );

  if (!response.ok) {
    throw new Error(`ChangeNOW status check failed: ${response.status}`);
  }

  return await response.json();
}

/**
 * Execute the sweep: deduct from pool, create ChangeNOW order, record transaction
 */
async function executeSweep() {
  if (isSweeping) {
    console.log('[SWEEP] Already sweeping, skipping...');
    return { success: false, reason: 'already_sweeping' };
  }

  const operatorXmrAddress = process.env.OPERATOR_XMR_ADDRESS;
  if (!operatorXmrAddress) {
    console.error('[SWEEP] OPERATOR_XMR_ADDRESS not configured!');
    return { success: false, reason: 'no_xmr_address' };
  }

  isSweeping = true;

  try {
    const balance = await getCommissionBalance();

    if (balance < SWEEP_THRESHOLD_USDC) {
      console.log(`[SWEEP] Balance ${balance} USDC < threshold ${SWEEP_THRESHOLD_USDC}. No sweep needed.`);
      isSweeping = false;
      return { success: false, reason: 'below_threshold', balance };
    }

    console.log(`[SWEEP] Threshold reached! Balance: ${balance} USDC >= ${SWEEP_THRESHOLD_USDC}`);

    // Create ChangeNOW order
    const order = await createChangeNOWOrder(balance, operatorXmrAddress);

    // Record the sweep order
    const sweepResult = await query(
      `INSERT INTO sweep_orders (commission_pool_id, from_amount, to_currency, to_address, changenow_order_id, status, payload)
       VALUES ((SELECT id FROM commission_pool ORDER BY created_at DESC LIMIT 1), $1, 'xmr', $2, $3, $4, $5)
       RETURNING id`,
      [balance, operatorXmrAddress, order.id, order.status, JSON.stringify(order)]
    );

    // Deduct from commission pool
    await query(
      `UPDATE commission_pool
       SET total_accumulated = total_accumulated - $1,
           last_sweep_at = NOW(),
           last_sweep_amount = $1,
           sweep_tx_hash = $2,
           updated_at = NOW()
       WHERE id = (SELECT id FROM commission_pool ORDER BY created_at DESC LIMIT 1)`,
      [balance, order.id]
    );

    // Record transaction
    await query(
      `INSERT INTO transactions (user_id, type, amount_usdc, balance_after, description, external_tx_hash)
       VALUES ((SELECT id FROM users LIMIT 1), 'commission_sweep', $1, 0,
               'Automated commission sweep: USDC to XMR via ChangeNOW', $2)`,
      [-balance, order.id]
    );

    console.log(`[SWEEP] Sweep executed successfully! Amount: ${balance} USDC -> XMR | Order: ${order.id}`);

    isSweeping = false;
    return { success: true, orderId: order.id, amount: balance };

  } catch (err) {
    isSweeping = false;
    console.error('[SWEEP] Sweep execution failed:', err.message);
    return { success: false, reason: 'error', error: err.message };
  }
}

/**
 * Poll ChangeNOW order status (for monitoring)
 */
async function pollOrderStatus(orderId) {
  try {
    const status = await checkOrderStatus(orderId);

    if (status.status === 'completed') {
      console.log(`[SWEEP] Order ${orderId} completed! Received: ${status.to_amount} XMR`);

      await query(
        `UPDATE sweep_orders SET status = 'completed', to_amount = $1, completed_at = NOW()
         WHERE changenow_order_id = $2`,
        [status.to_amount, orderId]
      );

      return { status: 'completed', toAmount: status.to_amount };
    }

    // Update status in DB
    await query(
      `UPDATE sweep_orders SET status = $1 WHERE changenow_order_id = $2`,
      [status.status, orderId]
    );

    return { status: status.status };
  } catch (err) {
    console.error(`[SWEEP] Status poll failed for ${orderId}:`, err.message);
    return { status: 'error', error: err.message };
  }
}

/**
 * Start the automatic sweep monitor
 */
function startSweepMonitor() {
  if (sweepTimer) {
    console.log('[SWEEP] Monitor already running');
    return;
  }

  console.log(`[SWEEP] Starting sweep monitor | Threshold: ${SWEEP_THRESHOLD_USDC} USDC | Interval: ${SWEEP_INTERVAL_MS / 1000}s`);

  sweepTimer = setInterval(async () => {
    try {
      const balance = await getCommissionBalance();
      if (balance >= SWEEP_THRESHOLD_USDC) {
        console.log(`[SWEEP] Threshold reached: ${balance} >= ${SWEEP_THRESHOLD_USDC}`);
        await executeSweep();
      }
    } catch (err) {
      console.error('[SWEEP] Monitor error:', err.message);
    }
  }, SWEEP_INTERVAL_MS);
}

/**
 * Stop the sweep monitor
 */
function stopSweepMonitor() {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
    console.log('[SWEEP] Monitor stopped');
  }
}

module.exports = {
  getCommissionBalance,
  executeSweep,
  pollOrderStatus,
  startSweepMonitor,
  stopSweepMonitor,
  SWEEP_THRESHOLD_USDC
};
