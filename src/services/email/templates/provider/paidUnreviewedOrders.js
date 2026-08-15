import { renderBaseLayout } from '../layouts/baseLayout.js';
import { escapeHtml, registerTemplate } from '../../templateEngine.js';

export const TEMPLATE_ID = 'provider.paid-orders-unreviewed';

export const requiredVariables = [
  'providerName',
  'unreviewedCount',
  'orderSummaryList',
  'providerDashboardUrl'
];

export const render = (data) => {
  const providerName = escapeHtml(data.providerName);
  const unreviewedCount = escapeHtml(data.unreviewedCount || '1');
  const providerDashboardUrl = data.providerDashboardUrl;

  const orders = Array.isArray(data.orderSummaryList) ? data.orderSummaryList : [];
  const orderRowsHtml = orders.map((o) => `
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 10px 8px; font-weight: 700; color: #003ec7;">#${escapeHtml(o.orderRef || o.id)}</td>
      <td style="padding: 10px 8px; color: #1e293b;">${escapeHtml(o.serviceName || 'Laundry Service')}</td>
      <td style="padding: 10px 8px; font-weight: 600;">KES ${Number(o.amount || 0).toLocaleString()}</td>
      <td style="padding: 10px 8px;"><span style="background-color: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;">${escapeHtml(o.status || 'Paid')}</span></td>
    </tr>
  `).join('');

  const subject = `Action Required — ${unreviewedCount} Paid Order(s) Awaiting Review`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Hello <strong>${providerName}</strong>,
    </p>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      You currently have <strong>${unreviewedCount} paid order(s)</strong> that require your review and processing in the Cleaner Portal. Customers are awaiting pickup and processing updates.
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 20px 0;">
      <h2 style="margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 700;">
        Orders Requiring Action
      </h2>
      <table class="details-table" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 13px; text-align: left;">
        <thead>
          <tr style="border-bottom: 2px solid #cbd5e1; color: #64748b; font-size: 12px; text-transform: uppercase;">
            <th style="padding: 8px;">Order Ref</th>
            <th style="padding: 8px;">Service</th>
            <th style="padding: 8px;">Amount</th>
            <th style="padding: 8px;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${orderRowsHtml}
        </tbody>
      </table>
    </div>

    <p style="margin: 16px 0 0 0; font-size: 14px; line-height: 1.5; color: #475569;">
      Please log into your cleaner dashboard to confirm laundry pickup windows and advance the processing status.
    </p>
  `;

  const html = renderBaseLayout({
    title: `${unreviewedCount} Paid Order(s) Awaiting Attention`,
    preheader: `Action Required: You have ${unreviewedCount} paid order(s) awaiting processing.`,
    contentHtml,
    ctaText: 'Open Cleaner Dashboard',
    ctaUrl: providerDashboardUrl,
    securityNotice: 'Maintaining fast order turnaround times improves your cleaner ranking and customer ratings.'
  });

  return { subject, html };
};

registerTemplate(TEMPLATE_ID, { requiredVariables, render });

export default {
  TEMPLATE_ID,
  requiredVariables,
  render
};
