import { renderBaseLayout } from '../layouts/baseLayout.js';
import { escapeHtml, registerTemplate } from '../../templateEngine.js';

export const TEMPLATE_ID = 'provider.promotion-payment-receipt';

export const requiredVariables = [
  'providerName',
  'businessName',
  'packageName',
  'amount',
  'mpesaTransactionCode',
  'durationDays',
  'startsAt',
  'expiresAt',
  'providerDashboardUrl'
];

export const render = (data) => {
  const providerName = escapeHtml(data.providerName);
  const businessName = escapeHtml(data.businessName || data.providerName);
  const packageName = escapeHtml(data.packageName);
  const amount = Number(data.amount || 0).toLocaleString();
  const mpesaTransactionCode = escapeHtml(data.mpesaTransactionCode || 'VERIFIED');
  const durationDays = escapeHtml(data.durationDays || '7');
  const startsAt = escapeHtml(data.startsAt || new Date().toLocaleDateString());
  const expiresAt = escapeHtml(data.expiresAt || new Date().toLocaleDateString());
  const receiptNumber = escapeHtml(data.receiptNumber || `RCP-PROMO-${Date.now().toString().slice(-6)}`);
  const providerDashboardUrl = data.providerDashboardUrl;

  const subject = `Payment Receipt & Activation — ${packageName} Promotion`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Hello <strong>${providerName}</strong>,
    </p>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Thank you for boosting your presence on Aura Laundry Platform! Your payment has been confirmed, and your <strong>${packageName}</strong> is now officially <span style="color: #16a34a; font-weight: 700;">ACTIVE</span>.
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h2 style="margin: 0 0 14px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 700;">
        Official Promotion Receipt (${receiptNumber})
      </h2>
      <table class="details-table" border="0" cellpadding="6" cellspacing="0" width="100%" style="font-size: 14px; color: #1e293b;">
        <tr>
          <td width="40%" style="color: #64748b; font-weight: 500;">Business Name:</td>
          <td style="font-weight: 700;">${businessName}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Promotion Package:</td>
          <td style="font-weight: 600; color: #003ec7;">${packageName}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Amount Paid:</td>
          <td style="font-weight: 700;">KES ${amount}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Payment Method:</td>
          <td>M-Pesa Buy Goods / Paybill</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Transaction Receipt Ref:</td>
          <td style="font-family: monospace; font-weight: 700; color: #059669;">${mpesaTransactionCode}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Duration:</td>
          <td>${durationDays} Days</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Effective Dates:</td>
          <td style="font-weight: 600;">${startsAt} to ${expiresAt}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Promotion Status:</td>
          <td><span style="background-color: #dcfce7; color: #15803d; padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 12px;">ACTIVE</span></td>
        </tr>
      </table>
    </div>

    <p style="margin: 16px 0 0 0; font-size: 14px; line-height: 1.5; color: #475569;">
      Your services will enjoy top priority placement and the exclusive <strong>Featured Promoted</strong> badge across client searches and the homepage directory until <strong>${expiresAt}</strong>.
    </p>
  `;

  const html = renderBaseLayout({
    title: 'Featured Promotion Activated',
    preheader: `Payment Receipt: KES ${amount} confirmed for ${packageName}. Active until ${expiresAt}.`,
    contentHtml,
    ctaText: 'View Active Promotion',
    ctaUrl: providerDashboardUrl,
    securityNotice: 'Keep this receipt for your business financial and accounting records.'
  });

  return { subject, html };
};

registerTemplate(TEMPLATE_ID, { requiredVariables, render });

export default {
  TEMPLATE_ID,
  requiredVariables,
  render
};
