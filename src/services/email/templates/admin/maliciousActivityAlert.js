import { renderBaseLayout } from '../layouts/baseLayout.js';
import { escapeHtml, registerTemplate } from '../../templateEngine.js';

export const TEMPLATE_ID = 'admin.malicious-activity-alert';

export const requiredVariables = [
  'severity',
  'action',
  'details',
  'timestamp',
  'ipAddress',
  'adminAuditUrl'
];

export const render = (data) => {
  const severity = escapeHtml((data.severity || 'HIGH').toUpperCase());
  const action = escapeHtml(data.action);
  const details = escapeHtml(data.details);
  const timestamp = escapeHtml(data.timestamp || new Date().toLocaleString());
  const ipAddress = escapeHtml(data.ipAddress || 'Unknown IP');
  const userAgent = escapeHtml(data.userAgent || 'Not captured');
  const userEmail = escapeHtml(data.userEmail || 'Unauthenticated / Anonymous');
  const adminAuditUrl = data.adminAuditUrl;

  const severityColor = severity === 'CRITICAL' ? '#dc2626' : severity === 'HIGH' ? '#ea580c' : '#d97706';

  const subject = `🚨 Security Alert [${severity}] — Suspicious Activity Detected`;

  const contentHtml = `
    <div style="background-color: #fef2f2; border-left: 4px solid ${severityColor}; padding: 14px 18px; border-radius: 6px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 15px; font-weight: 700; color: ${severityColor};">
        A security threat or suspicious activity was flagged by the system audit logger.
      </p>
    </div>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h2 style="margin: 0 0 14px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 700;">
        Incident Telemetry
      </h2>
      <table class="details-table" border="0" cellpadding="6" cellspacing="0" width="100%" style="font-size: 14px; color: #1e293b;">
        <tr>
          <td width="36%" style="color: #64748b; font-weight: 500;">Threat Severity:</td>
          <td><span style="background-color: ${severityColor}; color: #ffffff; padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 11px;">${severity}</span></td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Action Trigger:</td>
          <td style="font-weight: 700; color: #0f172a;">${action}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Target / Initiator:</td>
          <td style="font-weight: 600;">${userEmail}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Source IP Address:</td>
          <td style="font-family: monospace;">${ipAddress}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">User Agent:</td>
          <td style="font-size: 12px; color: #475569; word-break: break-all;">${userAgent}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 500;">Detected Timestamp:</td>
          <td>${timestamp}</td>
        </tr>
      </table>
    </div>

    <div style="background-color: #f1f5f9; padding: 14px 16px; border-radius: 6px; margin: 16px 0;">
      <p style="margin: 0 0 6px 0; font-size: 12px; text-transform: uppercase; font-weight: 700; color: #475569;">Incident Description</p>
      <p style="margin: 0; font-size: 13px; color: #1e293b; line-height: 1.5; font-family: monospace;">${details}</p>
    </div>

    <p style="margin: 16px 0 0 0; font-size: 13px; line-height: 1.5; color: #475569;">
      <strong>Recommended Action:</strong> Inspect recent audit log events from this IP address or account to determine if an IP ban, account suspension, or session revocation is warranted.
    </p>
  `;

  const html = renderBaseLayout({
    title: `Security Alert: ${action}`,
    preheader: `Security Alert [${severity}]: Suspicious activity detected on Aura Laundry Platform.`,
    contentHtml,
    ctaText: 'Open Security Audit Logs',
    ctaUrl: adminAuditUrl,
    securityNotice: 'This automated incident report contains protected audit telemetry. Strictly confidential.'
  });

  return { subject, html };
};

registerTemplate(TEMPLATE_ID, { requiredVariables, render });

export default {
  TEMPLATE_ID,
  requiredVariables,
  render
};
