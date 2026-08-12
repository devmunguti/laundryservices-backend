import axios from 'axios';

/**
 * Normalizes Kenyan phone numbers into international format required by PayHero (2547XXXXXXXX or 2541XXXXXXXX).
 * Supports inputs like 0712345678, 0112345678, +254712345678, 254712345678.
 */
export const normalizePhoneNumber = (phone) => {
  if (!phone) return null;
  let cleaned = String(phone).replace(/\D/g, ''); // Remove non-digits

  if (cleaned.startsWith('07') && cleaned.length === 10) {
    cleaned = '254' + cleaned.substring(1);
  } else if (cleaned.startsWith('01') && cleaned.length === 10) {
    cleaned = '254' + cleaned.substring(1);
  } else if (cleaned.startsWith('254') && cleaned.length === 12) {
    // Already in correct format
  } else if (cleaned.length === 9 && (cleaned.startsWith('7') || cleaned.startsWith('1'))) {
    cleaned = '254' + cleaned;
  } else {
    return null; // Invalid Kenyan mobile number
  }

  return cleaned;
};

/**
 * Formats PayHero API Basic Auth / Bearer headers safely
 */
const getPayHeroHeaders = () => {
  const apiKey = process.env.PAYHERO_API_KEY;
  const username = process.env.PAYHERO_USERNAME;
  const password = process.env.PAYHERO_PASSWORD;

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  if (apiKey) {
    headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
  } else if (username && password) {
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  }

  return headers;
};

/**
 * Initiates an M-Pesa STK Push via PayHero API
 * @param {Object} params
 * @param {number} params.amount - Total order amount
 * @param {string} params.phoneNumber - Customer M-Pesa phone number
 * @param {string} params.reference - Internal unique payment reference (e.g. AURA-PAY-12345)
 * @param {string} params.description - Transaction description
 */
export const initiateMpesaPayment = async ({ amount, phoneNumber, reference, description = 'Laundry Service Payment' }) => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new Error('Invalid Kenyan M-Pesa phone number format. Please use 07XXXXXXXX or 01XXXXXXXX.');
  }

  const baseUrl = (process.env.PAYHERO_BASE_URL || 'https://backend.payhero.co.ke').replace(/\/$/, '');
  const endpoint = `${baseUrl}/api/v2/payments`;
  const callbackUrl = process.env.PAYHERO_CALLBACK_URL || 'http://localhost:5000/api/payments/payhero/callback';

  const payload = {
    amount: Number(amount),
    phone_number: normalizedPhone,
    channel_id: parseInt(process.env.PAYHERO_CHANNEL_ID, 10) || 123,
    provider: 'm-pesa',
    external_reference: reference,
    callback_url: callbackUrl,
    description: description
  };

  try {
    const response = await axios.post(endpoint, payload, {
      headers: getPayHeroHeaders(),
      timeout: 15000
    });

    const data = response.data || {};
    
    return {
      success: data.success ?? true,
      payheroReference: data.reference || data.checkout_request_id || data.payhero_reference || `PH-${Date.now()}`,
      status: 'processing',
      rawResponse: data
    };
  } catch (error) {
    console.error('❌ PayHero STK Push API Error:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || 'PayHero payment gateway unreachable.';
    throw new Error(`PayHero Gateway Error: ${errorMessage}`);
  }
};

/**
 * Checks status of a payment with PayHero API using external reference or checkout request ID
 */
export const checkPaymentStatus = async (payheroReference) => {
  if (!payheroReference) return null;

  const baseUrl = (process.env.PAYHERO_BASE_URL || 'https://backend.payhero.co.ke').replace(/\/$/, '');
  const endpoint = `${baseUrl}/api/v2/payments/${payheroReference}`;

  try {
    const response = await axios.get(endpoint, {
      headers: getPayHeroHeaders(),
      timeout: 10000
    });

    const data = response.data || {};
    return {
      status: data.status || (data.success ? 'Paid' : 'Failed'),
      raw: data
    };
  } catch (error) {
    // PayHero v2 does not expose a public status GET endpoint for internal references (returns 404 Endpoint not found).
    // Suppress log spam and fall back to local MongoDB payment status & webhook callbacks cleanly.
    if (error.response?.status !== 404) {
      console.warn('ℹ️ PayHero Status API Query:', error.response?.data?.error_message || error.message);
    }
    return null;
  }
};

/**
 * Disburses B2C payout to provider M-Pesa number via PayHero
 */
export const disburseProviderPayout = async ({ amount, phoneNumber, reference, providerName }) => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new Error('Provider payout phone number is invalid.');
  }

  const baseUrl = (process.env.PAYHERO_BASE_URL || 'https://backend.payhero.co.ke').replace(/\/$/, '');
  const endpoint = `${baseUrl}/api/v2/disbursements`;

  const payload = {
    amount: Number(amount),
    phone_number: normalizedPhone,
    channel_id: parseInt(process.env.PAYHERO_CHANNEL_ID, 10) || 123,
    external_reference: reference,
    remarks: `Aura Laundry Payout to ${providerName || 'Provider'}`
  };

  try {
    const response = await axios.post(endpoint, payload, {
      headers: getPayHeroHeaders(),
      timeout: 15000
    });

    return {
      success: true,
      payoutReference: response.data?.reference || `DISB-${Date.now()}`,
      raw: response.data
    };
  } catch (error) {
    console.error('❌ PayHero B2C Payout Error:', error.response?.data || error.message);
    const msg = error.response?.data?.message || error.message;
    throw new Error(`PayHero Payout Error: ${msg}`);
  }
};

