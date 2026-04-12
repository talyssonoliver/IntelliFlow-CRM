/**
 * Email Attachment Handler Tests - full coverage for attachments.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectMimeType,
  getExtension,
  sanitizeFilename,
  generateAttachmentId,
  InMemoryAttachmentStorage,
  MockVirusScanner,
  BasicContentExtractor,
  AttachmentHandler,
  createAttachmentHandler,
  DEFAULT_ATTACHMENT_RULES,
} from '../attachments';

describe('detectMimeType', () => {
  it('should detect JPEG', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectMimeType(buf)).toBe('image/jpeg');
  });

  it('should detect PNG', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectMimeType(buf)).toBe('image/png');
  });

  it('should detect GIF', () => {
    const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(detectMimeType(buf)).toBe('image/gif');
  });

  it('should detect PDF', () => {
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    expect(detectMimeType(buf)).toBe('application/pdf');
  });

  it('should detect ZIP', () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    expect(detectMimeType(buf)).toBe('application/zip');
  });

  it('should detect text content', () => {
    const buf = Buffer.from('Hello, this is plain text content.\nLine 2.');
    expect(detectMimeType(buf)).toBe('text/plain');
  });

  it('should return undefined for unknown binary', () => {
    const buf = Buffer.from([0x01, 0x02, 0x03, 0x00, 0x04, 0x05]);
    expect(detectMimeType(buf)).toBeUndefined();
  });
});

describe('getExtension', () => {
  it('should extract extension', () => {
    expect(getExtension('document.pdf')).toBe('.pdf');
    expect(getExtension('image.PNG')).toBe('.png');
    expect(getExtension('archive.tar.gz')).toBe('.gz');
  });

  it('should return empty string for no extension', () => {
    expect(getExtension('README')).toBe('');
    expect(getExtension('file.')).toBe('');
  });
});

describe('sanitizeFilename', () => {
  it('should remove dangerous characters', () => {
    expect(sanitizeFilename('file/name.txt')).toBe('file_name.txt');
    expect(sanitizeFilename('file*name.txt')).toBe('file_name.txt');
    expect(sanitizeFilename('file:name?.txt')).toBe('file_name_.txt');
  });

  it('should remove leading dots', () => {
    expect(sanitizeFilename('.hidden')).toBe('hidden');
    expect(sanitizeFilename('..hidden')).toBe('hidden');
  });

  it('should collapse multiple dots', () => {
    expect(sanitizeFilename('file...txt')).toBe('file.txt');
  });

  it('should truncate to 255 characters', () => {
    const longName = 'a'.repeat(300) + '.txt';
    expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(255);
  });
});

describe('generateAttachmentId', () => {
  it('should generate unique IDs', () => {
    const content = Buffer.from('test content');
    const id1 = generateAttachmentId(content, 'email-1');
    const id2 = generateAttachmentId(content, 'email-2');
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^att_/);
  });
});

describe('InMemoryAttachmentStorage', () => {
  let storage: InMemoryAttachmentStorage;

  beforeEach(() => {
    storage = new InMemoryAttachmentStorage();
  });

  it('should save and retrieve attachment', async () => {
    const content = Buffer.from('test file content');
    const path = await storage.save('att-1', content, {
      filename: 'test.txt',
      contentType: 'text/plain',
      emailId: 'email-1',
    });

    expect(path).toContain('att-1');
    const result = await storage.get('att-1');
    expect(result).toBeDefined();
    expect(result!.content.toString()).toBe('test file content');
    expect(result!.metadata.filename).toBe('test.txt');
  });

  it('should check existence', async () => {
    expect(await storage.exists('nonexistent')).toBe(false);
    await storage.save('att-2', Buffer.from('x'), { emailId: 'e1' });
    expect(await storage.exists('att-2')).toBe(true);
  });

  it('should delete attachment', async () => {
    await storage.save('att-3', Buffer.from('x'), { emailId: 'e1' });
    expect(await storage.delete('att-3')).toBe(true);
    expect(await storage.exists('att-3')).toBe(false);
    expect(await storage.delete('nonexistent')).toBe(false);
  });

  it('should return data URL from getUrl', async () => {
    await storage.save('att-4', Buffer.from('hello'), { emailId: 'e1' });
    const url = await storage.getUrl('att-4');
    expect(url).toContain('data:');
    expect(url).toContain('base64');
  });

  it('should return null from getUrl for missing attachment', async () => {
    const url = await storage.getUrl('nonexistent');
    expect(url).toBeNull();
  });

  it('should clear all attachments', async () => {
    await storage.save('att-5', Buffer.from('x'), { emailId: 'e1' });
    await storage.save('att-6', Buffer.from('y'), { emailId: 'e1' });
    storage.clear();
    expect(await storage.exists('att-5')).toBe(false);
    expect(await storage.exists('att-6')).toBe(false);
  });
});

describe('MockVirusScanner', () => {
  it('should return clean for normal content', async () => {
    const scanner = new MockVirusScanner();
    expect(await scanner.isAvailable()).toBe(true);

    const result = await scanner.scan(Buffer.from('normal file content'));
    expect(result.clean).toBe(true);
    expect(result.scanDuration).toBeGreaterThan(0);
  });

  it('should detect EICAR test signature', async () => {
    const scanner = new MockVirusScanner();
    const eicar = Buffer.from(
      'X5O!P%@AP[4' +
        String.fromCharCode(92) +
        'PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
    );
    const result = await scanner.scan(eicar);
    expect(result.clean).toBe(false);
    expect(result.threatName).toBe('EICAR-Test-File');
  });

  it('should simulate infected when configured', async () => {
    const scanner = new MockVirusScanner({ simulateInfected: true });
    const result = await scanner.scan(Buffer.from('clean content'));
    expect(result.clean).toBe(false);
    expect(result.threatName).toBe('Mock.Simulated.Threat');
  });
});

describe('BasicContentExtractor', () => {
  const extractor = new BasicContentExtractor();

  it('should extract text from plain text', async () => {
    const result = await extractor.extract(Buffer.from('Hello world'), 'text/plain');
    expect(result).toBe('Hello world');
  });

  it('should strip HTML tags', async () => {
    const html =
      '<html><body><p>Hello</p><script>alert(1)</script><style>.x{}</style></body></html>';
    const result = await extractor.extract(Buffer.from(html), 'text/html');
    expect(result).toContain('Hello');
    expect(result).not.toContain('<p>');
    expect(result).not.toContain('alert');
    expect(result).not.toContain('.x{}');
  });

  it('should extract from JSON', async () => {
    const result = await extractor.extract(Buffer.from('{"key": "value"}'), 'application/json');
    expect(result).toContain('key');
  });

  it('should return null for unsupported types', async () => {
    const result = await extractor.extract(Buffer.from([0xff, 0xd8]), 'image/jpeg');
    expect(result).toBeNull();
  });

  it('canExtract should return true for supported types', () => {
    expect(extractor.canExtract('text/plain')).toBe(true);
    expect(extractor.canExtract('text/html')).toBe(true);
    expect(extractor.canExtract('application/json')).toBe(true);
    expect(extractor.canExtract('image/png')).toBe(false);
  });
});

describe('AttachmentHandler - validate', () => {
  it('should reject oversized files', () => {
    const handler = new AttachmentHandler({
      rules: { maxSizeBytes: 100 },
    });
    const content = Buffer.alloc(200);
    const result = handler.validate(content, 'big.txt');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('exceeds maximum');
  });

  it('should reject blocked extensions', () => {
    const handler = new AttachmentHandler();
    const result = handler.validate(Buffer.from('test'), 'malware.exe');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('.exe');
  });

  it('should reject disallowed MIME types', () => {
    const handler = new AttachmentHandler({
      rules: { allowedMimeTypes: ['text/plain'] },
    });
    const result = handler.validate(Buffer.from([0xff, 0xd8, 0xff]), 'image.jpg', 'image/jpeg');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('not allowed');
  });

  it('should warn on MIME type mismatch', () => {
    const handler = new AttachmentHandler();
    const pdfContent = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const result = handler.validate(pdfContent, 'file.pdf', 'text/plain');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('differs');
  });

  it('should pass valid file', () => {
    const handler = new AttachmentHandler();
    const result = handler.validate(Buffer.from('test content'), 'readme.txt', 'text/plain');
    expect(result.valid).toBe(true);
  });
});

describe('AttachmentHandler - process', () => {
  it('should process and store valid attachment', async () => {
    const handler = createAttachmentHandler();
    const result = await handler.process(Buffer.from('test content'), 'readme.txt', 'email-123', {
      contentType: 'text/plain',
    });

    expect(result.success).toBe(true);
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.filename).toBe('readme.txt');
  });

  it('should fail for invalid attachment', async () => {
    const handler = new AttachmentHandler({
      rules: { maxSizeBytes: 5 },
    });
    const result = await handler.process(Buffer.from('too large content'), 'big.txt', 'email-123');

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('should skip validation when skipValidation is true', async () => {
    const handler = new AttachmentHandler({
      rules: { maxSizeBytes: 5 },
    });
    const result = await handler.process(
      Buffer.from('large content here'),
      'big.txt',
      'email-123',
      { skipValidation: true }
    );

    expect(result.success).toBe(true);
  });

  it('should detect virus in attachment', async () => {
    const handler = new AttachmentHandler({
      virusScanner: new MockVirusScanner({ simulateInfected: true }),
    });
    const result = await handler.process(
      Buffer.from('infected content'),
      'virus.txt',
      'email-123',
      { contentType: 'text/plain' }
    );

    expect(result.success).toBe(false);
    expect(result.errors![0]).toContain('Virus detected');
  });

  it('should handle virus scan error gracefully', async () => {
    const failScanner = {
      scan: vi.fn().mockRejectedValue(new Error('Scanner unavailable')),
      isAvailable: vi.fn().mockResolvedValue(false),
    };
    const handler = new AttachmentHandler({
      virusScanner: failScanner,
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await handler.process(Buffer.from('test'), 'file.txt', 'email-123', {
      contentType: 'text/plain',
    });

    // Should succeed despite scan error (scan error sets status to error but continues)
    expect(result.success).toBe(true);
    warnSpy.mockRestore();
  });

  it('should extract text content when extractor available', async () => {
    const handler = createAttachmentHandler();
    const result = await handler.process(
      Buffer.from('<html><body>Hello</body></html>'),
      'page.html',
      'email-123',
      { contentType: 'text/html' }
    );

    expect(result.success).toBe(true);
    expect(result.metadata!.extractedText).toContain('Hello');
  });
});

describe('AttachmentHandler - get/delete/getDownloadUrl', () => {
  it('should get stored attachment', async () => {
    const handler = createAttachmentHandler();
    const processResult = await handler.process(Buffer.from('test'), 'file.txt', 'e1', {
      contentType: 'text/plain',
    });

    const stored = await handler.get(processResult.metadata!.id);
    expect(stored).toBeDefined();
    expect(stored!.content.toString()).toBe('test');
  });

  it('should delete stored attachment', async () => {
    const handler = createAttachmentHandler();
    const processResult = await handler.process(Buffer.from('test'), 'file.txt', 'e1', {
      contentType: 'text/plain',
    });

    const deleted = await handler.delete(processResult.metadata!.id);
    expect(deleted).toBe(true);
  });

  it('should get download URL', async () => {
    const handler = createAttachmentHandler();
    const processResult = await handler.process(Buffer.from('test'), 'file.txt', 'e1', {
      contentType: 'text/plain',
    });

    const url = await handler.getDownloadUrl(processResult.metadata!.id);
    expect(url).toBeTruthy();
  });
});

describe('AttachmentHandler - processEmailAttachments', () => {
  it('should process multiple attachments', async () => {
    const handler = createAttachmentHandler();
    const result = await handler.processEmailAttachments(
      [
        { filename: 'doc.txt', content: Buffer.from('doc'), contentType: 'text/plain' },
        { filename: 'data.json', content: Buffer.from('{"a":1}'), contentType: 'application/json' },
      ],
      'email-456'
    );

    expect(result.successful).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
  });

  it('should track failed attachments', async () => {
    const handler = new AttachmentHandler({
      rules: {
        maxSizeBytes: 5,
        blockedExtensions: [],
        allowedMimeTypes: [],
        requireVirusScan: false,
      },
    });
    const result = await handler.processEmailAttachments(
      [
        { filename: 'small.txt', content: Buffer.from('hi') },
        { filename: 'big.txt', content: Buffer.from('this is too large') },
      ],
      'email-789'
    );

    expect(result.successful.length).toBeGreaterThanOrEqual(1);
    expect(result.failed.length).toBeGreaterThanOrEqual(1);
  });
});

describe('createAttachmentHandler factory', () => {
  it('should create handler with defaults', () => {
    const handler = createAttachmentHandler();
    expect(handler).toBeInstanceOf(AttachmentHandler);
  });

  it('should create handler with custom rules', () => {
    const handler = createAttachmentHandler({
      rules: { maxSizeBytes: 1024 },
    });
    expect(handler).toBeInstanceOf(AttachmentHandler);
  });
});
