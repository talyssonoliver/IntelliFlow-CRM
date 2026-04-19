/**
 * ISO 4217 Currency Codes — PG-187
 *
 * Static list of common ISO 4217 codes for the CurrencyTab combobox.
 * Keeping this internal to the feature (not shared) per plan Step 11.
 */

export interface CurrencyOption {
  code: string;
  name: string;
}

export const CURRENCY_CODES: CurrencyOption[] = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound Sterling' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'ARS', name: 'Argentine Peso' },
  { code: 'CLP', name: 'Chilean Peso' },
  { code: 'COP', name: 'Colombian Peso' },
  { code: 'PEN', name: 'Peruvian Sol' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'RUB', name: 'Russian Ruble' },
  { code: 'TRY', name: 'Turkish Lira' },
  { code: 'AED', name: 'United Arab Emirates Dirham' },
  { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'THB', name: 'Thai Baht' },
  { code: 'IDR', name: 'Indonesian Rupiah' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'PHP', name: 'Philippine Peso' },
  { code: 'VND', name: 'Vietnamese Dong' },
  { code: 'PLN', name: 'Polish Zloty' },
  { code: 'CZK', name: 'Czech Koruna' },
  { code: 'HUF', name: 'Hungarian Forint' },
  { code: 'RON', name: 'Romanian Leu' },
  { code: 'ILS', name: 'Israeli New Shekel' },
  { code: 'EGP', name: 'Egyptian Pound' },
  { code: 'NGN', name: 'Nigerian Naira' },
  { code: 'KES', name: 'Kenyan Shilling' },
];

export function filterCurrencies(query: string): CurrencyOption[] {
  if (!query) return CURRENCY_CODES;
  const q = query.trim().toUpperCase();
  return CURRENCY_CODES.filter((c) => c.code.startsWith(q) || c.name.toUpperCase().includes(q));
}
