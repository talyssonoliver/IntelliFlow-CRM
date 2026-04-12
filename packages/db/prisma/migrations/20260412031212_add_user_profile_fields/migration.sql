-- Add profile and OAuth metadata fields to users table
-- Phase 2 of profile enhancement: capture more from social login + persist user-editable profile fields

-- AlterTable: name fields from OAuth
ALTER TABLE "users" ADD COLUMN "givenName" TEXT;
ALTER TABLE "users" ADD COLUMN "familyName" TEXT;

-- AlterTable: locale (default to en-US for existing users)
ALTER TABLE "users" ADD COLUMN "locale" TEXT DEFAULT 'en-US';

-- AlterTable: profile contact info
ALTER TABLE "users" ADD COLUMN "phone" TEXT;
ALTER TABLE "users" ADD COLUMN "company" TEXT;
ALTER TABLE "users" ADD COLUMN "department" TEXT;
ALTER TABLE "users" ADD COLUMN "location" TEXT;
ALTER TABLE "users" ADD COLUMN "website" TEXT;
ALTER TABLE "users" ADD COLUMN "bio" TEXT;

-- AlterTable: OAuth / sign-in metadata
ALTER TABLE "users" ADD COLUMN "provider" TEXT;
ALTER TABLE "users" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "lastSignInAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "signInCount" INTEGER NOT NULL DEFAULT 0;
