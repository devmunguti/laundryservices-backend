import { renderBaseLayout } from '../layouts/baseLayout.js';
import { escapeHtml, registerTemplate } from '../../templateEngine.js';

export const TEMPLATE_ID = 'provider.promotion-expiry-reminder';

export const requiredVariables = [
  'providerName',
  'businessName',
  'packageName',
  'daysRemaining',
  'expiresAt',
  'renewalUrl'
];

export const render = (data) => {
  const providerName = escapeHtml(data.providerName);
  const businessName = escapeHtml(data.businessName || data.providerName);
  const packageName = escapeHtml(data.packageName);
  const daysRemaining = parseInt(data.daysRemaining, 10) || 7;
  const expiresAt = escapeHtml(data.expiresAt || new Date().toLocaleDateString());
  const renewalUrl = data.renewalUrl;

  const isUrgent = daysRemaining <= 7;
  const urgencyColor = isUrgent ? '#dc2626' : daysRemaining <= 14 ? '#ea580c' : '#003ec7';
  const urgencyBadge = isUrgent ? 'URGENT: EXPIRING SOON' : 'EXPIRY REMINDER';

  const subject = daysRemaining === 30
    ? `Your ${packageName} Promotion Expires in 30 Days`
    : daysRemaining === 14
      ? `Reminder: Your ${packageName} Promotion Expires in 14 Days`
      : `Action Required: Your ${packageName} Promotion Expires in ${daysRemaining} Days`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Hello <strong>${providerName}</strong>,
    </p>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      This is a friendly reminder that your featured marketing boost on Aura Laundry Platform for <strong>${businessName}</strong> is scheduled to expire in <strong style="color: ${urgencyColor};">${daysRemaining} day(s)</strong>.
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <div style="margin-bottom: 12px;">
        <span style="background-color: ${urgencyColor}; color: #ffffff; padding: 3px 10px; border-radius: 12px; font-weight: 700; font-size: 11px; letter-spacing: 0.5px;">
          ${urgencyBadge}
        </span>
      </div>
      <table class="details-table" border="0" cellpadding="6" cellspacing="0" width="100%" style="font-size: 14px; color: #1e293b;">
        <tr>
          <td width="38%" style="color: #64748b; font-weight: 500;">Active Package:</td>
          <td style="font-weight: 700; color: #003ec7;">${packageName}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Days Remaining:</td>
          <td style="font-weight: 700; color: ${urgencyColor};">${daysRemaining} Days</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Expiration Date:</td>
          <td style="font-weight: 600;">${expiresAt}</td>
        </tr>
      </table>
    </div>

    <p style="margin: 16px 0 0 0; font-size: 14px; line-height: 1.5; color: #475569;">
      Don't lose your prime ranking position and top customer visibility! Renew or upgrade your marketing boost today to ensure continuous featured placement.
    </p>
  `;

  const html = renderBaseLayout({
    title: `Promotion Expiry Notice (${daysRemaining} Days Remaining)`,
    preheader: `Reminder: Your ${packageName} boost for ${businessName} expires in ${daysRemaining} days.`,
    contentHtml,
    ctaText: 'Renew Marketing Boost Now',
    ctaUrl: renewalUrl,
    securityNotice: 'Renewing before expiration avoids any interruption in your featured placement.'
  });

  return { subject, html };
};

registerTemplate(TEMPLATE_ID, { requiredVariables, render });

export default {
  TEMPLATE_ID,
  requiredVariables,
  render
};
