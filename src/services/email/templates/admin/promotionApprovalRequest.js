import { renderBaseLayout } from '../layouts/baseLayout.js';
import { escapeHtml, registerTemplate } from '../../templateEngine.js';

export const TEMPLATE_ID = 'admin.promotion-approval-requested';

export const requiredVariables = [
  'providerName',
  'businessName',
  'packageName',
  'durationDays',
  'amount',
  'mpesaTransactionCode',
  'submittedAt',
  'adminReviewUrl'
];

export const render = (data) => {
  const businessName = escapeHtml(data.businessName || data.providerName);
  const providerName = escapeHtml(data.providerName);
  const packageName = escapeHtml(data.packageName);
  const durationDays = escapeHtml(data.durationDays || '7');
  const amount = Number(data.amount || 0).toLocaleString();
  const mpesaTransactionCode = escapeHtml(data.mpesaTransactionCode || 'PENDING');
  const submittedAt = escapeHtml(data.submittedAt || new Date().toLocaleString());
  const tagline = escapeHtml(data.tagline || 'No custom tagline provided.');
  const adminReviewUrl = data.adminReviewUrl;

  const subject = `Promotion Approval Required — ${businessName}`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      A laundry cleaner/provider has submitted a request for featured homepage placement / marketing boost. Please review the M-Pesa transaction and approve or reject the request.
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h2 style="margin: 0 0 14px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 700;">
        Promotion Request Details
      </h2>
      <table class="details-table" border="0" cellpadding="6" cellspacing="0" width="100%" style="font-size: 14px; color: #1e293b;">
        <tr>
          <td width="38%" style="color: #64748b; font-weight: 500;">Provider:</td>
          <td style="font-weight: 700;">${businessName} (${providerName})</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Package Selected:</td>
          <td style="font-weight: 600; color: #003ec7;">${packageName}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Duration:</td>
          <td>${durationDays} Days</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Fee Payable:</td>
          <td style="font-weight: 700;">KES ${amount}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">M-Pesa Transaction Ref:</td>
          <td style="font-family: monospace; font-weight: 700; color: #059669;">${mpesaTransactionCode}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Submission Date:</td>
          <td>${submittedAt}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Requested Tagline:</td>
          <td style="font-style: italic; color: #475569;">"${tagline}"</td>
        </tr>
      </table>
    </div>

    <p style="margin: 16px 0 0 0; font-size: 14px; line-height: 1.5; color: #475569;">
      Upon approval, the provider's listing will immediately receive the <strong>Featured Top Ranking badge</strong> for ${durationDays} days and the provider will receive an automated payment receipt.
    </p>
  `;

  const html = renderBaseLayout({
    title: 'Featured Promotion Approval Request',
    preheader: `Promotion boost request from ${businessName} (${packageName}) is awaiting approval.`,
    contentHtml,
    ctaText: 'Review Promotion Request',
    ctaUrl: adminReviewUrl,
    securityNotice: 'Please verify the M-Pesa transaction code on your admin statement before approving.'
  });

  return { subject, html };
};

registerTemplate(TEMPLATE_ID, { requiredVariables, render });

export default {
  TEMPLATE_ID,
  requiredVariables,
  render
};