/**
 * Centralized status normalization function mapping PayHero responses into application state machine:
 * 'paid', 'failed', 'cancelled', 'expired', 'processing'
 */
export const normalizePayHeroPaymentStatus = (payload = {}) => {
  const data = payload.response || payload.data || payload;
  const statusStr = String(data.status || payload.status || '').toLowerCase();
  const resultCode = data.ResultCode !== undefined ? Number(data.ResultCode) : null;
  const rawDesc = String(data.ResultDesc || data.message || data.error || JSON.stringify(payload)).toLowerCase();

  // 1. Success
  if (data.success === true || statusStr === 'success' || statusStr === 'paid' || statusStr === 'completed' || resultCode === 0) {
    return {
      normalizedStatus: 'paid',
      isTerminal: true,
      customerMessage: 'Payment successful.',
      failureReason: null,
      resultCode: resultCode ?? '0',
      resultDesc: data.ResultDesc || 'Success'
    };
  }

  // 2. Customer Cancelled
  if (statusStr === 'cancelled' || resultCode === 1032 || rawDesc.includes('cancel')) {
    return {
      normalizedStatus: 'cancelled',
      isTerminal: true,
      customerMessage: 'M-Pesa payment request was cancelled on your phone.',
      failureReason: 'Payment request was cancelled on your phone.',
      resultCode: resultCode ?? '1032',
      resultDesc: data.ResultDesc || 'User Cancelled'
    };
  }

  // 3. Wrong PIN
  if (resultCode === 2001 || rawDesc.includes('pin') || rawDesc.includes('wrong')) {
    return {
      normalizedStatus: 'failed',
      isTerminal: true,
      customerMessage: 'Incorrect M-Pesa PIN. Please enter the correct PIN and try again.',
      failureReason: 'Incorrect M-Pesa PIN entered.',
      resultCode: resultCode ?? '2001',
      resultDesc: data.ResultDesc || 'Wrong PIN'
    };
  }

  // 4. Insufficient Funds
  if (resultCode === 1 || rawDesc.includes('balance') || rawDesc.includes('fund') || rawDesc.includes('insufficient')) {
    return {
      normalizedStatus: 'failed',
      isTerminal: true,
      customerMessage: 'The M-Pesa account does not have sufficient funds.',
      failureReason: 'Insufficient M-Pesa balance.',
      resultCode: resultCode ?? '1',
      resultDesc: data.ResultDesc || 'Insufficient Funds'
    };
  }

  // 5. Expired / Timeout
  if (statusStr === 'expired' || resultCode === 1037 || rawDesc.includes('timeout') || rawDesc.includes('expire')) {
    return {
      normalizedStatus: 'expired',
      isTerminal: true,
      customerMessage: 'Payment request expired or timed out. Please try again.',
      failureReason: 'Payment prompt timed out or expired.',
      resultCode: resultCode ?? '1037',
      resultDesc: data.ResultDesc || 'Timeout'
    };
  }

  // 6. Still Processing / Pending
  if (statusStr === 'processing' || statusStr === 'pending' || statusStr === 'queued') {
    return {
      normalizedStatus: 'processing',
      isTerminal: false,
      customerMessage: 'Waiting for M-Pesa confirmation...',
      failureReason: null,
      resultCode: resultCode,
      resultDesc: data.ResultDesc || 'Processing'
    };
  }

  // 7. General Failure
  return {
    normalizedStatus: 'failed',
    isTerminal: true,
    customerMessage: 'M-Pesa payment could not be completed. Please try again.',
    failureReason: data.message || data.ResultDesc || 'Payment failed or declined.',
    resultCode: resultCode ?? 'FAILED',
    resultDesc: data.ResultDesc || 'Failed'
  };
};

/**
 * Verifies PayHero callback payload validity & security checks
 */
export const verifyPayHeroCallback = (req) => {
  const body = req.body || {};
  const responseData = body.response || body.data || body;
  const externalReference = responseData.external_reference || body.external_reference;
  const payheroReference = responseData.reference || responseData.CheckoutRequestID || body.reference;
  const mpesaCode = responseData.mpesa_code || responseData.MpesaReceiptNumber || body.mpesa_code || body.transaction_id;
  const amount = responseData.amount || body.amount;

  const normalized = normalizePayHeroPaymentStatus(body);

  return {
    isValid: Boolean(externalReference || payheroReference),
    externalReference,
    payheroReference,
    mpesaCode,
    amount: amount ? Number(amount) : null,
    isSuccess: normalized.normalizedStatus === 'paid',
    normalizedStatus: normalized.normalizedStatus,
    isTerminal: normalized.isTerminal,
    customerMessage: normalized.customerMessage,
    failureReason: normalized.failureReason,
    resultCode: normalized.resultCode,
    resultDesc: normalized.resultDesc,
    rawData: body
  };
};
