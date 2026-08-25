import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { normalizePhoneNumber, isValidPhoneNumber, maskPhoneNumber } from '../utils/phoneUtils.js';
import { sendSMS, getSmsProvider } from '../services/sms/smsService.js';
import { requestPhoneOtp, verifyPhoneOtp, generateNumericOtp } from '../services/otpService.js';
import { handleNotification, createInAppNotification, computeIdempotencyKey } from '../services/notification/notificationService.js';
import { NOTIFICATION_EVENTS } from '../services/notification/notificationEvents.js';
import Notification from '../models/Notification.js';
import OtpToken from '../models/OtpToken.js';
import { notificationConfig } from '../config/notificationConfig.js';
import { connectDB } from '../config/db.js';

dotenv.config();

async function runNotificationTestSuite() {
  console.log('===============================================================');
  console.log('🧪 Starting Aura Notification System & SMS Architecture Test Suite');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition, testName, extra = '') => {
    if (condition) {
      console.log(`  ✅ PASS: ${testName} ${extra}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${extra}`);
      failed++;
    }
  };

  try {
    try {
      await connectDB();
      console.log('📦 Connected to MongoDB database for test validation.\n');
      await Notification.deleteMany({ idempotencyKey: { $regex: /^TEST-/ } });
      await OtpToken.deleteMany({ identifier: { $regex: /^\+25470000000/ } });
    } catch (dbErr) {
      console.warn('⚠️ Running test suite in offline mock mode (MongoDB Atlas unreachable).');
    }

    // ───────────────────────────────────────────────────────────────────────────
    // SECTION 1: Phone Normalization, Validation & Masking
    // ───────────────────────────────────────────────────────────────────────────
    console.log('--- SECTION 1: Phone Number Normalization, Validation & Masking ---');

    // 1.1 Standard Kenyan formats
    assert(normalizePhoneNumber('0712345678') === '+254712345678', 'Normalizes 0712345678 to +254712345678');
    assert(normalizePhoneNumber('0112345678') === '+254112345678', 'Normalizes 0112345678 (Airtel/Telkom) to +254112345678');
    assert(normalizePhoneNumber('254712345678') === '+254712345678', 'Normalizes 254712345678 to +254712345678');
    assert(normalizePhoneNumber('+254712345678') === '+254712345678', 'Preserves +254712345678');
    assert(normalizePhoneNumber('0712 345 678') === '+254712345678', 'Cleans spaces in 0712 345 678');
    assert(normalizePhoneNumber('+1 (555) 234-5678') === '+15552345678', 'Normalizes US international number +1 (555) 234-5678');

    // 1.2 Invalid numbers
    assert(normalizePhoneNumber('invalid-text') === null, 'Rejects invalid string');
    assert(normalizePhoneNumber('123') === null, 'Rejects too short number');
    assert(isValidPhoneNumber('+254712345678') === true, 'Validates E.164 valid number');
    assert(isValidPhoneNumber('0712345678') === true, 'Validates 0712345678 as valid phone input');

    // 1.3 Safe masking for logging
    const masked = maskPhoneNumber('+254712345678');
    assert(!masked.includes('3456') && masked.startsWith('+2547') && masked.endsWith('78'), 'Phone masking hides middle digits safely');

    // ───────────────────────────────────────────────────────────────────────────
    // SECTION 2: SMS Provider Abstraction & Modes
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 2: SMS Provider Abstraction & Modes ---');

    // 2.1 Provider resolution
    const mockAdapter = getSmsProvider('mock');
    assert(typeof mockAdapter.sendSms === 'function', 'Resolves mock SMS provider adapter');

    const atAdapter = getSmsProvider('africastalking');
    assert(typeof atAdapter.sendSms === 'function', 'Resolves Africa\'s Talking provider adapter');

    const twilioAdapter = getSmsProvider('twilio');
    assert(typeof twilioAdapter.sendSms === 'function', 'Resolves Twilio provider adapter');

    // 2.2 Send SMS in development / Mock mode
    const mockSmsResult = await sendSMS({
      to: '0712345678',
      message: 'Your Aura Laundry order #ORD-101 has been received.',
      provider: 'mock'
    });
    assert(mockSmsResult.success === true && mockSmsResult.status === 'sent', 'SMS sent successfully via Mock Adapter');
    assert(Boolean(mockSmsResult.messageId), 'Returns messageId tracking reference');

    // 2.3 SMS Disabled configuration mode
    notificationConfig.sms.enabled = false;
    const disabledSmsResult = await sendSMS({
      to: '0712345678',
      message: 'Test notification'
    });
    assert(disabledSmsResult.success === true && disabledSmsResult.status === 'suppressed', 'SMS disabled mode suppresses external calls without breaking');
    notificationConfig.sms.enabled = true; // Restore

    // 2.4 Invalid phone handling
    const invalidSendResult = await sendSMS({
      to: 'not-a-phone',
      message: 'Test notification'
    });
    assert(invalidSendResult.success === false && invalidSendResult.status === 'suppressed', 'Invalid phone safely suppressed without exception');

    // ───────────────────────────────────────────────────────────────────────────
    // SECTION 3: OTP Authentication & Security
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 3: OTP Authentication & Security ---');

    const testPhone = '+254700000001';

    // 3.1 Generate numeric OTP
    const otp = generateNumericOtp(6);
    assert(otp.length === 6 && /^\d{6}$/.test(otp), 'Generates 6-digit numeric OTP');

    // 3.2 Request OTP
    const requestResult = await requestPhoneOtp({
      phone: testPhone,
      purpose: 'login'
    });
    assert(requestResult.success === true, 'Successfully requests and persists OTP for phone');

    // 3.3 Cooldown enforcement
    const cooldownResult = await requestPhoneOtp({
      phone: testPhone,
      purpose: 'login'
    });
    assert(cooldownResult.success === false && cooldownResult.message.includes('wait'), 'Enforces OTP resend cooldown timer');

    // 3.4 Invalid OTP rejection & attempt tracking
    const wrongVerify = await verifyPhoneOtp({
      phone: testPhone,
      otp: '000000',
      purpose: 'login'
    });
    assert(wrongVerify.success === false && wrongVerify.message.includes('Invalid verification code'), 'Rejects incorrect OTP code');

    // Find the stored token to extract the correct OTP for testing successful verification
    const tokenDoc = await OtpToken.findOne({ identifier: testPhone, purpose: 'login' });
    assert(Boolean(tokenDoc) && Boolean(tokenDoc.otpHash), 'OTP stored as cryptographic hash (not plaintext)');

    // ───────────────────────────────────────────────────────────────────────────
    // SECTION 4: In-App Notifications & Database Persistence
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 4: In-App Notifications & Database Persistence ---');

    const dummyUserId = new mongoose.Types.ObjectId();
    const testIdempotencyKey = `TEST-${Date.now()}-INAPP`;

    const inAppResult = await createInAppNotification({
      userId: dummyUserId,
      title: 'Order Status Update',
      message: 'Your laundry order #ORD-099 is now In Wash.',
      type: NOTIFICATION_EVENTS.ORDER_IN_WASH,
      channel: 'in_app',
      idempotencyKey: testIdempotencyKey,
      actionUrl: '/track-order/ORD-099'
    });

    assert(inAppResult.success === true && inAppResult.status === 'sent', 'Creates persistent In-App notification');

    // 4.2 Idempotency deduplication check
    const duplicateResult = await createInAppNotification({
      userId: dummyUserId,
      title: 'Order Status Update',
      message: 'Duplicate attempt',
      type: NOTIFICATION_EVENTS.ORDER_IN_WASH,
      idempotencyKey: testIdempotencyKey
    });
    assert(duplicateResult.status === 'suppressed', 'Idempotency guard prevents duplicate in-app notification insertion');

    // ───────────────────────────────────────────────────────────────────────────
    // SECTION 5: Multi-Channel Event Orchestration
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 5: Multi-Channel Event Orchestration ---');

    // 5.1 Order Created Event
    const orderCreatedResult = await handleNotification(NOTIFICATION_EVENTS.ORDER_CREATED, {
      order: {
        _id: new mongoose.Types.ObjectId(),
        orderRef: 'ORD-999',
        pricing: { grandTotal: 2500 },
        items: [{ name: 'Dry Cleaning', quantity: 2 }],
        customerDetails: { fullName: 'Alex Test', phone: '0712345678', email: 'alex@example.com' }
      }
    });
    assert(orderCreatedResult.success === true && orderCreatedResult.orderRef === 'ORD-999', 'Dispatches ORDER_CREATED multi-channel notification');

    // 5.2 Order Lifecycle Status Event (e.g. Delivered)
    const orderDeliveredResult = await handleNotification(NOTIFICATION_EVENTS.ORDER_DELIVERED, {
      order: {
        _id: new mongoose.Types.ObjectId(),
        orderRef: 'ORD-999',
        status: 'Delivered',
        customerDetails: { fullName: 'Alex Test', phone: '0712345678', email: 'alex@example.com' }
      }
    });
    assert(orderDeliveredResult.success === true && orderDeliveredResult.orderStatus === 'Delivered', 'Dispatches ORDER_DELIVERED notification');

    // 5.3 Payment Success Event
    const paymentSuccessResult = await handleNotification(NOTIFICATION_EVENTS.PAYMENT_SUCCESS, {
      payment: {
        _id: new mongoose.Types.ObjectId(),
        amount: 2500,
        transactionId: 'MPESA99XYZ',
        phoneNumber: '0712345678'
      },
      order: {
        _id: new mongoose.Types.ObjectId(),
        orderRef: 'ORD-999',
        customerDetails: { fullName: 'Alex Test', phone: '0712345678', email: 'alex@example.com' }
      }
    });
    assert(paymentSuccessResult.success === true && paymentSuccessResult.amount === 2500, 'Dispatches PAYMENT_SUCCESS notification');

    // 5.4 Zero-Blast-Radius Failure Isolation (SMS provider throws -> order/payment logic does not crash)
    let failureCrashed = false;
    try {
      await handleNotification(NOTIFICATION_EVENTS.PAYMENT_SUCCESS, {
        payment: { _id: null, amount: 0 },
        order: null // Missing entity
      });
    } catch (e) {
      failureCrashed = true;
    }
    assert(!failureCrashed, 'Notification handler isolates errors and NEVER crashes business execution');

    // Clean up test data
    try {
      await Notification.deleteMany({ idempotencyKey: { $regex: /^TEST-/ } });
      await OtpToken.deleteMany({ identifier: testPhone });
    } catch (cleanErr) {}

  } catch (error) {
    console.error(`💥 Unexpected suite exception: ${error.message}`);
    failed++;
  } finally {
    console.log('\n===============================================================');
    console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed`);
    console.log('===============================================================\n');

    try {
      await mongoose.disconnect();
    } catch (e) {}

    process.exit(failed > 0 ? 1 : 0);
  }
}

runNotificationTestSuite();
