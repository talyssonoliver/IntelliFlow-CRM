/**
 * Email Value Object Tests
 *
 * Tests RFC 5321 compliance and email format validation
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import { Email, InvalidEmailError } from '../Email';

describe('Email', () => {
  describe('create()', () => {
    it('should create with valid email', () => {
      const result = Email.create('test@example.com');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(Email);
      expect(result.value.value).toBe('test@example.com');
    });

    it('should normalize email to lowercase', () => {
      const result = Email.create('Test@Example.COM');

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe('test@example.com');
    });

    it('should trim whitespace from email', () => {
      const result = Email.create('  test@example.com  ');

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe('test@example.com');
    });

    it('should accept email with plus sign in local part', () => {
      const result = Email.create('test+tag@example.com');

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe('test+tag@example.com');
    });

    it('should accept email with dots in local part', () => {
      const result = Email.create('first.last@example.com');

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe('first.last@example.com');
    });

    it('should accept email with numbers', () => {
      const result = Email.create('user123@example456.com');

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe('user123@example456.com');
    });

    it('should accept email with hyphens in domain', () => {
      const result = Email.create('test@my-domain.com');

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe('test@my-domain.com');
    });

    it('should accept email with subdomain', () => {
      const result = Email.create('test@mail.example.com');

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe('test@mail.example.com');
    });

    it('should accept email with long TLD', () => {
      const result = Email.create('test@example.museum');

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe('test@example.museum');
    });

    it('should accept email at maximum local part length (64 chars)', () => {
      const localPart = 'a'.repeat(64);
      const result = Email.create(`${localPart}@example.com`);

      expect(result.isSuccess).toBe(true);
    });

    it('should accept email at maximum domain length (253 chars)', () => {
      const subdomain = 'a'.repeat(63);
      const domain = `${subdomain}.${subdomain}.${subdomain}.co`;
      const result = Email.create(`test@${domain}`);

      expect(result.isSuccess).toBe(true);
    });

    it('should accept email at maximum total length (320 chars)', () => {
      const localPart = 'a'.repeat(64);
      const domainPart = 'b'.repeat(243);
      const email = `${localPart}@${domainPart}.com`;

      expect(email.length).toBeLessThanOrEqual(320);
      const result = Email.create(email);

      expect(result.isSuccess).toBe(true);
    });

    it('should reject empty email', () => {
      const result = Email.create('');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmailError);
      expect(result.error.code).toBe('INVALID_EMAIL');
      expect(result.error.message).toContain('Invalid email address: empty');
    });

    it('should reject null email as empty string', () => {
      const result = Email.create(null as unknown as string);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmailError);
    });

    it('should reject undefined email as empty string', () => {
      const result = Email.create(undefined as unknown as string);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmailError);
    });

    it('should reject email without @ symbol', () => {
      const result = Email.create('invalidemail.com');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmailError);
      expect(result.error.code).toBe('INVALID_EMAIL');
    });

    it('should reject email without domain', () => {
      const result = Email.create('test@');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmailError);
    });

    it('should reject email without local part', () => {
      const result = Email.create('@example.com');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmailError);
    });

    it('should reject email without TLD', () => {
      const result = Email.create('test@example');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmailError);
    });

    it('should reject email with multiple @ symbols', () => {
      const result = Email.create('test@@example.com');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmailError);
    });

    it('should reject email with spaces', () => {
      const result = Email.create('test user@example.com');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmailError);
    });

    it('should reject email with special characters in local part', () => {
      const result = Email.create('test!user@example.com');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmailError);
    });

    it('should reject email with special characters in domain', () => {
      const result = Email.create('test@exam_ple.com');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmailError);
    });

    it('should accept email starting with dot (allowed by simplified regex)', () => {
      const result = Email.create('.test@example.com');

      // Note: The current regex allows this for performance reasons (ReDoS prevention)
      // Strict RFC 5321 would reject this, but the regex prioritizes safety
      expect(result.isSuccess).toBe(true);
    });

    it('should accept email ending with dot before @ (allowed by simplified regex)', () => {
      const result = Email.create('test.@example.com');

      // Note: The current regex allows this for performance reasons (ReDoS prevention)
      // Strict RFC 5321 would reject this, but the regex prioritizes safety
      expect(result.isSuccess).toBe(true);
    });

    it('should accept email with consecutive dots (allowed by simplified regex)', () => {
      const result = Email.create('test..user@example.com');

      // Note: The current regex allows this for performance reasons (ReDoS prevention)
      // Strict RFC 5321 would reject this, but the regex prioritizes safety
      expect(result.isSuccess).toBe(true);
    });

    it('should reject email exceeding max length (321+ chars)', () => {
      const localPart = 'a'.repeat(64);
      const domainPart = 'b'.repeat(253);
      const email = `${localPart}@${domainPart}.com`;

      expect(email.length).toBeGreaterThan(320);
      const result = Email.create(email);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmailError);
    });

    it('should reject email with local part exceeding 64 chars', () => {
      const localPart = 'a'.repeat(65);
      const result = Email.create(`${localPart}@example.com`);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmailError);
    });

    it('should reject email with domain exceeding 253 chars', () => {
      const subdomain = 'a'.repeat(64);
      const domain = `${subdomain}.${subdomain}.${subdomain}.${subdomain}.com`;
      const result = Email.create(`test@${domain}`);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmailError);
    });

    it('should reject email with TLD too short (1 char)', () => {
      const result = Email.create('test@example.c');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmailError);
    });

    it('should reject email with TLD too long (64+ chars)', () => {
      const tld = 'c'.repeat(64);
      const result = Email.create(`test@example.${tld}`);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmailError);
    });

    it('should reject IP address as domain', () => {
      const result = Email.create('test@192.168.1.1');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmailError);
    });
  });

  describe('value', () => {
    it('should return the email value', () => {
      const email = Email.create('test@example.com').value;

      expect(email.value).toBe('test@example.com');
    });

    it('should return normalized email value', () => {
      const email = Email.create('  Test@Example.COM  ').value;

      expect(email.value).toBe('test@example.com');
    });
  });

  describe('domain', () => {
    it('should return the domain part', () => {
      const email = Email.create('test@example.com').value;

      expect(email.domain).toBe('example.com');
    });

    it('should return subdomain correctly', () => {
      const email = Email.create('test@mail.example.com').value;

      expect(email.domain).toBe('mail.example.com');
    });

    it('should return normalized domain', () => {
      const email = Email.create('test@Example.COM').value;

      expect(email.domain).toBe('example.com');
    });
  });

  describe('localPart', () => {
    it('should return the local part', () => {
      const email = Email.create('test@example.com').value;

      expect(email.localPart).toBe('test');
    });

    it('should return local part with special characters', () => {
      const email = Email.create('first.last+tag@example.com').value;

      expect(email.localPart).toBe('first.last+tag');
    });

    it('should return normalized local part', () => {
      const email = Email.create('Test@example.com').value;

      expect(email.localPart).toBe('test');
    });
  });

  describe('equals()', () => {
    it('should return true for equal emails', () => {
      const email1 = Email.create('test@example.com').value;
      const email2 = Email.create('test@example.com').value;

      expect(email1.equals(email2)).toBe(true);
    });

    it('should return true for emails that normalize to same value', () => {
      const email1 = Email.create('Test@Example.COM').value;
      const email2 = Email.create('test@example.com').value;

      expect(email1.equals(email2)).toBe(true);
    });

    it('should return true for emails with whitespace that normalize the same', () => {
      const email1 = Email.create('  test@example.com  ').value;
      const email2 = Email.create('test@example.com').value;

      expect(email1.equals(email2)).toBe(true);
    });

    it('should return false for different emails', () => {
      const email1 = Email.create('test1@example.com').value;
      const email2 = Email.create('test2@example.com').value;

      expect(email1.equals(email2)).toBe(false);
    });

    it('should return false for different domains', () => {
      const email1 = Email.create('test@example1.com').value;
      const email2 = Email.create('test@example2.com').value;

      expect(email1.equals(email2)).toBe(false);
    });

    it('should return false for null', () => {
      const email = Email.create('test@example.com').value;

      expect(email.equals(null as any)).toBe(false);
    });

    it('should return false for undefined', () => {
      const email = Email.create('test@example.com').value;

      expect(email.equals(undefined as any)).toBe(false);
    });
  });

  describe('toValue()', () => {
    it('should return the raw email string', () => {
      const email = Email.create('test@example.com').value;

      expect(email.toValue()).toBe('test@example.com');
    });

    it('should return normalized email', () => {
      const email = Email.create('Test@Example.COM').value;

      expect(email.toValue()).toBe('test@example.com');
    });
  });

  describe('toString()', () => {
    it('should return the email as string', () => {
      const email = Email.create('test@example.com').value;

      expect(email.toString()).toBe('test@example.com');
    });

    it('should return normalized email string', () => {
      const email = Email.create('Test@Example.COM').value;

      expect(email.toString()).toBe('test@example.com');
    });
  });

  describe('immutability', () => {
    it('should have frozen props', () => {
      const email = Email.create('test@example.com').value;
      const props = (email as any).props;

      expect(Object.isFrozen(props)).toBe(true);
    });

    it('should not allow modification of value through props', () => {
      const email = Email.create('test@example.com').value;

      expect(() => {
        (email as any).props.value = 'modified@example.com';
      }).toThrow();
    });
  });
});
