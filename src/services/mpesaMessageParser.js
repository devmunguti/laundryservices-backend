/**
 * mpesaMessageParser.js
 *
 * Server-side utility for parsing M-Pesa confirmation SMS messages.
 * Uses multiple ordered regex strategies to robustly extract transaction codes.
 *
 * M-Pesa receipt codes: typically 10 alphanumeric chars near start of confirmation.
 * Examples:
 *   "QK72ABCD34 Confirmed. Ksh1,500.00 sent to AURA LAUNDRY on 15/08/26..."
 *   "ABC12DEF34 confirmed.\nKsh 1500 sent to..."
 *
 * This service NEVER stores the full SMS — it extracts only needed fields.
 */

/**
 * General transaction code scan pattern.
 * Safaricom codes: 8-12 chars, letters + digits, at least one of each.
 */
const TRANSACTION_CODE_REGEX = /\b([A-Z]{1,3}[0-9A-Z]{7,11})\b/g;

/**
 * M-Pesa amount patterns — handles:
 *   "Ksh1,500.00", "KES 1,500", "Ksh 1500", "ksh1500.00", "Kes1,500"
 */
const AMOUNT_REGEX = /(?:ksh|kes)[\s]?([\d,]+(?:\.\d{1,2})?)/i;

/**
 * Keywords that indicate a genuine M-Pesa confirmation context.
 */
const CONFIRMATION_MARKERS = [
  /confirmed/i,
  /sent\s+to/i,
  /received\s+from/i,
  /m-?pesa\s+balance/i,
  /transaction\s+cost/i,
  /buy\s+goods/i,
  /paybill/i,
];

/**
 * Normalizes raw SMS text for consistent regex processing.
 */
const normalizeMessage = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/\r\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Validates that a string conforms to M-Pesa transaction code format.
 * @param {string} candidate
 * @returns {boolean}
 */
export const isValidTransactionCodeFormat = (candidate) => {
  if (!candidate || typeof candidate !== 'string') return false;
  const upper = candidate.toUpperCase().trim();
  if (upper.length < 8 || upper.length > 12) return false;
  if (!/[A-Z]/.test(upper)) return false;
  if (!/[0-9]/.test(upper)) return false;
  if (!/^[A-Z0-9]+$/.test(upper)) return false;
  return true;
};

/**
 * Determines confidence level of the extraction.
 * @param {string} candidate
 * @param {string} normalizedMessage
 * @returns {'high'|'medium'|'low'}
 */
const assessConfidence = (candidate, normalizedMessage) => {
  if (!candidate) return 'low';
  const hasConfirmationMarker = CONFIRMATION_MARKERS.some(p => p.test(normalizedMessage));
  const codeIndex = normalizedMessage.toUpperCase().indexOf(candidate.toUpperCase());
  const codeContext = normalizedMessage.slice(Math.max(0, codeIndex - 20), codeIndex + 50);
  const adjacentToConfirmation = CONFIRMATION_MARKERS.some(p => p.test(codeContext));
  if (adjacentToConfirmation && hasConfirmationMarker) return 'high';
  if (hasConfirmationMarker) return 'medium';
  return 'low';
};

/**
 * Parses a number string like "1,500.00" into a float.
 */
const parseAmount = (amountStr) => {
  if (!amountStr) return null;
  const parsed = parseFloat(amountStr.replace(/,/g, ''));
  return isNaN(parsed) ? null : Math.round(parsed * 100) / 100;
};

/**
 * Parses a raw M-Pesa confirmation SMS or standalone transaction code.
 *
 * Extraction strategies (ordered by priority):
 *  1. Standalone code input (customer typed only the code)
 *  2. "CODE Confirmed" standard Safaricom format
 *  3. "transaction code: XYZ" explicit label
 *  4. General regex scan across entire message
 *
 * @param {string} rawMessage
 * @returns {{
 *   transactionCode: string|null,
 *   amount: number|null,
 *   confidence: 'high'|'medium'|'low',
 *   error: string|null
 * }}
 */
export const parseMpesaMessage = (rawMessage) => {
  if (!rawMessage || typeof rawMessage !== 'string') {
    return { transactionCode: null, amount: null, confidence: 'low', error: 'Empty or invalid message' };
  }

  const normalized = normalizeMessage(rawMessage);

  if (normalized.length < 6) {
    return { transactionCode: null, amount: null, confidence: 'low', error: 'Message too short' };
  }

  // ── Strategy 1: Pure standalone code (no spaces, right length) ──────────────
  if (/^[A-Z0-9]+$/i.test(normalized) && normalized.length >= 8 && normalized.length <= 12) {
    const candidate = normalized.toUpperCase();
    if (isValidTransactionCodeFormat(candidate)) {
      return { transactionCode: candidate, amount: null, confidence: 'high', error: null };
    }
  }

  // ── Strategy 2: Standard "CODE Confirmed" pattern ───────────────────────────
  const confirmedMatch = normalized.match(/^([A-Z0-9]{8,12})\s+Confirmed/i);
  if (confirmedMatch && isValidTransactionCodeFormat(confirmedMatch[1])) {
    const amountMatch = normalized.match(AMOUNT_REGEX);
    return {
      transactionCode: confirmedMatch[1].toUpperCase(),
      amount: amountMatch ? parseAmount(amountMatch[1]) : null,
      confidence: 'high',
      error: null
    };
  }

  // ── Strategy 3: Explicit label "transaction code: XYZ" ─────────────────────
  const labeledMatch = normalized.match(
    /(?:transaction\s*(?:code|id)|receipt(?:\s*number)?|code)\s*[:\-]?\s*([A-Z0-9]{8,12})/i
  );
  if (labeledMatch && isValidTransactionCodeFormat(labeledMatch[1])) {
    const amountMatch = normalized.match(AMOUNT_REGEX);
    return {
      transactionCode: labeledMatch[1].toUpperCase(),
      amount: amountMatch ? parseAmount(amountMatch[1]) : null,
      confidence: 'high',
      error: null
    };
  }

  // ── Strategy 4: General scan — find all candidates, rank by context ─────────
  const upperMessage = normalized.toUpperCase();
  TRANSACTION_CODE_REGEX.lastIndex = 0;
  const candidates = [];
  let match;

  while ((match = TRANSACTION_CODE_REGEX.exec(upperMessage)) !== null) {
    const candidate = match[1];
    if (isValidTransactionCodeFormat(candidate)) {
      const contextStart = Math.max(0, match.index - 30);
      const contextEnd = Math.min(upperMessage.length, match.index + 40);
      const context = upperMessage.slice(contextStart, contextEnd);
      const contextScore = CONFIRMATION_MARKERS.filter(p => p.test(context)).length;
      candidates.push({ code: candidate, index: match.index, contextScore });
    }
  }

  if (candidates.length === 0) {
    return {
      transactionCode: null,
      amount: null,
      confidence: 'low',
      error: 'No M-Pesa transaction code found in this message'
    };
  }

  // Prefer highest context score; ties broken by earliest position in message
  candidates.sort((a, b) => b.contextScore - a.contextScore || a.index - b.index);
  const best = candidates[0];
  const amountMatch = normalized.match(AMOUNT_REGEX);

  return {
    transactionCode: best.code,
    amount: amountMatch ? parseAmount(amountMatch[1]) : null,
    confidence: assessConfidence(best.code, normalized),
    error: null
  };
};
