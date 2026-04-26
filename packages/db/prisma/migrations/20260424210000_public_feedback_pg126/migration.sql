-- PG-126 — Anonymous public-site feedback captured BEFORE signup.
-- Tenant-agnostic: submissions originate from unauthenticated visitors.
-- Rate-limited at the tRPC router layer via hashed-IP LRU (no raw IPs).

CREATE TABLE "public_feedback" (
    "id"         TEXT NOT NULL,
    "rating"     INTEGER NOT NULL,
    "comment"    TEXT,
    "email"      TEXT,
    "source"     TEXT NOT NULL,
    "userAgent"  TEXT,
    "ipHash"     TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "public_feedback_createdAt_idx" ON "public_feedback"("createdAt");
CREATE INDEX "public_feedback_rating_idx"    ON "public_feedback"("rating");
