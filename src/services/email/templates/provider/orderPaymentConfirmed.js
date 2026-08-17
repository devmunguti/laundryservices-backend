import { renderBaseLayout } from '../layouts/baseLayout.js';
import { escapeHtml, registerTemplate } from '../../templateEngine.js';

export const TEMPLATE_ID = 'provider.order-payment-confirmed';

export const requiredVariables = [
  'providerName',
  'orderRef',
  'orderAmount',
  'customerName',
  'customerPhone',
  'pickupAddress',
  'providerOrdersUrl'
];

export const render = (data) => {
  const providerName = escapeHtml(data.providerName || 'Laundry Provider');
  const businessName = escapeHtml(data.businessName || data.providerName || 'Laundry Provider');
  const orderRef = escapeHtml(data.orderRef || 'ORD-NEW');
  const orderAmount = Number(data.orderAmount || 0).toLocaleString();
  const transactionId = escapeHtml(data.transactionId || 'M-Pesa Verified');
  const paidAt = escapeHtml(data.paidAt || new Date().toLocaleString());
  const paymentMethod = escapeHtml(data.paymentMethod || 'M-Pesa');

  // Client details
  const customerName = escapeHtml(data.customerName || 'Verified Customer');
  const customerPhone = escapeHtml(data.customerPhone || 'Not provided');
  const customerEmail = escapeHtml(data.customerEmail || 'Not provided');
  const pickupAddress = escapeHtml(data.pickupAddress || 'Nairobi');
  const deliveryAddress = escapeHtml(data.deliveryAddress || data.pickupAddress || 'Nairobi');
  const pickupSlot = escapeHtml(data.pickupSlot || 'As soon as possible');
  const deliverySlot = escapeHtml(data.deliverySlot || 'Standard Delivery');
  const orderNotes = escapeHtml(data.notes || 'None specified');
  const serviceName = escapeHtml(data.serviceName || 'Laundry Service');
  const itemCount = escapeHtml(data.itemCount || '1 item(s)');

  const providerOrdersUrl = data.providerOrdersUrl;

  const subject = `New Paid Order Placed — #${orderRef} (KES ${orderAmount})`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Hello <strong>${providerName}</strong>,
    </p>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Great news! A new laundry order has just been placed and the payment has been <strong>successfully confirmed</strong>. Please review the order and client details below to respond and schedule pickup.
    </p>

    <!-- Order Summary Card -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h2 style="margin: 0 0 14px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 700;">
        📦 Order Summary (#${orderRef})
      </h2>
      <table class="details-table" border="0" cellpadding="6" cellspacing="0" width="100%" style="font-size: 14px; color: #1e293b;">
        <tr>
          <td width="38%" style="color: #64748b; font-weight: 500;">Service Requested:</td>
          <td style="font-weight: 700; color: #003ec7;">${serviceName}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Quantity / Items:</td>
          <td style="font-weight: 600;">${itemCount}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Total Paid:</td>
          <td style="font-weight: 700; color: #16a34a; font-size: 15px;">KES ${orderAmount}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Payment Method:</td>
          <td>${paymentMethod} (${transactionId})</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Payment Time:</td>
          <td>${paidAt}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Payment Status:</td>
          <td><span style="background-color: #dcfce7; color: #15803d; padding: 3px 8px; border-radius: 10px; font-weight: 700; font-size: 12px;">PAID & VERIFIED</span></td>
        </tr>
      </table>
    </div>

    <!-- Client & Delivery Details Card -->
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h2 style="margin: 0 0 14px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #166534; font-weight: 700;">
        👤 Client & Pickup Details
      </h2>
      <table class="details-table" border="0" cellpadding="6" cellspacing="0" width="100%" style="font-size: 14px; color: #1e293b;">
        <tr>
          <td width="38%" style="color: #166534; font-weight: 500;">Client Name:</td>
          <td style="font-weight: 700;">${customerName}</td>
        </tr>
        <tr>
          <td style="color: #166534; font-weight: 500;">Phone Number:</td>
          <td style="font-weight: 700; color: #003ec7;"><a href="tel:${customerPhone}" style="color: #003ec7; text-decoration: none;">${customerPhone}</a></td>
        </tr>
        <tr>
          <td style="color: #166534; font-weight: 500;">Email Address:</td>
          <td><a href="mailto:${customerEmail}" style="color: #334155; text-decoration: none;">${customerEmail}</a></td>
        </tr>
        <tr>
          <td style="color: #166534; font-weight: 500;">Pickup Address:</td>
          <td style="font-weight: 600;">${pickupAddress}</td>
        </tr>
        <tr>
          <td style="color: #166534; font-weight: 500;">Pickup Window:</td>
          <td style="font-weight: 600; color: #0f766e;">${pickupSlot}</td>
        </tr>
        <tr>
          <td style="color: #166534; font-weight: 500;">Delivery Address:</td>
          <td>${deliveryAddress}</td>
        </tr>
        <tr>
          <td style="color: #166534; font-weight: 500;">Special Instructions:</td>
          <td style="font-style: italic; color: #475569;">${orderNotes}</td>
        </tr>
      </table>
    </div>

    <p style="margin: 16px 0 0 0; font-size: 14px; line-height: 1.5; color: #475569;">
      Please access your Cleaner Portal to accept and update this order status as soon as pickup is underway.
    </p>
  `;

  const html = renderBaseLayout({
    title: 'New Paid Order Received',
    preheader: `New Order #${orderRef} from ${customerName} (KES ${orderAmount}). Pickup scheduled.`,
    contentHtml,
    ctaText: 'View Order in Portal',
    ctaUrl: providerOrdersUrl,
    securityNotice: 'Client contact details are provided solely for fulfilling this laundry service.'
  });

  return { subject, html };
};

registerTemplate(TEMPLATE_ID, { requiredVariables, render });

export default {
  TEMPLATE_ID,
  requiredVariables,
  render
};
