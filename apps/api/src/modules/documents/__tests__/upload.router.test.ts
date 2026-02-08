/**
 * Upload Router Tests - covers upload mutation and getUploadStatus query
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

const mockOrchestrator = {
  ingestFile: vi.fn(),
};

const mockRepository = {
  findById: vi.fn(),
};

const mockContainer = {
  get: vi.fn((key: string) => {
    if (key === "IngestionOrchestrator") return mockOrchestrator;
    if (key === "CaseDocumentRepository") return mockRepository;
    return null;
  }),
};

vi.mock("@intelliflow/application", () => ({
  IngestionOrchestrator: class {},
}));

import { uploadRouter } from "../upload.router";

const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const DOC_ID = "doc-123";

function createCtx() {
  return {
    prisma: {} as any,
    user: { userId: USER_ID, tenantId: TENANT_ID, email: "t@t.com", role: "ADMIN" },
    container: mockContainer,
  } as any;
}

describe("uploadRouter", () => {
  let caller: ReturnType<typeof uploadRouter.createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    caller = uploadRouter.createCaller(createCtx());
    mockOrchestrator.ingestFile.mockResolvedValue({ success: true, documentId: DOC_ID, duplicate: false });
    mockRepository.findById.mockResolvedValue(null);
  });

  describe("upload", () => {
    const validInput = {
      filename: "report.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("fake pdf content").toString("base64"),
    };

    it("should upload file successfully", async () => {
      const result = await caller.upload(validInput);
      expect(result.documentId).toBe(DOC_ID);
      expect(result.duplicate).toBe(false);
      expect(mockOrchestrator.ingestFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ tenantId: TENANT_ID, filename: "report.pdf", uploadedBy: USER_ID }),
      );
    });

    it("should pass relatedCaseId and relatedContactId", async () => {
      await caller.upload({ ...validInput, relatedCaseId: "case-1", relatedContactId: "contact-1" });
      expect(mockOrchestrator.ingestFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ relatedCaseId: "case-1", relatedContactId: "contact-1" }),
      );
    });

    it("should return duplicate flag", async () => {
      mockOrchestrator.ingestFile.mockResolvedValue({ success: true, documentId: DOC_ID, duplicate: true });
      const result = await caller.upload(validInput);
      expect(result.duplicate).toBe(true);
    });

    it("should throw INTERNAL_SERVER_ERROR on orchestrator failure with error message", async () => {
      mockOrchestrator.ingestFile.mockResolvedValue({ success: false, error: "Virus detected" });
      await expect(caller.upload(validInput)).rejects.toThrow("Virus detected");
    });

    it("should throw INTERNAL_SERVER_ERROR on orchestrator failure without error message", async () => {
      mockOrchestrator.ingestFile.mockResolvedValue({ success: false });
      await expect(caller.upload(validInput)).rejects.toThrow("Upload failed");
    });

    it("should throw BAD_REQUEST on invalid base64 content", async () => {
      // Buffer.from with base64 does not throw for invalid base64 - it just decodes what it can.
      // The router catches the error from Buffer.from if it throws.
      // We test the path by mocking Buffer.from to throw.
      const origFrom = Buffer.from.bind(Buffer);
      const mockBufFrom = vi.fn().mockImplementation((value: string, encoding?: string) => {
        if (encoding === "base64" && value === "!!!INVALID!!!") throw new Error("bad base64");
        return encoding ? origFrom(value, encoding as BufferEncoding) : origFrom(value);
      });
      (globalThis as any).Buffer.from = mockBufFrom;
      try {
        await expect(caller.upload({ ...validInput, content: "!!!INVALID!!!" })).rejects.toThrow("Invalid base64");
      } finally {
        (globalThis as any).Buffer.from = origFrom;
      }
    });
  });

  describe("getUploadStatus", () => {
    it("should return document status when found", async () => {
      mockRepository.findById.mockResolvedValue({
        id: DOC_ID,
        tenantId: TENANT_ID,
        metadata: { title: "report.pdf" },
        status: "PROCESSED",
        createdAt: new Date(),
      });
      const result = await caller.getUploadStatus({ documentId: DOC_ID });
      expect(result.id).toBe(DOC_ID);
      expect(result.filename).toBe("report.pdf");
      expect(result.status).toBe("PROCESSED");
    });

    it("should throw NOT_FOUND when document missing", async () => {
      mockRepository.findById.mockResolvedValue(null);
      await expect(caller.getUploadStatus({ documentId: "nope" })).rejects.toThrow("Document not found");
    });

    it("should throw FORBIDDEN when tenant mismatch", async () => {
      mockRepository.findById.mockResolvedValue({
        id: DOC_ID,
        tenantId: "other-tenant",
        metadata: { title: "x" },
        status: "READY",
        createdAt: new Date(),
      });
      await expect(caller.getUploadStatus({ documentId: DOC_ID })).rejects.toThrow("Access denied");
    });
  });
});
