/**
 * Laundry Platform — Email Template Engine & Sanitizer
 */

/**
 * Escapes unsafe characters for HTML rendering to prevent HTML/XSS injection.
 */
export const escapeHtml = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  const matchHtmlRegExp = /["'&<>]/;
  const match = matchHtmlRegExp.exec(str);
  if (!match) {
    return str;
  }

  let escape;
  let html = '';
  let index = 0;
  let lastIndex = 0;

  for (index = match.index; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 34: // "
        escape = '&quot;';
        break;
      case 38: // &
        escape = '&amp;';
        break;
      case 39: // '
        escape = '&#39;';
        break;
      case 60: // <
        escape = '&lt;';
        break;
      case 62: // >
        escape = '&gt;';
        break;
      default:
        continue;
    }

    if (lastIndex !== index) {
      html += str.substring(lastIndex, index);
    }

    lastIndex = index + 1;
    html += escape;
  }

  return lastIndex !== index ? html + str.substring(lastIndex, index) : html;
};

/**
 * Strips carriage returns and line feeds from subject strings to prevent email header injection.
 */
export const sanitizeSubject = (subject) => {
  if (!subject) return 'Laundry Notification';
  return String(subject).replace(/[\r\n]+/g, ' ').trim();
};

/**
 * Generates a clean plain-text fallback version of an HTML email string.
 */
export const generatePlainTextFallback = (html) => {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<hr[^>]*>/gi, '\n----------------------------------------\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<li[^>]*>/gi, ' • ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&copy;/g, '©')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

// Registered template map
const templateRegistry = new Map();

/**
 * Registers an email template with its variable validation schema and rendering function.
 */
export const registerTemplate = (templateId, templateDef) => {
  if (!templateId || typeof templateDef.render !== 'function') {
    throw new Error(`Invalid template registration for ID: ${templateId}`);
  }
  templateRegistry.set(templateId, templateDef);
};

/**
 * Validates payload against required variable schema.
 */
export const validateTemplateVariables = (requiredVars = [], payload = {}) => {
  const missing = [];
  for (const v of requiredVars) {
    if (payload[v] === undefined || payload[v] === null || payload[v] === '') {
      missing.push(v);
    }
  }
  return missing;
};

/**
 * Authoritative template rendering entrypoint.
 * Validates, renders HTML, generates plain text, and sanitizes subject.
 */
export const renderTemplate = (templateId, variables = {}) => {
  const template = templateRegistry.get(templateId);
  if (!template) {
    throw new Error(`Email template '${templateId}' not found in registry.`);
  }

  // Validate required variables
  if (Array.isArray(template.requiredVariables)) {
    const missing = validateTemplateVariables(template.requiredVariables, variables);
    if (missing.length > 0) {
      throw new Error(`Missing required template variables for '${templateId}': ${missing.join(', ')}`);
    }
  }

  // Execute template render function
  const { subject, html } = template.render(variables);
  const sanitizedSubj = sanitizeSubject(subject);
  const plainText = generatePlainTextFallback(html);

  return {
    subject: sanitizedSubj,
    html,
    text: plainText
  };
};

export default {
  escapeHtml,
  sanitizeSubject,
  generatePlainTextFallback,
  registerTemplate,
  renderTemplate,
  validateTemplateVariables
};
