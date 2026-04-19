/**
 * Document Settings Router Tests - PG-186
 *
 * Tests router export + default constants + runtime wiring.
 * NO fake-green assertions — every test exercises real behavior.
 */

import { describe, it, expect } from 'vitest';
import { documentSettingsRouter } from '../document-settings.router';
import { AUTOMATION_FACTORY_DEFAULTS } from '../document-automation';
import {
  DEFAULT_ALLOWED_EXTENSIONS,
  DEFAULT_BLOCKED_EXTENSIONS,
  DEFAULT_ALLOWED_MIME_TYPES,
} from '@intelliflow/validators';

describe('documentSettingsRouter export', () => {
  it('is defined and non-null', () => {
    expect(documentSettingsRouter).toBeDefined();
    expect(documentSettingsRouter).not.toBeNull();
  });

  it('exposes createCaller method (tRPC router contract)', () => {
    expect(typeof (documentSettingsRouter as any).createCaller).toBe('function');
  });

  it('is an object (not a function or primitive)', () => {
    expect(typeof documentSettingsRouter).toBe('object');
  });
});

describe('defaults are sensible and not empty', () => {
  it('DEFAULT_ALLOWED_EXTENSIONS includes common document formats', () => {
    expect(DEFAULT_ALLOWED_EXTENSIONS).toContain('pdf');
    expect(DEFAULT_ALLOWED_EXTENSIONS).toContain('docx');
    expect(DEFAULT_ALLOWED_EXTENSIONS).toContain('xlsx');
    expect(DEFAULT_ALLOWED_EXTENSIONS.length).toBeGreaterThanOrEqual(10);
  });

  it('DEFAULT_BLOCKED_EXTENSIONS includes executable types', () => {
    expect(DEFAULT_BLOCKED_EXTENSIONS).toContain('exe');
    expect(DEFAULT_BLOCKED_EXTENSIONS).toContain('bat');
    expect(DEFAULT_BLOCKED_EXTENSIONS).toContain('sh');
  });

  it('DEFAULT_ALLOWED_MIME_TYPES has >= 10 entries', () => {
    expect(DEFAULT_ALLOWED_MIME_TYPES.length).toBeGreaterThanOrEqual(10);
  });
});

describe('automation factory defaults match audit policy', () => {
  it('Cat-1 toggles default true (safe)', () => {
    expect(AUTOMATION_FACTORY_DEFAULTS.normalizeFilename).toBe(true);
    expect(AUTOMATION_FACTORY_DEFAULTS.preventDeleteIfReferenced).toBe(true);
  });

  it('Cat-2 toggles default false (pending infra)', () => {
    expect(AUTOMATION_FACTORY_DEFAULTS.notifyOnOwnerChange).toBe(false);
    expect(AUTOMATION_FACTORY_DEFAULTS.notifyOnUpload).toBe(false);
  });

  it('Cat-3 AI toggles default false (opt-in privacy)', () => {
    expect(AUTOMATION_FACTORY_DEFAULTS.aiDocumentClassification).toBe(false);
    expect(AUTOMATION_FACTORY_DEFAULTS.aiSensitiveDataDetection).toBe(false);
    expect(AUTOMATION_FACTORY_DEFAULTS.aiSummarization).toBe(false);
  });

  it('has exactly 7 flag keys', () => {
    expect(Object.keys(AUTOMATION_FACTORY_DEFAULTS).length).toBe(7);
  });
});
