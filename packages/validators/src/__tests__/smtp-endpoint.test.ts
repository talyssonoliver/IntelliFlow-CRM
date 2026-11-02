import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  hasSmtpEndpoint,
  NO_SMTP_ENDPOINT,
  pickSmtpEndpoint,
  SMTP_ENDPOINT_FIELDS,
  smtpEndpointConfig,
  smtpEndpointDiffers,
  smtpEndpointDto,
  smtpEndpointFields,
  smtpEndpointInputShape,
} from '../smtp-endpoint';

const HOST = 'smtp.mail.example.invalid';
const row = { smtpHost: HOST, smtpPort: 587, smtpSecurity: 'STARTTLS' };
const input = z.object(smtpEndpointInputShape);

describe('smtpEndpointInputShape', () => {
  it('covers exactly the endpoint fields', () => {
    expect(Object.keys(smtpEndpointInputShape)).toEqual([...SMTP_ENDPOINT_FIELDS]);
  });

  it('lower-cases and trims the host', () => {
    const parsed = input.parse({ ...row, smtpHost: `  ${HOST.toUpperCase()} ` });
    expect(parsed.smtpHost).toBe(HOST);
  });

  it.each([465, 587, 2525])('accepts port %i', (smtpPort) => {
    expect(input.safeParse({ ...row, smtpPort }).success).toBe(true);
  });

  it.each([25, 0, 587.5])('rejects port %d', (smtpPort) => {
    expect(input.safeParse({ ...row, smtpPort }).success).toBe(false);
  });

  it('names the allowed ports when it rejects one', () => {
    const result = input.safeParse({ ...row, smtpPort: 25 });
    expect(result.error?.issues[0]?.message).toBe('SMTP port must be one of 465, 587, 2525');
  });

  it('rejects an unknown security mode', () => {
    expect(input.safeParse({ ...row, smtpSecurity: 'NONE' }).success).toBe(false);
  });

  it('rejects a host that is not a public mail server', () => {
    expect(input.safeParse({ ...row, smtpHost: '127.0.0.1' }).success).toBe(false);
  });
});

describe('NO_SMTP_ENDPOINT', () => {
  it('is all null and cannot be changed', () => {
    expect(NO_SMTP_ENDPOINT).toEqual({ smtpHost: null, smtpPort: null, smtpSecurity: null });
    expect(Object.isFrozen(NO_SMTP_ENDPOINT)).toBe(true);
  });
});

describe('smtpEndpointFields', () => {
  it('maps each value to its own field', () => {
    expect(smtpEndpointFields(HOST, 465, 'SSL')).toEqual({
      smtpHost: HOST,
      smtpPort: 465,
      smtpSecurity: 'SSL',
    });
  });
});

describe('pickSmtpEndpoint', () => {
  it('drops every field that is not part of the endpoint', () => {
    const source = { ...row, fromAddress: 'me@mail.example.invalid', tenantId: 'tenant-a' };
    expect(pickSmtpEndpoint(source)).toEqual(row);
  });
});

describe('smtpEndpointDto', () => {
  it('shows the stored values when allowed', () => {
    expect(smtpEndpointDto(row, true)).toEqual(row);
  });

  it('hides every field when not allowed', () => {
    expect(smtpEndpointDto(row, false)).toEqual(NO_SMTP_ENDPOINT);
  });

  it('returns a fresh object when hiding, not the frozen constant', () => {
    expect(smtpEndpointDto(row, false)).not.toBe(NO_SMTP_ENDPOINT);
  });
});

describe('smtpEndpointDiffers', () => {
  it('is false for the same host', () => {
    expect(smtpEndpointDiffers({ smtpHost: HOST }, { smtpHost: HOST })).toBe(false);
  });

  it('is true when the credential would go to another server', () => {
    expect(smtpEndpointDiffers({ smtpHost: HOST }, { smtpHost: `other.${HOST}` })).toBe(true);
  });

  it('is true when there was no stored host', () => {
    expect(smtpEndpointDiffers({ smtpHost: null }, { smtpHost: HOST })).toBe(true);
  });
});

describe('hasSmtpEndpoint', () => {
  it('is true when every field is set', () => {
    expect(hasSmtpEndpoint(row)).toBe(true);
  });

  it.each([
    ['host', { ...row, smtpHost: null }],
    ['port', { ...row, smtpPort: null }],
    ['security mode', { ...row, smtpSecurity: null }],
  ])('is false without a %s', (_name, incomplete) => {
    expect(hasSmtpEndpoint(incomplete)).toBe(false);
  });
});

describe('smtpEndpointConfig', () => {
  it('passes the stored values through', () => {
    expect(smtpEndpointConfig({ ...row, smtpSecurity: 'SSL' })).toEqual({
      host: HOST,
      port: 587,
      security: 'SSL',
    });
  });

  it('uses empty values and STARTTLS for unset fields', () => {
    expect(smtpEndpointConfig(NO_SMTP_ENDPOINT)).toEqual({
      host: '',
      port: 0,
      security: 'STARTTLS',
    });
  });
});
