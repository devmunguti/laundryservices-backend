import { emailConfig } from '../../../../config/emailConfig.js';

/**
 * Shared Laundry Responsive Base Email Layout
 * Brand color: #003ec7 (Aura Navy/Royal Blue), Slate #434656, Surface #f8f9fc
 * 
 * @param {Object} options
 * @param {string} options.title - Email Title / Subject Heading
 * @param {string} options.preheader - Small preview snippet shown in inbox clients
 * @param {string} options.contentHtml - Main body HTML (cards, details, tables)
 * @param {string} [options.ctaText] - Optional primary action button text
 * @param {string} [options.ctaUrl] - Optional primary action button URL
 * @param {string} [options.securityNotice] - Optional security/confidentiality disclaimer
 */
export const renderBaseLayout = ({
  title,
  preheader = 'Laundry Platform Notification',
  contentHtml,
  ctaText,
  ctaUrl,
  securityNotice
}) => {
  const currentYear = new Date().getFullYear();
  const supportEmail = emailConfig.from.address;

  const ctaSection = (ctaText && ctaUrl) ? `
    <div style="text-align: center; margin: 32px 0 24px 0;">
      <a href="${ctaUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #003ec7; color: #ffffff; padding: 14px 32px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block; box-shadow: 0 4px 12px rgba(0, 62, 199, 0.25); letter-spacing: 0.3px;">
        ${ctaText}
      </a>
    </div>
  ` : '';

  const securitySection = securityNotice ? `
    <div style="background-color: #fff9e6; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 24px 0 16px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 12px; color: #78350f; line-height: 1.5;">
        <strong>Security Notice:</strong> ${securityNotice}
      </p>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
  <style type="text/css">
    /* Reset styles */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f1f4f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; margin: auto !important; }
      .content-padding { padding: 24px 16px !important; }
      .details-table td { padding: 8px 6px !important; font-size: 13px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f4f9;">
  <!-- Preheader text for email clients -->
  <div style="display: none; font-size: 1px; color: #fefefe; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${preheader}
  </div>

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f4f9;">
    <tr>
      <td align="center" style="padding: 24px 12px;">
        <!-- Email Container -->
        <table class="email-container" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);">
          
          <!-- Header Bar with Aura Branding -->
          <tr>
            <td style="background-color: #003ec7; padding: 28px 32px; text-align: left;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <div style="display: inline-block; vertical-align: middle;">
                      <span style="color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        ✨ Laundry
                      </span>
                    </div>
                    <div style="color: #cbd5e1; font-size: 12px; margin-top: 4px; font-weight: 500;">
                      Premium Care & Laundry Marketplace
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Area -->
          <tr>
            <td class="content-padding" style="padding: 36px 32px 28px 32px; color: #1a1c1e;">
              <h1 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #1a1c1e; line-height: 1.3;">
                ${title}
              </h1>

              ${contentHtml}

              ${ctaSection}

              ${securitySection}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 0;">
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; text-align: center; color: #64748b; font-size: 12px; line-height: 1.6;">
              <p style="margin: 0 0 8px 0; font-weight: 600; color: #334155;">
                Laundry Platform &copy; ${currentYear}
              </p>
              <p style="margin: 0 0 8px 0;">
                Questions or support? Reach us anytime at <a href="mailto:${supportEmail}" style="color: #003ec7; text-decoration: none; font-weight: 500;">${supportEmail}</a>
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                This is an automated system transaction email. Please do not reply directly to this notification.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export default renderBaseLayout;
