/**
 * DKIM Signer Tests - full coverage for dkim-signer.ts
 */

import { describe, it, expect, vi } from "vitest";
import { generateKeyPairSync } from "crypto";
import {
  canonicalizeHeaderRelaxed,
  canonicalizeHeaderSimple,
  canonicalizeBodyRelaxed,
  canonicalizeBodySimple,
  parseEmailParts,
  parseHeaderLines,
  DkimSigner,
  DkimKeyManager,
  generateDkimDnsRecord,
  parseDkimSignature,
  createDkimSigner,
  createDkimKeyManager,
} from "../dkim-signer";

// Generate a test RSA key pair
const { privateKey: testPrivateKey, publicKey: testPublicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const TEST_CONFIG = {
  domain: "example.com",
  selector: "s1",
  privateKey: testPrivateKey,
  algorithm: "rsa-sha256" as const,
  canonicalization: { header: "relaxed" as const, body: "relaxed" as const },
};

const TEST_EMAIL = [
  "From: sender@example.com",
  "To: recipient@test.com",
  "Subject: Test Email",
  "Date: Mon, 01 Jan 2024 00:00:00 +0000",
  "Message-ID: <test123@example.com>",
  "",
  "Hello, this is a test email body.",
  "",
].join("\r\n");

describe("Canonicalization functions", () => {
  describe("canonicalizeHeaderRelaxed", () => {
    it("should lowercase header name and trim whitespace", () => {
      const result = canonicalizeHeaderRelaxed("Subject:  Hello   World  ");
      expect(result).toBe("subject:Hello World");
    });

    it("should unfold multi-line headers", () => {
      const result = canonicalizeHeaderRelaxed("Subject: Hello\r\n World");
      expect(result).toBe("subject:Hello World");
    });

    it("should reduce whitespace in value to single space", () => {
      const result = canonicalizeHeaderRelaxed("From:   user@example.com  ");
      expect(result).toBe("from:user@example.com");
    });
  });

  describe("canonicalizeHeaderSimple", () => {
    it("should return header unchanged", () => {
      const header = "Subject:  Hello   World  ";
      expect(canonicalizeHeaderSimple(header)).toBe(header);
    });
  });

  describe("canonicalizeBodyRelaxed", () => {
    it("should reduce whitespace and remove trailing empty lines", () => {
      const body = "Hello   World  \r\n\r\n\r\n";
      const result = canonicalizeBodyRelaxed(body);
      expect(result).toBe("Hello World\r\n");
    });

    it("should handle empty body", () => {
      const result = canonicalizeBodyRelaxed("");
      expect(result).toBe("\r\n");
    });
  });

  describe("canonicalizeBodySimple", () => {
    it("should ensure CRLF endings and single trailing CRLF", () => {
      const body = "Hello\nWorld\n\n\n";
      const result = canonicalizeBodySimple(body);
      expect(result).toBe("Hello\r\nWorld\r\n");
    });

    it("should return CRLF for empty body", () => {
      const result = canonicalizeBodySimple("");
      expect(result).toBe("\r\n");
    });

    it("should return CRLF for body that is just CRLF", () => {
      const result = canonicalizeBodySimple("\r\n");
      expect(result).toBe("\r\n");
    });
  });
});

describe("parseEmailParts", () => {
  it("should split headers and body", () => {
    const { headers, body } = parseEmailParts(TEST_EMAIL);
    expect(headers).toContain("From:");
    expect(body).toContain("Hello");
  });

  it("should handle email with no body", () => {
    const { headers, body } = parseEmailParts("From: test@example.com\r\nSubject: Test");
    expect(headers).toContain("From:");
    expect(body).toBe("");
  });
});

describe("parseHeaderLines", () => {
  it("should parse headers into name/value pairs", () => {
    const headers = "From: sender@example.com\r\nTo: recipient@test.com\r\nSubject: Test";
    const result = parseHeaderLines(headers);
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe("From");
    expect(result[0].value).toBe("sender@example.com");
  });

  it("should handle folded headers", () => {
    const headers = "Subject: This is a\r\n very long subject";
    const result = parseHeaderLines(headers);
    expect(result).toHaveLength(1);
    expect(result[0].value).toContain("very long subject");
  });
});

describe("DkimSigner", () => {
  it("should sign an email", () => {
    const signer = new DkimSigner(TEST_CONFIG);
    const result = signer.sign(TEST_EMAIL);

    expect(result.header).toContain("DKIM-Signature:");
    expect(result.domain).toBe("example.com");
    expect(result.selector).toBe("s1");
    expect(result.bodyHash).toBeTruthy();
    expect(result.signature).toBeTruthy();
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it("should sign email with simple canonicalization", () => {
    const signer = new DkimSigner({
      ...TEST_CONFIG,
      canonicalization: { header: "simple", body: "simple" },
    });
    const result = signer.sign(TEST_EMAIL);
    expect(result.header).toContain("DKIM-Signature:");
  });

  it("should include expiration when configured", () => {
    const signer = new DkimSigner({
      ...TEST_CONFIG,
      expirationSeconds: 3600,
    });
    const result = signer.sign(TEST_EMAIL);
    expect(result.expiration).toBeDefined();
    expect(result.expiration! - result.timestamp).toBe(3600);
  });

  it("should apply body length limit", () => {
    const signer = new DkimSigner({
      ...TEST_CONFIG,
      bodyLengthLimit: 10,
    });
    const result = signer.sign(TEST_EMAIL);
    expect(result.bodyHash).toBeTruthy();
  });

  it("should sign with custom headers list", () => {
    const signer = new DkimSigner({
      ...TEST_CONFIG,
      headersToSign: ["from", "to", "subject"],
    });
    const result = signer.sign(TEST_EMAIL);
    expect(result.header).toContain("DKIM-Signature:");
  });

  it("should signEmail and prepend header", () => {
    const signer = new DkimSigner(TEST_CONFIG);
    const signed = signer.signEmail(TEST_EMAIL);
    expect(signed).toContain("DKIM-Signature:");
    expect(signed).toContain(TEST_EMAIL);
  });

  it("should throw for invalid private key", () => {
    expect(() => new DkimSigner({
      ...TEST_CONFIG,
      privateKey: "invalid-key",
    })).toThrow("Invalid DKIM private key");
  });
});

describe("DkimKeyManager", () => {
  it("should add keys and set first as active", () => {
    const manager = new DkimKeyManager();
    const keyId = manager.addKey(TEST_CONFIG);
    expect(keyId).toBe("example.com:s1");
    expect(manager.getActiveKeyId()).toBe(keyId);
  });

  it("should sign with active key", () => {
    const manager = new DkimKeyManager();
    manager.addKey(TEST_CONFIG);
    const result = manager.sign(TEST_EMAIL);
    expect(result.domain).toBe("example.com");
  });

  it("should signEmail with active key", () => {
    const manager = new DkimKeyManager();
    manager.addKey(TEST_CONFIG);
    const signed = manager.signEmail(TEST_EMAIL);
    expect(signed).toContain("DKIM-Signature:");
  });

  it("should allow setting active key", () => {
    const manager = new DkimKeyManager();
    const key1 = manager.addKey(TEST_CONFIG);
    const key2 = manager.addKey({ ...TEST_CONFIG, selector: "s2", keyId: "key2" });
    manager.setActiveKey("key2");
    expect(manager.getActiveKeyId()).toBe("key2");
  });

  it("should throw when setting non-existent key as active", () => {
    const manager = new DkimKeyManager();
    expect(() => manager.setActiveKey("nonexistent")).toThrow("Key not found");
  });

  it("should remove a non-active key", () => {
    const manager = new DkimKeyManager();
    manager.addKey(TEST_CONFIG);
    const key2 = manager.addKey({ ...TEST_CONFIG, selector: "s2", keyId: "key2" });
    const removed = manager.removeKey("key2");
    expect(removed).toBe(true);
  });

  it("should switch active key when removing the active one", () => {
    const manager = new DkimKeyManager();
    const key1 = manager.addKey(TEST_CONFIG);
    manager.addKey({ ...TEST_CONFIG, selector: "s2", keyId: "key2" });
    manager.setActiveKey(key1);
    manager.removeKey(key1);
    expect(manager.getActiveKeyId()).toBe("key2");
  });

  it("should throw when removing the only key", () => {
    const manager = new DkimKeyManager();
    const key1 = manager.addKey(TEST_CONFIG);
    expect(() => manager.removeKey(key1)).toThrow("Cannot remove the only signing key");
  });

  it("should list all key IDs", () => {
    const manager = new DkimKeyManager();
    manager.addKey(TEST_CONFIG);
    manager.addKey({ ...TEST_CONFIG, selector: "s2", keyId: "key2" });
    expect(manager.listKeys()).toHaveLength(2);
  });

  it("should throw getActiveSigner when no keys", () => {
    const manager = new DkimKeyManager();
    expect(() => manager.getActiveSigner()).toThrow("No active signing key");
  });
});

describe("generateDkimDnsRecord", () => {
  it("should generate DNS record with public key", () => {
    const record = generateDkimDnsRecord(testPublicKey);
    expect(record).toContain("p=");
  });

  it("should include optional fields", () => {
    const record = generateDkimDnsRecord(testPublicKey, {
      version: "DKIM1",
      keyType: "rsa",
      hashAlgorithms: ["sha256"],
      serviceType: "email",
      flags: ["y", "s"],
    });
    expect(record).toContain("v=DKIM1");
    expect(record).toContain("k=rsa");
    expect(record).toContain("h=sha256");
    expect(record).toContain("s=email");
    expect(record).toContain("t=y:s");
    expect(record).toContain("p=");
  });
});

describe("parseDkimSignature", () => {
  it("should parse a DKIM-Signature header", () => {
    const header = "DKIM-Signature: v=1; a=rsa-sha256; d=example.com; s=selector; c=relaxed/relaxed; h=from:to:subject; bh=abc123; b=sig456; t=1704067200; x=1704153600; l=100";
    const result = parseDkimSignature(header);

    expect(result.version).toBe("1");
    expect(result.algorithm).toBe("rsa-sha256");
    expect(result.domain).toBe("example.com");
    expect(result.selector).toBe("selector");
    expect(result.canonicalization).toBe("relaxed/relaxed");
    expect(result.headers).toEqual(["from", "to", "subject"]);
    expect(result.bodyHash).toBe("abc123");
    expect(result.signature).toBe("sig456");
    expect(result.timestamp).toBe(1704067200);
    expect(result.expiration).toBe(1704153600);
    expect(result.bodyLength).toBe(100);
  });
});

describe("Factory functions", () => {
  it("createDkimSigner should return a DkimSigner", () => {
    const signer = createDkimSigner(TEST_CONFIG);
    expect(signer).toBeInstanceOf(DkimSigner);
  });

  it("createDkimKeyManager should return a DkimKeyManager", () => {
    const manager = createDkimKeyManager();
    expect(manager).toBeInstanceOf(DkimKeyManager);
  });
});
