/**
 * HaveIBeenPwned Password Breach Check
 *
 * Uses the k-anonymity pattern to check if passwords have been compromised
 * without sending the full password hash to the API.
 *
 * IMPLEMENTS: PG-016 (Sign Up page security)
 *
 * Reference: https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange
 */

export interface BreachCheckResult {
  breached: boolean;
  count?: number;
  error?: string;
}

/**
 * Convert ArrayBuffer to hex string
 */
function arrayBufferToHex(buffer: ArrayBuffer): string {
  const hashArray = Array.from(new Uint8Array(buffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Check if a password has been compromised using the HaveIBeenPwned k-anonymity API.
 *
 * This uses the "range" API which only sends the first 5 characters of the SHA-1 hash,
 * providing k-anonymity protection - the API never sees the full password hash.
 *
 * @param password - The password to check
 * @returns Promise with breach status and occurrence count
 *
 * @example
 * ```typescript
 * const result = await checkPasswordBreach('password123');
 * if (result.breached) {
 *   console.log(`Password found in ${result.count} breaches`);
 * }
 * ```
 */
export async function checkPasswordBreach(password: string): Promise<BreachCheckResult> {
  // Skip empty or very short passwords
  if (!password || password.length < 4) {
    return { breached: false };
  }

  try {
    // Hash password with SHA-1
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashHex = arrayBufferToHex(hashBuffer);

    // Use k-anonymity: send first 5 chars, check suffix locally
    const prefix = hashHex.slice(0, 5);
    const suffix = hashHex.slice(5);

    // Call HaveIBeenPwned range API
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: {
        // Add padding to prevent response length analysis
        'Add-Padding': 'true',
        // Identify as IntelliFlow CRM for rate limiting
        'User-Agent': 'IntelliFlow-CRM-Password-Check',
      },
    });

    if (!response.ok) {
      console.warn('[PasswordBreachCheck] API error:', response.status);
      return { breached: false, error: `API returned ${response.status}` };
    }

    const text = await response.text();
    const lines = text.split('\r\n');

    // Search for our suffix in the response
    for (const line of lines) {
      const [hashSuffix, countStr] = line.split(':');
      if (hashSuffix === suffix) {
        const count = parseInt(countStr, 10);
        return { breached: true, count };
      }
    }

    return { breached: false };
  } catch (error) {
    // Non-blocking - log and continue
    console.warn('[PasswordBreachCheck] Error:', error);
    return {
      breached: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Create a debounced breach check function.
 *
 * This is useful for checking passwords as the user types,
 * without making too many API calls.
 *
 * @param delayMs - Debounce delay in milliseconds (default: 500)
 * @returns Debounced check function
 */
export function createDebouncedBreachCheck(delayMs = 500) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (
    password: string,
    callback: (result: BreachCheckResult) => void
  ): (() => void) => {
    // Clear previous timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Set new timeout
    timeoutId = setTimeout(async () => {
      const result = await checkPasswordBreach(password);
      callback(result);
    }, delayMs);

    // Return cancel function
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
  };
}

/**
 * Format breach count for display.
 *
 * @param count - Number of breaches
 * @returns Formatted string
 */
export function formatBreachCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
}
