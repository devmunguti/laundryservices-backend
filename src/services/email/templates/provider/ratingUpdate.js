import { renderBaseLayout } from '../layouts/baseLayout.js';
import { escapeHtml, registerTemplate } from '../../templateEngine.js';

export const TEMPLATE_ID = 'provider.rating-updated';

export const requiredVariables = [
  'providerName',
  'businessName',
  'orderRef',
  'rating',
  'reviewDate',
  'providerReviewsUrl'
];

export const render = (data) => {
  const providerName = escapeHtml(data.providerName);
  const businessName = escapeHtml(data.businessName || data.providerName);
  const orderRef = escapeHtml(data.orderRef);
  const rating = Number(data.rating || 5);
  const comment = escapeHtml(data.comment || 'No written comment left.');
  const customerName = escapeHtml(data.customerName || 'Verified Customer');
  const reviewDate = escapeHtml(data.reviewDate || new Date().toLocaleDateString());
  const updatedRating = escapeHtml(data.updatedAverageRating || rating.toFixed(1));
  const totalReviewsCount = escapeHtml(data.totalReviewsCount || '1');
  const providerReviewsUrl = data.providerReviewsUrl;

  const starsHtml = '⭐'.repeat(Math.max(1, Math.min(5, Math.round(rating))));

  const subject = `New Customer Review (${starsHtml}) for ${businessName}`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Hello <strong>${providerName}</strong>,
    </p>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      A customer has submitted a new rating and feedback for completed order <strong>#${orderRef}</strong>.
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <div style="text-align: center; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid #e2e8f0;">
        <div style="font-size: 24px; letter-spacing: 2px;">${starsHtml}</div>
        <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 4px;">${rating} out of 5 Stars</div>
      </div>

      <table class="details-table" border="0" cellpadding="6" cellspacing="0" width="100%" style="font-size: 14px; color: #1e293b;">
        <tr>
          <td width="36%" style="color: #64748b; font-weight: 500;">Reviewer:</td>
          <td style="font-weight: 600;">${customerName}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Order Reference:</td>
          <td style="font-weight: 600; color: #003ec7;">#${orderRef}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Date Submitted:</td>
          <td>${reviewDate}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Customer Feedback:</td>
          <td style="font-style: italic; color: #334155; padding-top: 6px;">"${comment}"</td>
        </tr>
      </table>
    </div>

    <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 14px 16px; margin: 16px 0;">
      <p style="margin: 0; font-size: 13px; color: #1e40af;">
        <strong>Your Overall Reputation:</strong> ⭐ <strong>${updatedRating} / 5.0</strong> across <strong>${totalReviewsCount}</strong> verified customer reviews.
      </p>
    </div>

    <p style="margin: 16px 0 0 0; font-size: 14px; line-height: 1.5; color: #475569;">
      You can post an official reply to this review in your Cleaner Portal to show dedication to exceptional customer care.
    </p>
  `;

  const html = renderBaseLayout({
    title: 'New Customer Feedback Received',
    preheader: `New ${rating}-Star customer review submitted for ${businessName} on Order #${orderRef}.`,
    contentHtml,
    ctaText: 'View & Reply to Review',
    ctaUrl: providerReviewsUrl,
    securityNotice: 'Responding promptly and professionally to reviews enhances customer trust and ranking.'
  });

  return { subject, html };
};

registerTemplate(TEMPLATE_ID, { requiredVariables, render });

export default {
  TEMPLATE_ID,
  requiredVariables,
  render
};
