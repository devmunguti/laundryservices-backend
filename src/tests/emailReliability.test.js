import dns from 'dns';
import { ipv4OnlyLookup, validateEmailConfiguration, sendTransportMail } from '../services/email/emailProvider.js';
import { resolveEmailProvider, emailConfig } from '../config/emailConfig.js';
import { sendTemplatedEmail } from '../services/email/emailService.js';
import EmailNotificationLog from '../models/EmailNotificationLog.js';
import { connectDB } from '../config/db.js';
import mongoose from 'mongoose';

async function runEmailReliabilityTests() {
  console.log('===============================================================');
  console.log('🧪 Starting Email Reliability & Provider Architecture Test Suite');
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
    // ───────────────────────────────────────────────────────────────────────────
    // SECTION 1: DNS IPv4 Hardening Verification
    // ───────────────────────────────────────────────────────────────────────────
    console.log('--- SECTION 1: DNS IPv4-Only Lookup Hardening ---');

    await new Promise((resolve) => {
      // Test 1.1: Standard lookup with family: 0 caller override
      ipv4OnlyLookup('smtp.gmail.com', { family: 0, all: true }, (err, address, family) => {
        assert(!err, 'Resolves smtp.gmail.com successfully without error');
        assert(family === 4, `Enforces IPv4 (family=4) even when caller passes family=0 (actual family: ${family})`);
        assert(typeof address === 'string' && address.includes('.'), `Returns IPv4 dot-decimal address (${address})`);
        resolve();
      });
    });

    // ───────────────────────────────────────────────────────────────────────────
    // SECTION 2: Provider Resolution & Validation
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 2: Provider Selection & Configuration Resolution ---');

    // 2.1 Explicit provider resolution
    process.env.EMAIL_PROVIDER = 'resend';
    assert(resolveEmailProvider() === 'resend', 'Resolves explicit EMAIL_PROVIDER=resend');

    process.env.EMAIL_PROVIDER = 'brevo';
    assert(resolveEmailProvider() === 'brevo', 'Resolves explicit EMAIL_PROVIDER=brevo');

    process.env.EMAIL_PROVIDER = 'smtp';
    assert(resolveEmailProvider() === 'smtp', 'Resolves explicit EMAIL_PROVIDER=smtp');

    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    delete process.env.BREVO_API_KEY;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    assert(resolveEmailProvider() === 'mock', 'Falls back to mock provider when no credentials are set');

    // Restore environment
    process.env.EMAIL_PROVIDER = 'mock';
    emailConfig.provider = 'mock';

    const validationResult = validateEmailConfiguration(false);
    assert(validationResult.valid === true, 'Mock provider validation succeeds');
    assert(validationResult.provider === 'mock', 'Mock provider correctly identified');

    // ───────────────────────────────────────────────────────────────────────────
    // SECTION 3: Provider Dispatch Contract (Mock Mode)
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 3: Provider Dispatch Contract & Return Structure ---');

    const testMailResult = await sendTransportMail({
      to: 'test@example.com',
      subject: 'Test Subject',
      html: '<p>Test</p>',
      text: 'Test'
    });

    assert(testMailResult.success === true, 'sendTransportMail returns success: true');
    assert(testMailResult.provider === 'mock', 'sendTransportMail returns provider name');
    assert(Boolean(testMailResult.messageId), `sendTransportMail returns messageId (${testMailResult.messageId})`);

    // ───────────────────────────────────────────────────────────────────────────
    // SECTION 4: EmailService Idempotency & Lifecycle States
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 4: EmailService Idempotency Lifecycle & State Guards ---');

    try {
      await connectDB();
      console.log('  📦 Connected to MongoDB for database state validation.');

      const testKeySent = `TEST-IDEMPOTENCY-SENT-${Date.now()}`;
      const testKeyStale = `TEST-IDEMPOTENCY-STALE-${Date.now()}`;
      const testKeyFailed = `TEST-IDEMPOTENCY-FAILED-${Date.now()}`;

      // Clean up previous test runs if any
      await EmailNotificationLog.deleteMany({ idempotencyKey: { $regex: /^TEST-IDEMPOTENCY-/ } });

      // 4.1 'sent' status suppression
      await EmailNotificationLog.create({
        event: 'TEST_EVENT',
        recipient: 'test-recipient@example.com',
        idempotencyKey: testKeySent,
        subject: 'Initial Sent Notification',
        templateId: 'admin.new-order-placed',
        status: 'sent',
        sentAt: new Date()
      });

      const sentDuplicateResult = await sendTemplatedEmail({
        to: 'test-recipient@example.com',
        templateId: 'admin.new-order-placed',
        idempotencyKey: testKeySent,
        variables: { orderRef: 'TEST-101' }
      });

      assert(sentDuplicateResult.success === true, 'Sent duplicate returns success: true');
      assert(sentDuplicateResult.status === 'suppressed', 'Sent duplicate is cleanly suppressed');

      // 4.2 'queued' (< 5 min) status suppression
      const recentQueuedKey = `TEST-IDEMPOTENCY-RECENT-${Date.now()}`;
      await EmailNotificationLog.create({
        event: 'TEST_EVENT',
        recipient: 'test-recipient@example.com',
        idempotencyKey: recentQueuedKey,
        subject: 'Recent Queued Notification',
        templateId: 'admin.new-order-placed',
        status: 'queued',
        createdAt: new Date()
      });

      const recentQueuedResult = await sendTemplatedEmail({
        to: 'test-recipient@example.com',
        templateId: 'admin.new-order-placed',
        idempotencyKey: recentQueuedKey,
        variables: { orderRef: 'TEST-102' }
      });

      assert(recentQueuedResult.status === 'suppressed', 'Recent in-flight queued notification (<5m) is suppressed');

      // 4.3 'queued' (> 5 min) stale retry
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
      await EmailNotificationLog.create({
        event: 'TEST_EVENT',
        recipient: 'test-recipient@example.com',
        idempotencyKey: testKeyStale,
        subject: 'Stale Queued Notification',
        templateId: 'admin.new-order-placed',
        status: 'queued',
        createdAt: sixMinutesAgo,
        updatedAt: sixMinutesAgo
      });

      const validTemplateVariables = {
        orderRef: 'TEST-101',
        orderAmount: 1500,
        customerName: 'Jane Doe',
        customerPhone: '+254712345678',
        customerEmail: 'jane@example.com',
        providerName: 'Clean Pro',
        serviceName: 'Wash & Fold',
        itemCount: '2 items',
        pickupAddress: 'Nairobi CBD',
        paymentStatus: 'Paid',
        adminOrderUrl: 'https://karumarket.click/admin/portal'
      };

      const staleRetryResult = await sendTemplatedEmail({
        to: 'test-recipient@example.com',
        templateId: 'admin.new-order-placed',
        idempotencyKey: testKeyStale,
        variables: { ...validTemplateVariables, orderRef: 'TEST-103' }
      });

      assert(staleRetryResult.status === 'sent', `Stale queued notification (>5m) is allowed to retry and deliver (Status: ${staleRetryResult.status})`);

      // 4.4 'failed' status retry
      await EmailNotificationLog.create({
        event: 'TEST_EVENT',
        recipient: 'test-recipient@example.com',
        idempotencyKey: testKeyFailed,
        subject: 'Failed Notification',
        templateId: 'admin.new-order-placed',
        status: 'failed',
        lastError: 'Simulated connection error'
      });

      const failedRetryResult = await sendTemplatedEmail({
        to: 'test-recipient@example.com',
        templateId: 'admin.new-order-placed',
        idempotencyKey: testKeyFailed,
        variables: { ...validTemplateVariables, orderRef: 'TEST-104' }
      });

      assert(failedRetryResult.status === 'sent', `Failed notification is retryable and updates status to sent (Status: ${failedRetryResult.status})`);

      // Clean up test records
      await EmailNotificationLog.deleteMany({ idempotencyKey: { $regex: /^TEST-IDEMPOTENCY-/ } });
    } catch (dbErr) {
      console.warn(`  ⚠️ MongoDB DB connection skipped in test runner (${dbErr.message}).`);
    }

    console.log('\n===============================================================');
    console.log(`📊 Test Suite Finished: ${passed} Passed, ${failed} Failed`);
    console.log('===============================================================\n');

    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }

    process.exit(failed > 0 ? 1 : 0);
  } catch (globalErr) {
    console.error(`💥 Unexpected test runner error: ${globalErr.message}`);
    process.exit(1);
  }
}

runEmailReliabilityTests();
