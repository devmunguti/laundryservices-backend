import { renderBaseLayout } from '../layouts/baseLayout.js';
import { escapeHtml, registerTemplate } from '../../templateEngine.js';

export const TEMPLATE_ID = 'admin.provider-registration-pending';

export const requiredVariables = [
  'providerId',
  'providerName',
  'businessName',
  'email',
  'phone',
  'registeredAt',
  'status',
  'adminReviewUrl'
];

export const render = (data) => {
  const businessName = escapeHtml(data.businessName || data.providerName);
  const providerName = escapeHtml(data.providerName);
  const email = escapeHtml(data.email);
  const phone = escapeHtml(data.phone || 'N/A');
  const registeredAt = escapeHtml(data.registeredAt || new Date().toLocaleString());
  const status = escapeHtml(data.status || 'Pending');
  const adminReviewUrl = data.adminReviewUrl;

  const subject = `New Provider Registration Requires Approval — ${businessName}`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      A new laundry service provider application has been registered on the Laundry Platform and is currently awaiting administrator review and approval.
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h2 style="margin: 0 0 14px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 700;">
        Provider Application Details
      </h2>
      <table class="details-table" border="0" cellpadding="6" cellspacing="0" width="100%" style="font-size: 14px; color: #1e293b;">
        <tr>
          <td width="38%" style="color: #64748b; font-weight: 500;">Business Name:</td>
          <td style="font-weight: 600;">${businessName}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Owner / Representative:</td>
          <td style="font-weight: 600;">${providerName}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Official Email:</td>
          <td><a href="mailto:${email}" style="color: #003ec7; text-decoration: none;">${email}</a></td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Contact Phone:</td>
          <td>${phone}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Submission Date:</td>
          <td>${registeredAt}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Current Status:</td>
          <td><span style="background-color: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 12px;">${status}</span></td>
        </tr>
      </table>
    </div>

    <p style="margin: 16px 0 0 0; font-size: 14px; line-height: 1.5; color: #475569;">
      The provider cannot accept orders or appear in public search results until authorized by an administrator. Please inspect their business information and approve or reject the listing.
    </p>
  `;

  const html = renderBaseLayout({
    title: 'New Cleaner / Provider Registration',
    preheader: `New cleaner registration from ${businessName} is awaiting authorization.`,
    contentHtml,
    ctaText: 'Review Provider Profile',
    ctaUrl: adminReviewUrl,
    securityNotice: 'This email was sent to authorized platform administrators only.'
  });

  return { subject, html };
};

registerTemplate(TEMPLATE_ID, { requiredVariables, render });

export default {
  TEMPLATE_ID,
  requiredVariables,
  render
};
