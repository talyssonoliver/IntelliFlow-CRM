/**
 * Runtime-agnostic secret redaction for k6 load-test summary artifacts.
 *
 * WHY: k6 summary handlers serialize the full run `data` object into JSON files
 * under `artifacts/benchmarks/`. That object carries `setup_data` (the return
 * value of `setup()`); when `setup()` caches a Supabase auth token, the live JWT
 * ends up committed. See #643 (found during ENG-OPS-003.Gap5, #637).
 *
 * This module has NO k6 imports, so it is importable by the k6 scripts (goja)
 * and unit-testable under Vitest (node) alike. Conservative JS (no optional
 * chaining / arrow-only syntax) for k6 runtime parity.
 */

// A JWT is three base64url segments joined by dots; the header segment always
// starts with `eyJ` (base64url of `{"`). Matches Supabase access/refresh tokens
// and any JWT. The signature segment may be empty (alg=none), hence `*`.
var JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;

// Object keys whose values are secret-bearing and must always be masked,
// regardless of the value's string shape.
var SECRET_KEY_RE =
  /^(auth[_-]?token|access[_-]?token|refresh[_-]?token|id[_-]?token|token|api[_-]?key|apikey|authorization|password|secret|anon[_-]?key|service[_-]?role[_-]?key)$/i;

export var REDACTED = '[REDACTED]';

/**
 * Replace any JWT-shaped substring in a string with REDACTED. Non-strings pass
 * through unchanged.
 */
export function redactString(value) {
  if (typeof value !== 'string') {
    return value;
  }
  return value.replace(JWT_RE, REDACTED);
}

/**
 * Deep-clone `input`, masking secret-keyed values and JWT-shaped strings.
 * Arrays and nested objects are handled recursively. Input is assumed
 * JSON-serializable (as k6 summary data always is), so no cycle handling is
 * needed. The input is never mutated.
 */
export function redactSecrets(input) {
  if (typeof input === 'string') {
    return redactString(input);
  }
  if (input === null || typeof input !== 'object') {
    return input;
  }
  if (Array.isArray(input)) {
    var arr = [];
    for (var i = 0; i < input.length; i++) {
      arr.push(redactSecrets(input[i]));
    }
    return arr;
  }
  var out = {};
  var keys = Object.keys(input);
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    if (SECRET_KEY_RE.test(key)) {
      out[key] = REDACTED;
    } else {
      out[key] = redactSecrets(input[key]);
    }
  }
  return out;
}

/**
 * Sanitize a k6 summary `data` object before it is written to disk:
 *   - drops `setup_data` entirely (it caches the auth token), and
 *   - deep-redacts any remaining secret-keyed values / JWT strings.
 */
export function sanitizeSummaryData(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return redactSecrets(data);
  }
  var clone = {};
  var keys = Object.keys(data);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key === 'setup_data') {
      continue; // never persist setup() output — it caches the auth token
    }
    clone[key] = redactSecrets(data[key]);
  }
  return clone;
}
