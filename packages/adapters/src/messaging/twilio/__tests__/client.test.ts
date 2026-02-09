import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TwilioConfig } from "../client";

const mockCreate = vi.fn();
const mockFetch = vi.fn();
const mockList = vi.fn();
const mockLookupFetch = vi.fn();
const mockBalanceFetch = vi.fn();

vi.mock("twilio", () => {
  function FakeTwilio() {}
  return { Twilio: FakeTwilio };
});

describe("TwilioClient", () => {
  const validConfig: TwilioConfig = {
    accountSid: "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    authToken: "test-auth-token-placeholder",
    fromNumber: "+15551234567",
    statusCallbackUrl: "https://example.com/status",
    messagingServiceSid: "MG1234567890",
  };

  beforeEach(async () => {
    mockCreate.mockReset();
    mockFetch.mockReset();
    mockList.mockReset();
    mockLookupFetch.mockReset();
    mockBalanceFetch.mockReset();

    const twilio = await import("twilio");
    const impl = function(this: any) {
      this.messages = Object.assign(
        (sid: string) => ({ fetch: mockFetch }),
        { create: mockCreate, list: mockList }
      );
      this.lookups = { v2: { phoneNumbers: () => ({ fetch: mockLookupFetch }) } };
      this.api = { v2010: { accounts: () => ({ balance: { fetch: mockBalanceFetch } }) } };
    };
    Object.defineProperty(twilio, "Twilio", { value: impl, writable: true, configurable: true });
  });

  async function getClient() {
    const { TwilioClient } = await import("../client");
    return new TwilioClient(validConfig);
  }

  describe("constructor", () => {
    it("creates Twilio client with config", async () => {
      await getClient();
    });
  });

  describe("sendSMS", () => {
    it("sends message and returns response", async () => {
      mockCreate.mockResolvedValue({
        sid: "SM123", status: "queued", to: "+15559876543", from: "+15551234567",
        body: "Hello", numSegments: "1", price: null, priceUnit: null,
        dateCreated: new Date("2025-01-01"), errorCode: null, errorMessage: null,
      });
      const client = await getClient();
      const r = await client.sendSMS({ to: "+15559876543", body: "Hello" });
      expect(r.sid).toBe("SM123");
      expect(r.status).toBe("queued");
      expect(r.numSegments).toBe(1);
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        to: "+15559876543", body: "Hello", from: validConfig.fromNumber,
      }));
    });

    it("uses custom from number", async () => {
      mockCreate.mockResolvedValue({
        sid: "SM124", status: "queued", to: "+15559876543", from: "+15550001111",
        body: "Hi", numSegments: "1", price: "0.01", priceUnit: "USD",
        dateCreated: new Date(), errorCode: 30001, errorMessage: "Queue full",
      });
      const client = await getClient();
      const r = await client.sendSMS({ to: "+15559876543", body: "Hi", from: "+15550001111" });
      expect(r.from).toBe("+15550001111");
      expect(r.price).toBe("0.01");
      expect(r.errorCode).toBe("30001");
    });
  });

  describe("getMessageStatus", () => {
    it("fetches message status", async () => {
      mockFetch.mockResolvedValue({
        sid: "SM123", status: "delivered",
        errorCode: null, errorMessage: null, dateUpdated: new Date("2025-01-02"),
      });
      const client = await getClient();
      const r = await client.getMessageStatus("SM123");
      expect(r.sid).toBe("SM123");
      expect(r.status).toBe("delivered");
    });
  });

  describe("listMessages", () => {
    it("lists messages with defaults", async () => {
      mockList.mockResolvedValue([{
        sid: "SM1", status: "sent", to: "+1555", from: "+1444",
        body: "msg", numSegments: "1", price: null, priceUnit: null,
        dateCreated: new Date(), errorCode: null, errorMessage: null,
      }]);
      const client = await getClient();
      const r = await client.listMessages();
      expect(r).toHaveLength(1);
      expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
    });

    it("passes filter options", async () => {
      mockList.mockResolvedValue([]);
      const client = await getClient();
      await client.listMessages({ to: "+1555", limit: 5 });
      expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ to: "+1555", limit: 5 }));
    });
  });

  describe("lookupPhoneNumber", () => {
    it("returns valid lookup", async () => {
      mockLookupFetch.mockResolvedValue({
        valid: true, phoneNumber: "+15551234567", countryCode: "US",
        callerName: { callerName: "Test", callerType: "CONSUMER" },
      });
      const client = await getClient();
      const r = await client.lookupPhoneNumber("+15551234567");
      expect(r.valid).toBe(true);
      expect(r.carrier?.name).toBe("Test");
    });

    it("returns invalid on error", async () => {
      mockLookupFetch.mockRejectedValue(new Error("not found"));
      const client = await getClient();
      const r = await client.lookupPhoneNumber("+000");
      expect(r.valid).toBe(false);
    });
  });

  describe("getAccountBalance", () => {
    it("returns balance", async () => {
      mockBalanceFetch.mockResolvedValue({ balance: "42.50", currency: "USD" });
      const client = await getClient();
      const r = await client.getAccountBalance();
      expect(r.balance).toBe("42.50");
      expect(r.currency).toBe("USD");
    });

    it("returns defaults on error", async () => {
      mockBalanceFetch.mockRejectedValue(new Error("unavailable"));
      const client = await getClient();
      const r = await client.getAccountBalance();
      expect(r.balance).toBe("0");
      expect(r.currency).toBe("USD");
    });
  });
});

describe("TwilioConfigSchema", () => {
  it("validates config", async () => {
    const { TwilioConfigSchema } = await import("../client");
    const r = TwilioConfigSchema.safeParse({
      accountSid: "AC123", authToken: "token", fromNumber: "+15551234567",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty accountSid", async () => {
    const { TwilioConfigSchema } = await import("../client");
    const r = TwilioConfigSchema.safeParse({ accountSid: "", authToken: "t", fromNumber: "+1555" });
    expect(r.success).toBe(false);
  });
});
