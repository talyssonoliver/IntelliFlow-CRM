import { describe, it, expect } from 'vitest';
import { ResponseContent, ResponseContentValidationError } from '../ResponseContent';

describe('ResponseContent', () => {
  describe('create', () => {
    it('should create with required fields', () => {
      const content = ResponseContent.create({
        subject: 'Test Subject',
        body: 'Test body content',
      });

      expect(content.subject).toBe('Test Subject');
      expect(content.body).toBe('Test body content');
      expect(content.signature).toBeUndefined();
      expect(content.replyTo).toBeUndefined();
    });

    it('should create with all fields', () => {
      const content = ResponseContent.create({
        subject: 'Test Subject',
        body: 'Test body content',
        signature: 'Best regards, IntelliFlow',
        replyTo: 'support@intelliflow.com',
      });

      expect(content.subject).toBe('Test Subject');
      expect(content.body).toBe('Test body content');
      expect(content.signature).toBe('Best regards, IntelliFlow');
      expect(content.replyTo).toBe('support@intelliflow.com');
    });

    it('should trim whitespace', () => {
      const content = ResponseContent.create({
        subject: '  Test Subject  ',
        body: '  Test body  ',
        signature: '  Signature  ',
      });

      expect(content.subject).toBe('Test Subject');
      expect(content.body).toBe('Test body');
      expect(content.signature).toBe('Signature');
    });

    it('should throw if subject is empty', () => {
      expect(() =>
        ResponseContent.create({
          subject: '',
          body: 'Test body',
        })
      ).toThrow(ResponseContentValidationError);
    });

    it('should throw if subject is whitespace only', () => {
      expect(() =>
        ResponseContent.create({
          subject: '   ',
          body: 'Test body',
        })
      ).toThrow('Subject is required');
    });

    it('should throw if body is empty', () => {
      expect(() =>
        ResponseContent.create({
          subject: 'Test Subject',
          body: '',
        })
      ).toThrow(ResponseContentValidationError);
    });

    it('should throw if body is whitespace only', () => {
      expect(() =>
        ResponseContent.create({
          subject: 'Test Subject',
          body: '   ',
        })
      ).toThrow('Body is required');
    });

    it('should throw if subject exceeds 100 characters', () => {
      const longSubject = 'a'.repeat(101);
      expect(() =>
        ResponseContent.create({
          subject: longSubject,
          body: 'Test body',
        })
      ).toThrow('Subject exceeds 100 characters');
    });

    it('should throw if body exceeds 2000 characters', () => {
      const longBody = 'a'.repeat(2001);
      expect(() =>
        ResponseContent.create({
          subject: 'Test Subject',
          body: longBody,
        })
      ).toThrow('Body exceeds 2000 characters');
    });

    it('should allow subject at exactly 100 characters', () => {
      const exactSubject = 'a'.repeat(100);
      const content = ResponseContent.create({
        subject: exactSubject,
        body: 'Test body',
      });
      expect(content.subject.length).toBe(100);
    });

    it('should allow body at exactly 2000 characters', () => {
      const exactBody = 'a'.repeat(2000);
      const content = ResponseContent.create({
        subject: 'Test Subject',
        body: exactBody,
      });
      expect(content.body.length).toBe(2000);
    });
  });

  describe('immutability', () => {
    it('should be immutable', () => {
      const content = ResponseContent.create({
        subject: 'Test Subject',
        body: 'Test body',
      });

      // Props should be frozen
      expect(Object.isFrozen((content as any).props)).toBe(true);
    });
  });

  describe('equals', () => {
    it('should return true for equal content', () => {
      const content1 = ResponseContent.create({
        subject: 'Test Subject',
        body: 'Test body',
      });
      const content2 = ResponseContent.create({
        subject: 'Test Subject',
        body: 'Test body',
      });

      expect(content1.equals(content2)).toBe(true);
    });

    it('should return false for different content', () => {
      const content1 = ResponseContent.create({
        subject: 'Test Subject 1',
        body: 'Test body',
      });
      const content2 = ResponseContent.create({
        subject: 'Test Subject 2',
        body: 'Test body',
      });

      expect(content1.equals(content2)).toBe(false);
    });
  });

  describe('toValue', () => {
    it('should return props object', () => {
      const content = ResponseContent.create({
        subject: 'Test Subject',
        body: 'Test body',
        signature: 'Signature',
      });

      const value = content.toValue();
      expect(value).toEqual({
        subject: 'Test Subject',
        body: 'Test body',
        signature: 'Signature',
        replyTo: undefined,
      });
    });
  });

  describe('withModifications', () => {
    it('should create modified copy with new subject', () => {
      const original = ResponseContent.create({
        subject: 'Original Subject',
        body: 'Original body',
        signature: 'Signature',
      });

      const modified = original.withModifications({
        subject: 'Modified Subject',
      });

      expect(modified.subject).toBe('Modified Subject');
      expect(modified.body).toBe('Original body');
      expect(modified.signature).toBe('Signature');
      // Original should be unchanged
      expect(original.subject).toBe('Original Subject');
    });

    it('should create modified copy with new body', () => {
      const original = ResponseContent.create({
        subject: 'Original Subject',
        body: 'Original body',
      });

      const modified = original.withModifications({
        body: 'Modified body',
      });

      expect(modified.subject).toBe('Original Subject');
      expect(modified.body).toBe('Modified body');
    });

    it('should create modified copy with both subject and body', () => {
      const original = ResponseContent.create({
        subject: 'Original Subject',
        body: 'Original body',
      });

      const modified = original.withModifications({
        subject: 'Modified Subject',
        body: 'Modified body',
      });

      expect(modified.subject).toBe('Modified Subject');
      expect(modified.body).toBe('Modified body');
    });
  });
});
