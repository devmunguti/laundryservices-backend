import { renderBaseLayout } from '../layouts/baseLayout.js';
import { escapeHtml, registerTemplate } from '../../templateEngine.js';

export const TEMPLATE_ID = 'admin.new-order-placed';

export const requiredVariables = [
  'orderRef',
  'orderAmount',
  'customerName',
  'customerPhone',
  'providerName',
  'serviceName',
  'itemCount',
  'pickupAddress',
  'adminOrderUrl'
];

export const render = (data) => {
  const orderRef = escapeHtml(data.orderRef);
  const orderAmount = Number(data.orderAmount || 0).toLocaleString();
  const customerName = escapeHtml(data.customerName || 'Customer');
  const customerPhone = escapeHtml(data.customerPhone || 'N/A');
  const customerEmail = escapeHtml(data.customerEmail || 'N/A');
  const providerName = escapeHtml(data.providerName || 'Assigned Cleaner');
  const serviceName = escapeHtml(data.serviceName || 'Laundry Service');
  const itemCount = escapeHtml(data.itemCount || '1 item(s)');
  const pickupAddress = escapeHtml(data.pickupAddress || 'Nairobi');
  const paymentStatus = escapeHtml(data.paymentStatus || 'Pending');
  const adminOrderUrl = data.adminOrderUrl;

  const subject = `New Order #${orderRef} Placed — KES ${orderAmount} (${providerName})`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 24px; color: #333333;">
      A new customer order has been placed on <strong>Laundry Platform</strong>. Below are the order summary and fulfillment details:
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; margin: 16px 0;">
      <h2 style="margin: 0 0 12px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 700;">
        Order & Fulfillment Summary
      </h2>
      <table class="details-table" border="0" cellpadding="6" cellspacing="0" width="100%" style="font-size: 14px; color: #1e293b;">
        <tr>
          <td width="38%" style="color: #64748b; font-weight: 500;">Order Reference:</td>
          <td style="font-weight: 700; color: #252f3d;">#${orderRef}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Total Amount:</td>
          <td style="font-weight: 700; color: #16a34a;">KES ${orderAmount}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Assigned Cleaner:</td>
          <td style="font-weight: 600;">${providerName}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Primary Service:</td>
          <td>${serviceName} (${itemCount})</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Customer Name:</td>
          <td style="font-weight: 600;">${customerName}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Customer Phone:</td>
          <td>${customerPhone}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Customer Email:</td>
          <td>${customerEmail}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Pickup Location:</td>
          <td>${pickupAddress}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Payment Status:</td>
          <td><span style="background-color: #fef3c7; color: #92400e; padding: 3px 8px; border-radius: 10px; font-weight: 600; font-size: 12px;">${paymentStatus}</span></td>
        </tr>
      </table>
    </div>

    <p style="margin: 16px 0 0 0; font-size: 13px; line-height: 20px; color: #555555;">
      You can track and manage this order, reassign cleaners, or verify transactions directly from the Admin Portal.
    </p>
  `;

  const html = renderBaseLayout({
    title: `New Order Placed (#${orderRef})`,
    preheader: `New order #${orderRef} for KES ${orderAmount} assigned to ${providerName}.`,
    contentHtml,
    ctaText: 'View in Admin Portal',
    ctaUrl: adminOrderUrl,
    securityNotice: 'This is an administrative order notification for platform management.'
  });

  return { subject, html };
};

registerTemplate(TEMPLATE_ID, { requiredVariables, render });

export default {
  TEMPLATE_ID,
  requiredVariables,
  render
};
