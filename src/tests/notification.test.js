import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { renderTemplate, escapeHtml, sanitizeSubject, generatePlainTextFallback } from '../services/email/templateEngine.js';
import { sendTemplatedEmail } from '../services/email/emailService.js';
import { handleNotification, computeIdempotencyKey } from '../services/notification/notificationService.js';
import { NOTIFICATION_EVENTS } from '../services/notification/notificationEvents.js';
import EmailNotificationLog from '../models/EmailNotificationLog.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import PromotionRequest from '../models/PromotionRequest.js';
import SystemSetting from '../models/SystemSetting.js';
import { checkPromotionExpiries, checkPaidUnreviewedOrders } from '../services/notification/notificationScheduler.js';

import { connectDB } from '../config/db.js';

dotenv.config();

async function runTests() {
  console.log('🧪 Starting Aura Laundry Notification System Test Suite...\n');
  let passed = 0;
  let failed = 0;

  const assert = (condition, testName) => {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  };

  try {
    try {
      await connectDB();
      console.log('📦 Connected to MongoDB for test verification.\n');
      await EmailNotificationLog.deleteMany({ idempotencyKey: { $regex: /^TEST-/ } });
    } catch (dbErr) {
      console.warn('⚠️ Running test suite in offline mock mode (MongoDB Atlas unreachable).');
    }

    // ───────────────────────────────────────────────────────────────────────────
    // 1. TEMPLATE ENGINE & SECURITY TESTS
    // ───────────────────────────────────────────────────────────────────────────
    console.log('--- SECTION 1: Template Engine, Sanitization & Security ---');

    // 1.1 HTML Escaping
    const maliciousInput = '<script>alert("xss")</script>&<img onerror=alert(1) src="x">';
    const escaped = escapeHtml(maliciousInput);
    assert(
      !escaped.includes('<script>') && escaped.includes('&lt;script&gt;') && escaped.includes('&quot;'),
      'HTML Escaper prevents raw HTML/XSS injection tags'
    );

    // 1.2 Subject line CRLF sanitization
    const dirtySubject = 'Header Injection\r\nBcc: hacker@evil.com\r\nSubject: Spoofed';
    const cleanSubject = sanitizeSubject(dirtySubject);
    assert(
      !cleanSubject.includes('\r') && !cleanSubject.includes('\n') && cleanSubject.includes('Header Injection'),
      'Subject line sanitizer strips CRLF carriage returns'
    );

    // 1.3 Plain text fallback generator
    const sampleHtml = '<div><h1>Title</h1><p>Hello <a href="https://auralaundry.co.ke">Aura</a>!</p></div>';
    const plainText = generatePlainTextFallback(sampleHtml);
    assert(
      !plainText.includes('<') && !plainText.includes('>') && plainText.includes('Hello Aura (https://auralaundry.co.ke)!'),
      'Plain text fallback converts HTML links and removes tags cleanly'
    );

    // 1.4 Variable Schema Validation
    let missingVarCaught = false;
    try {
      renderTemplate('admin.provider-registration-pending', {
        providerName: 'Test'
        // Missing other required fields
      });
    } catch (e) {
      missingVarCaught = true;
    }
    assert(missingVarCaught, 'Template engine strictly throws error when required variables are missing');

    // ───────────────────────────────────────────────────────────────────────────
    // 2. ADMIN NOTIFICATIONS TESTS
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 2: Admin Notification Endpoints ---');

    // 2.1 Admin Notification 1: New Provider Registration
    const regResult = await handleNotification(NOTIFICATION_EVENTS.ADMIN_PROVIDER_REGISTRATION_PENDING, {
      provider: {
        _id: new mongoose.Types.ObjectId(),
        fullName: 'Test Cleaners Ltd',
        email: 'testcleaner@example.com',
        phone: '0712345678',
        status: 'Pending',
        providerDetails: { businessName: 'Test Cleaners Ltd' }
      }
    });
    assert(regResult.success && regResult.status === 'sent', 'ADMIN_PROVIDER_REGISTRATION_PENDING dispatches successfully');

    // 2.2 Admin Notification 2: Provider Commission Requested
    const testOrderId = new mongoose.Types.ObjectId();
    const testPaymentId = new mongoose.Types.ObjectId();
    const commResult = await handleNotification(NOTIFICATION_EVENTS.ADMIN_PROVIDER_COMMISSION_REQUESTED, {
      order: { _id: testOrderId, orderRef: 'ORD-999001' },
      payment: {
        _id: testPaymentId,
        orderId: 'ORD-999001',
        amount: 2500,
        commissionRate: 15,
        commissionAmount: 375,
        providerPayoutAmount: 2125,
        status: 'paid',
        transactionId: 'MPESA-TEST-999',
        customerName: 'Alice Customer',
        providerName: 'Test Cleaners Ltd'
      }
    });
    assert(commResult.success && commResult.status === 'sent', 'ADMIN_PROVIDER_COMMISSION_REQUESTED dispatches with commission breakdown');

    // 2.3 Admin Notification 3: Malicious Activity Alert
    const secResult = await handleNotification(NOTIFICATION_EVENTS.ADMIN_MALICIOUS_ACTIVITY_DETECTED, {
      log: {
        _id: new mongoose.Types.ObjectId(),
        action: 'PAYMENT_AMOUNT_MISMATCH',
        details: 'Security alert: Amount mismatch detected. Expected 2500, received 100.',
        severity: 'CRITICAL',
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 Test Suite',
        userEmail: 'attacker@evil.com'
      }
    });
    assert(secResult.success && secResult.status === 'sent', 'ADMIN_MALICIOUS_ACTIVITY_DETECTED dispatches security incident alert');

    // 2.4 Admin Notification 4: Promotion Approval Requested
    const promoResult = await handleNotification(NOTIFICATION_EVENTS.ADMIN_PROMOTION_APPROVAL_REQUESTED, {
      promotion: {
        _id: new mongoose.Types.ObjectId(),
        providerName: 'Aura Express Cleaner',
        packageName: '14 Days Growth Boost',
        durationDays: 14,
        amount: 1800,
        mpesaTransactionCode: 'QA77XX99ZZ',
        tagline: 'Top rated laundry service'
      }
    });
    assert(promoResult.success && promoResult.status === 'sent', 'ADMIN_PROMOTION_APPROVAL_REQUESTED dispatches approval request to admin');

    // ───────────────────────────────────────────────────────────────────────────
    // 3. PROVIDER NOTIFICATIONS TESTS
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 3: Provider Notification Endpoints ---');

    // 3.1 Provider Notification 1: Paid Unreviewed Orders Digest
    const unreviewedResult = await handleNotification(NOTIFICATION_EVENTS.PROVIDER_PAID_ORDERS_UNREVIEWED, {
      provider: {
        _id: new mongoose.Types.ObjectId(),
        fullName: 'Speedy Wash Provider',
        email: 'speedy@wash.co.ke',
        providerDetails: { businessName: 'Speedy Wash' }
      },
      orders: [
        { orderRef: 'ORD-8001', items: [{ name: 'Wash & Fold' }], pricing: { grandTotal: 1200 }, status: 'Pending' },
        { orderRef: 'ORD-8002', items: [{ name: 'Dry Cleaning' }], pricing: { grandTotal: 2400 }, status: 'Pickup_Scheduled' }
      ]
    });
    assert(unreviewedResult.success && unreviewedResult.status === 'sent', 'PROVIDER_PAID_ORDERS_UNREVIEWED dispatches digest to provider');

    // 3.2 Provider Notification 2: Rating & Review Update
    const reviewResult = await handleNotification(NOTIFICATION_EVENTS.PROVIDER_RATING_UPDATED, {
      provider: {
        _id: new mongoose.Types.ObjectId(),
        fullName: 'Speedy Wash Provider',
        email: 'speedy@wash.co.ke',
        providerDetails: { businessName: 'Speedy Wash', rating: 4.8, reviewsCount: 15 }
      },
      review: {
        _id: new mongoose.Types.ObjectId(),
        orderRef: 'ORD-8001',
        rating: 5,
        comment: 'Clothes were folded exceptionally well and smelled fresh!',
        customerName: 'John Doe'
      }
    });
    assert(reviewResult.success && reviewResult.status === 'sent', 'PROVIDER_RATING_UPDATED dispatches rating update to provider');

    // 3.3 Provider Notification 3: Promotion Payment Receipt on Activation
    const promoReceiptResult = await handleNotification(NOTIFICATION_EVENTS.PROVIDER_PROMOTION_PAYMENT_RECEIPT, {
      provider: {
        _id: new mongoose.Types.ObjectId(),
        fullName: 'Speedy Wash Provider',
        email: 'speedy@wash.co.ke',
        providerDetails: { businessName: 'Speedy Wash' }
      },
      promotion: {
        _id: new mongoose.Types.ObjectId(),
        packageName: '7 Days Featured Placement',
        amount: 1000,
        mpesaTransactionCode: 'QA88YY22ZZ',
        durationDays: 7,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 86400000)
      }
    });
    assert(promoReceiptResult.success && promoReceiptResult.status === 'sent', 'PROVIDER_PROMOTION_PAYMENT_RECEIPT dispatches receipt on activation');

    // 3.4 Provider Notification 4: Expiry Reminders (30, 14, 7 Days)
    const expiry30Result = await handleNotification(NOTIFICATION_EVENTS.PROVIDER_PROMOTION_EXPIRY_30_DAYS, {
      provider: {
        _id: new mongoose.Types.ObjectId(),
        fullName: 'Speedy Wash Provider',
        email: 'speedy@wash.co.ke'
      },
      promotion: {
        _id: new mongoose.Types.ObjectId(),
        packageName: '30 Days Premium Dominance',
        expiresAt: new Date(Date.now() + 30 * 86400000)
      },
      daysRemaining: 30
    });
    assert(expiry30Result.success && expiry30Result.status === 'sent', 'PROVIDER_PROMOTION_EXPIRY_30_DAYS dispatches 30-day reminder');

    const expiry7Result = await handleNotification(NOTIFICATION_EVENTS.PROVIDER_PROMOTION_EXPIRY_7_DAYS, {
      provider: {
        _id: new mongoose.Types.ObjectId(),
        fullName: 'Speedy Wash Provider',
        email: 'speedy@wash.co.ke'
      },
      promotion: {
        _id: new mongoose.Types.ObjectId(),
        packageName: '7 Days Featured Placement',
        expiresAt: new Date(Date.now() + 7 * 86400000)
      },
      daysRemaining: 7
    });
    assert(expiry7Result.success && expiry7Result.status === 'sent', 'PROVIDER_PROMOTION_EXPIRY_7_DAYS dispatches 7-day urgent reminder');

    // ───────────────────────────────────────────────────────────────────────────
    // 4. IDEMPOTENCY & DUPLICATE SUPPRESSION TESTS
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 4: Idempotency & Duplicate Prevention ---');

    const testEntityId = 'ENTITY-IDEMP-12345';
    const testRecipient = 'unique-customer@example.com';
    const idempKey = computeIdempotencyKey({
      event: NOTIFICATION_EVENTS.ADMIN_PROVIDER_COMMISSION_REQUESTED,
      entityId: testEntityId,
      recipient: testRecipient,
      statusVersion: 'paid'
    });

    // First send
    const firstSend = await sendTemplatedEmail({
      to: testRecipient,
      templateId: 'admin.provider-commission-requested',
      event: NOTIFICATION_EVENTS.ADMIN_PROVIDER_COMMISSION_REQUESTED,
      idempotencyKey: idempKey,
      variables: {
        orderRef: 'ORD-IDEMP-001',
        customerName: 'Test Customer',
        providerName: 'Test Provider',
        orderAmount: 1000,
        transactionId: 'MPESA-001',
        commissionRate: '15',
        commissionAmount: 150,
        providerPayoutAmount: 850,
        paidAt: new Date().toLocaleString(),
        adminPaymentUrl: 'http://localhost:5173/admin/portal'
      }
    });
    assert(firstSend.success && firstSend.status === 'sent', 'First transmission completes with status: sent');

    // Second send with same idempotency key (simulating concurrent webhook / polling / manual verification)
    const secondSend = await sendTemplatedEmail({
      to: testRecipient,
      templateId: 'admin.provider-commission-requested',
      event: NOTIFICATION_EVENTS.ADMIN_PROVIDER_COMMISSION_REQUESTED,
      idempotencyKey: idempKey,
      variables: {
        orderRef: 'ORD-IDEMP-001',
        customerName: 'Test Customer',
        providerName: 'Test Provider',
        orderAmount: 1000,
        transactionId: 'MPESA-001',
        commissionRate: '15',
        commissionAmount: 150,
        providerPayoutAmount: 850,
        paidAt: new Date().toLocaleString(),
        adminPaymentUrl: 'http://localhost:5173/admin/portal'
      }
    });
    assert(secondSend.status === 'suppressed', 'Duplicate notification with identical idempotencyKey is suppressed without duplicate transmission');

    // Clean up test data
    await EmailNotificationLog.deleteMany({ recipient: testRecipient });

    // ───────────────────────────────────────────────────────────────────────────
    // 5. SCHEDULED WORKER VERIFICATION
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 5: Scheduled Worker Engine Verification ---');

    await checkPromotionExpiries();
    assert(true, 'checkPromotionExpiries runs smoothly without errors');

    await checkPaidUnreviewedOrders();
    assert(true, 'checkPaidUnreviewedOrders runs smoothly without errors');

    console.log(`\n========================================`);
    console.log(`🏆 TEST RUN SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('💥 Test suite encountered unhandled error:', error);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

runTests();
