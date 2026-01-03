/**
 * Backup Codes Utility
 *
 * IMPLEMENTS: PG-021 (MFA Setup)
 *
 * Utilities for formatting, copying, downloading, and printing MFA backup codes.
 */

/**
 * Format a single backup code with a dash in the middle for readability.
 *
 * @param code - Raw backup code (e.g., "A1B2C3D4E5")
 * @returns Formatted code with dash (e.g., "A1B2C-3D4E5")
 */
export function formatBackupCode(code: string): string {
  // Normalize: uppercase, remove spaces and existing dashes
  const normalized = code.toUpperCase().trim().replace(/-/g, '');
  const midpoint = Math.floor(normalized.length / 2);
  return `${normalized.slice(0, midpoint)}-${normalized.slice(midpoint)}`;
}

/**
 * Format codes as a numbered list for display.
 */
export interface FormattedCode {
  index: number;
  code: string;
}

/**
 * Format an array of backup codes for display with index numbers.
 *
 * @param codes - Array of raw backup codes
 * @returns Array of objects with index and formatted code
 */
export function formatBackupCodesForDisplay(codes: string[]): FormattedCode[] {
  return codes.map((code, i) => ({
    index: i + 1,
    code: formatBackupCode(code),
  }));
}

/**
 * Generate text file content for backup codes download.
 *
 * @param codes - Array of raw backup codes
 * @param email - User's email address
 * @param generatedAt - Date when codes were generated
 * @returns Text content for the download file
 */
export function generateBackupCodesDownload(
  codes: string[],
  email: string,
  generatedAt: Date
): string {
  const dateStr = generatedAt.toISOString().split('T')[0];
  const formattedCodes = codes.map((code, i) => `  ${i + 1}. ${formatBackupCode(code)}`).join('\n');

  return `================================================================================
IntelliFlow CRM - Backup Codes
================================================================================

Account: ${email}
Generated: ${dateStr}

Your backup codes:
${formattedCodes}

--------------------------------------------------------------------------------
IMPORTANT - Please read carefully:
--------------------------------------------------------------------------------

1. Keep these codes in a safe place (password manager, secure document, etc.)
2. Each code can only be used once (one-time use)
3. Use these codes when you cannot access your primary MFA method
4. Generate new codes if you run low or if these are compromised
5. Do not share these codes with anyone

If you lose access to your account and these codes, contact support at:
support@intelliflow.com

================================================================================
`;
}

/**
 * Copy backup codes to clipboard.
 *
 * @param codes - Array of raw backup codes
 * @returns Promise resolving to true on success, false on failure
 */
export async function copyBackupCodesToClipboard(codes: string[]): Promise<boolean> {
  try {
    const formattedCodes = codes.map((code, i) => `${i + 1}. ${formatBackupCode(code)}`).join('\n');
    await navigator.clipboard.writeText(formattedCodes);
    return true;
  } catch {
    console.error('Failed to copy backup codes to clipboard');
    return false;
  }
}

/**
 * Trigger download of backup codes as a text file.
 *
 * @param codes - Array of raw backup codes
 * @param email - User's email address
 * @param generatedAt - Date when codes were generated
 */
export function downloadBackupCodes(codes: string[], email: string, generatedAt: Date): void {
  const content = generateBackupCodesDownload(codes, email, generatedAt);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const dateStr = generatedAt.toISOString().split('T')[0];
  const filename = `intelliflow-backup-codes-${dateStr}.txt`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  // Cleanup blob URL after a short delay
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Open print dialog with formatted backup codes.
 *
 * @param codes - Array of raw backup codes
 * @param email - User's email address
 * @param generatedAt - Date when codes were generated
 */
export function printBackupCodes(codes: string[], email: string, generatedAt: Date): void {
  const dateStr = generatedAt.toISOString().split('T')[0];
  const formattedCodes = codes.map((code, i) => `<tr><td>${i + 1}.</td><td>${formatBackupCode(code)}</td></tr>`).join('');

  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>IntelliFlow CRM - Backup Codes</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 40px;
          max-width: 600px;
          margin: 0 auto;
        }
        h1 {
          color: #0f172a;
          font-size: 24px;
          margin-bottom: 8px;
        }
        .subtitle {
          color: #64748b;
          margin-bottom: 24px;
        }
        .info {
          background: #f1f5f9;
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 24px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-family: ui-monospace, monospace;
          font-size: 16px;
        }
        td {
          padding: 8px;
          border-bottom: 1px solid #e2e8f0;
        }
        td:first-child {
          width: 40px;
          color: #64748b;
        }
        .warning {
          background: #fef3c7;
          border: 1px solid #fcd34d;
          padding: 16px;
          border-radius: 8px;
          margin-top: 24px;
        }
        .warning h3 {
          color: #92400e;
          margin: 0 0 8px 0;
          font-size: 14px;
        }
        .warning ul {
          margin: 0;
          padding-left: 20px;
          color: #78350f;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <h1>IntelliFlow CRM</h1>
      <p class="subtitle">Backup Codes</p>
      <div class="info">
        <strong>Account:</strong> ${email}<br>
        <strong>Generated:</strong> ${dateStr}
      </div>
      <table>
        ${formattedCodes}
      </table>
      <div class="warning">
        <h3>IMPORTANT</h3>
        <ul>
          <li>Keep these codes in a safe place</li>
          <li>Each code can only be used once</li>
          <li>Do not share these codes with anyone</li>
        </ul>
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    console.error('Could not open print window');
    return;
  }

  printWindow.document.write(printContent);
  printWindow.document.close();
  printWindow.print();
}

/**
 * Validate a backup code format.
 *
 * @param code - Code to validate
 * @returns true if valid format, false otherwise
 */
export function validateBackupCode(code: string): boolean {
  if (!code || typeof code !== 'string') {
    return false;
  }

  // Remove dash and normalize
  const normalized = code.replace(/-/g, '').trim();

  // Must be 8-12 alphanumeric characters
  if (normalized.length < 8 || normalized.length > 12) {
    return false;
  }

  // Must be alphanumeric only
  return /^[A-Za-z0-9]+$/.test(normalized);
}
