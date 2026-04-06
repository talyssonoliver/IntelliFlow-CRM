-- AlterTable
ALTER TABLE "notification_preferences" ADD COLUMN "quietHoursDays" INTEGER[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6];
