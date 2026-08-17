import { renderBaseLayout } from '../layouts/baseLayout.js';
import { escapeHtml, registerTemplate } from '../../templateEngine.js';

export const TEMPLATE_ID = 'provider.payout-invoice';

export const requiredVariables = [
  'providerName',
  'invoiceNumber',
  'grossAmount',
  'commissionAmount',
  'netPayoutAmount',
  'payoutReference'
];

export const render = (data) => {
  const providerName = escapeHtml(data.providerName || 'Laundry Service Provider');
  const businessName = escapeHtml(data.businessName || data.providerName || 'Laundry Service Provider');
  const invoiceNumber = escapeHtml(data.invoiceNumber || `INV-PAY-${Date.now().toString().slice(-6)}`);
  const invoiceDate = escapeHtml(data.invoiceDate || new Date().toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' }));
  const orderRef = escapeHtml(data.orderRef || 'All Settled Orders');
  const grossAmount = Number(data.grossAmount || 0).toLocaleString();
  const commissionRate = Number(data.commissionRate ?? 15);
  const commissionAmount = Number(data.commissionAmount || 0).toLocaleString();
  const netPayoutAmount = Number(data.netPayoutAmount || 0).toLocaleString();
  const payoutReference = escapeHtml(data.payoutReference || 'M-Pesa B2C Transfer');
  const payoutMethod = escapeHtml(data.payoutMethod || 'M-Pesa Mobile Money');
  const payoutRecipient = escapeHtml(data.payoutRecipient || providerName);
  const payoutPhoneNumber = escapeHtml(data.payoutPhoneNumber || 'Registered Account');
  const providerPortalUrl = data.providerPortalUrl || `${process.env.CLIENT_URL || 'http://localhost:5173'}/provider/earnings`;

  const subject = `Official Payout Invoice #${invoiceNumber} — Net Disbursed: KES ${netPayoutAmount}`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      Hello <strong>${providerName}</strong>,
    </p>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
      This email serves as your official <strong>Payout Settlement Invoice & Disbursement Receipt</strong> from Aura Laundry Platform. The funds have been released and transferred to your designated payout channel.
    </p>

    <!-- Invoice Header Box -->
    <div style="background-color: #0f172a; color: #ffffff; border-radius: 8px 8px 0 0; padding: 20px; margin: 24px 0 0 0;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td>
            <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; font-weight: 600;">Payout Invoice</span>
            <h2 style="margin: 4px 0 0 0; font-size: 20px; font-weight: 700; color: #ffffff;">#${invoiceNumber}</h2>
          </td>
          <td align="right">
            <span style="font-size: 12px; color: #94a3b8;">Issued Date:</span>
            <div style="font-size: 14px; font-weight: 600; color: #f8fafc;">${invoiceDate}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Settlement Breakdown Table -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; padding: 20px; margin: 0 0 24px 0;">
      <h3 style="margin: 0 0 14px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 700;">
        📊 Financial Settlement Breakdown
      </h3>
      <table border="0" cellpadding="8" cellspacing="0" width="100%" style="font-size: 14px; color: #1e293b; border-collapse: collapse;">
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="color: #64748b; font-weight: 500;">Associated Order Ref:</td>
          <td align="right" style="font-weight: 700; font-family: monospace; color: #003ec7;">${orderRef}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="color: #64748b; font-weight: 500;">Gross Customer Revenue:</td>
          <td align="right" style="font-weight: 600;">KES ${grossAmount}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="color: #64748b; font-weight: 500;">Platform Commission (${commissionRate}%):</td>
          <td align="right" style="font-weight: 600; color: #dc2626;">- KES ${commissionAmount}</td>
        </tr>
        <tr style="background-color: #ecfdf5;">
          <td style="color: #065f46; font-weight: 700; font-size: 15px; padding: 12px 8px;">Net Disbursed Payout:</td>
          <td align="right" style="font-weight: 800; font-size: 17px; color: #059669; padding: 12px 8px;">KES ${netPayoutAmount}</td>
        </tr>
      </table>

      <!-- Transfer & Destination Details -->
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px dashed #cbd5e1;">
        <table border="0" cellpadding="4" cellspacing="0" width="100%" style="font-size: 13px; color: #475569;">
          <tr>
            <td width="40%" style="color: #64748b;">Payout Method:</td>
            <td style="font-weight: 600; color: #1e293b;">${payoutMethod}</td>
          </tr>
          <tr>
            <td style="color: #64748b;">Transfer Reference:</td>
            <td style="font-weight: 700; font-family: monospace; color: #0f172a;">${payoutReference}</td>
          </tr>
          <tr>
            <td style="color: #64748b;">Recipient Account / Phone:</td>
            <td style="font-weight: 600; color: #1e293b;">${payoutRecipient} (${payoutPhoneNumber})</td>
          </tr>
          <tr>
            <td style="color: #64748b;">Beneficiary Business:</td>
            <td style="font-weight: 600; color: #1e293b;">${businessName}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Call to action -->
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 28px 0 16px 0;">
      <tr>
        <td align="center">
          <a href="${providerPortalUrl}" class="button" style="background-color: #003ec7; color: #ffffff; padding: 12px 28px; font-weight: 600; font-size: 14px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Full Earnings & Invoices
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 20px 0 0 0; font-size: 13px; line-height: 1.5; color: #64748b; text-align: center;">
      If you have questions regarding this disbursement or need to update your payout accounts, please reach out to <a href="mailto:support@auralaundry.co.ke" style="color: #003ec7;">support@auralaundry.co.ke</a>.
    </p>
  `;

  return {
    subject,
    html: renderBaseLayout({
      title: `Payout Invoice #${invoiceNumber}`,
      headerTitle: 'Aura Laundry',
      headerSubtitle: 'Cleaner Financial Settlements',
      content: contentHtml,
      supportEmail: 'finance@auralaundry.co.ke'
    })
  };
};

registerTemplate(TEMPLATE_ID, { render, requiredVariables });
