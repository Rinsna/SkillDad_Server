/**
 * DataFormatterService
 * 
 * Handles formatting and parsing of payment data.
 */

class DataFormatterService {
  /**
   * Format amount with exactly 2 decimal places using banker's rounding
   * 
   * Banker's rounding (round half to even): When the value is exactly halfway
   * between two numbers, round to the nearest even number.
   * 
   * @param {number} amount - Amount to format
   * @returns {string} Formatted amount with 2 decimal places
   */
  formatAmount(amount) {
    // Banker's rounding implementation
    const factor = 100; // For 2 decimal places
    const scaled = amount * factor;
    const floor = Math.floor(scaled);
    const fraction = scaled - floor;

    // Check if we're exactly at the halfway point (0.5)
    // Use a small epsilon for floating point comparison
    const epsilon = 0.0000001;
    if (Math.abs(fraction - 0.5) < epsilon) {
      // Round to nearest even number
      if (floor % 2 === 0) {
        // Floor is even, round down
        return (floor / factor).toFixed(2);
      } else {
        // Floor is odd, round up to make it even
        return ((floor + 1) / factor).toFixed(2);
      }
    }

    // Standard rounding for non-halfway cases
    return (Math.round(scaled) / factor).toFixed(2);
  }

  /**
   * Validate amount for floating-point precision issues
   * 
   * @param {number} amount - Amount to validate
   * @returns {Object} { valid: boolean, error: string|null }
   */
  validateAmountPrecision(amount) {
    // Check for NaN or Infinity
    if (!isFinite(amount)) {
      return {
        valid: false,
        error: 'Amount must be a finite number'
      };
    }

    // Check for excessive decimal places (more than 2)
    const amountStr = amount.toString();
    const decimalIndex = amountStr.indexOf('.');

    if (decimalIndex !== -1) {
      const decimalPlaces = amountStr.length - decimalIndex - 1;

      // Allow up to 2 decimal places
      if (decimalPlaces > 2) {
        const rounded = parseFloat(amount.toFixed(2));
        const difference = Math.abs(amount - rounded);

        if (difference > 0.001) {
          return {
            valid: false,
            error: 'Amount has too many decimal places. Maximum 2 decimal places allowed.'
          };
        }
      }
    }

    if (amount > 0 && amount < 0.01) {
      return {
        valid: false,
        error: 'Amount is too small. Minimum amount is 0.01'
      };
    }

    return { valid: true, error: null };
  }

  /**
   * Format timestamp in ISO 8601 format
   * 
   * @param {Date} date - Date to format
   * @returns {string} ISO 8601 formatted timestamp
   */
  formatTimestamp(date) {
    if (!date) return new Date().toISOString();
    return new Date(date).toISOString();
  }
}

module.exports = DataFormatterService;
