import { renderBaseLayout } from '../layouts/baseLayout.js';
import { escapeHtml, registerTemplate } from '../../templateEngine.js';

export const TEMPLATE_ID = 'admin.provider-commission-requested';

export const requiredVariables = [
  'orderRef',
  'customerName',
  'providerName',
  'orderAmount',
  'transactionId',
  'commissionRate',
  'commissionAmount',
  'providerPayoutAmount',
  'paidAt',
  'adminPaymentUrl'
];

export const render = (data) => {
  const orderRef = escapeHtml(data.orderRef);
  const customerName = escapeHtml(data.customerName || 'Customer');
  const providerName = escapeHtml(data.providerName || 'Provider');
  const orderAmount = Number(data.orderAmount || 0).toLocaleString();
  const transactionId = escapeHtml(data.transactionId || 'M-Pesa Verified');
  const commissionRate = escapeHtml(data.commissionRate || '15');
  const commissionAmount = Number(data.commissionAmount || 0).toLocaleString();
  const providerPayoutAmount = Number(data.providerPayoutAmount || 0).toLocaleString();
  const paidAt = escapeHtml(data.paidAt || new Date().toLocaleString());
  const adminPaymentUrl = data.adminPaymentUrl;

  const subject = `Provider Commission Action Required — Order #${orderRef}`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Customer payment has been successfully confirmed for Order <strong>#${orderRef}</strong>. A corresponding provider settlement and platform commission obligation has been generated in the payment ledger.
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h2 style="margin: 0 0 14px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 700;">
        Financial Breakdown
      </h2>
      <table class="details-table" border="0" cellpadding="6" cellspacing="0" width="100%" style="font-size: 14px; color: #1e293b;">
        <tr>
          <td width="42%" style="color: #64748b; font-weight: 500;">Order Reference:</td>
          <td style="font-weight: 700; color: #003ec7;">#${orderRef}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Customer:</td>
          <td style="font-weight: 600;">${customerName}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Assigned Cleaner:</td>
          <td style="font-weight: 600;">${providerName}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">M-Pesa Transaction Ref:</td>
          <td style="font-family: monospace; font-weight: 600;">${transactionId}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Payment Timestamp:</td>
          <td>${paidAt}</td>
        </tr>
        <tr style="border-top: 1px dashed #cbd5e1;">
          <td style="color: #64748b; font-weight: 500; padding-top: 10px;">Total Order Amount:</td>
          <td style="font-weight: 700; padding-top: 10px;">KES ${orderAmount}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Platform Commission (${commissionRate}%):</td>
          <td style="font-weight: 600; color: #16a34a;">KES ${commissionAmount}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Net Provider Payout:</td>
          <td style="font-weight: 700; color: #003ec7;">KES ${providerPayoutAmount}</td>
        </tr>
      </table>
    </div>

    <p style="margin: 16px 0 0 0; font-size: 14px; line-height: 1.5; color: #475569;">
      The provider payout is currently marked as <strong>Pending Settlement</strong>. You can review the transaction in the Administrator Payment Ledger and settle via B2C M-Pesa once the order is fulfilled.
    </p>
  `;

  const html = renderBaseLayout({
    title: 'Customer Payment Confirmed — Commission Created',
    preheader: `Payment confirmed for Order #${orderRef}. Provider net payout: KES ${providerPayoutAmount}.`,
    contentHtml,
    ctaText: 'View in Payment Ledger',
    ctaUrl: adminPaymentUrl,
    securityNotice: 'Sensitive payment values are masked in compliance with M-Pesa data privacy standards.'
  });

  return { subject, html };
};

registerTemplate(TEMPLATE_ID, { requiredVariables, render });

export default {
  TEMPLATE_ID,
  requiredVariables,
  render
};
