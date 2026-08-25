import { emailConfig } from '../../../../config/emailConfig.js';

/**
 * Modern Clean Responsive Base Email Layout (inspired by AWS / React Email Design)
 * 
 * @param {Object} options
 * @param {string} options.title - Email Title / Subject Heading
 * @param {string} options.preheader - Small preview snippet shown in inbox clients
 * @param {string} options.contentHtml - Main body HTML (cards, details, tables)
 * @param {string} [options.ctaText] - Optional primary action button text
 * @param {string} [options.ctaUrl] - Optional primary action button URL
 * @param {string} [options.securityNotice] - Optional security/confidentiality disclaimer
 * @param {string} [options.headerTitle] - Optional custom brand header text
 */
export const renderBaseLayout = ({
  title,
  preheader = 'Laundry Platform Notification',
  contentHtml,
  ctaText,
  ctaUrl,
  securityNotice,
  headerTitle = 'Laundry Platform'
}) => {
  const currentYear = new Date().getFullYear();
  const supportEmail = emailConfig.from.address || 'support@auralaundry.co.ke';
  const appUrl = emailConfig.appUrl || 'https://karumarket.click';

  const ctaSection = (ctaText && ctaUrl) ? `
    <div style="text-align: center; margin: 28px 0 20px 0;">
      <a href="${ctaUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #252f3d; color: #ffffff; padding: 13px 28px; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 6px; display: inline-block; letter-spacing: 0.2px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        ${ctaText}
      </a>
    </div>
  ` : '';

  const defaultSecurityText = securityNotice || `${headerTitle} will never email you and ask you to disclose or verify your password, credit card, or personal banking credentials.`;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #eeeeee; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #212121; }
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; margin: auto !important; }
      .content-padding { padding: 20px 18px !important; }
      .details-table td { padding: 8px 6px !important; font-size: 13px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #eeeeee;">
  <!-- Preheader preview text -->
  <div style="display: none; font-size: 1px; color: #eeeeee; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${preheader}
  </div>

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #eeeeee;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <!-- Email Container (Max 600px) -->
        <table class="email-container" border="0" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; width: 100%; margin: 0 auto; text-align: left;">
          
          <!-- White Card Wrapper -->
          <tr>
            <td style="background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
              
              <!-- Header Bar (AWS / Dark Navy Slate Theme) -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="background-color: #252f3d; padding: 22px 20px; text-align: center;">
                    <div style="color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.3px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                      ✨ ${headerTitle}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Main Content Section -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td class="content-padding" style="padding: 25px 35px; color: #333333; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    
                    <h1 style="color: #333333; font-size: 20px; font-weight: 700; margin: 0 0 15px 0; line-height: 1.3;">
                      ${title}
                    </h1>

                    <div style="color: #333333; font-size: 14px; line-height: 24px; margin: 16px 0;">
                      ${contentHtml}
                    </div>

                    ${ctaSection}

                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="padding: 0 35px;">
                    <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 0;" />
                  </td>
                </tr>
              </table>

              <!-- Security Notice Section -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td class="content-padding" style="padding: 20px 35px; color: #333333; font-size: 13px; line-height: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    <p style="margin: 0; color: #555555; font-size: 13px; line-height: 20px;">
                      ${defaultSecurityText}
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Outer Footer -->
          <tr>
            <td style="padding: 20px 10px 10px 10px; color: #666666; font-size: 12px; line-height: 18px; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
              <p style="margin: 0 0 6px 0; color: #666666; font-size: 12px;">
                This message was produced and distributed by ${headerTitle}. &copy; ${currentYear} ${headerTitle}. All rights reserved.
              </p>
              <p style="margin: 0; color: #666666; font-size: 12px;">
                Support: <a href="mailto:${supportEmail}" style="color: #2754C5; text-decoration: underline;">${supportEmail}</a> &bull;
                <a href="${appUrl}" target="_blank" style="color: #2754C5; text-decoration: underline;">Platform Marketplace</a>
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
