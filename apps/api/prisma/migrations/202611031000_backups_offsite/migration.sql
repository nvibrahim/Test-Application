-- AlterTable
ALTER TABLE "backups" ADD COLUMN     "offsite_copied_at" TIMESTAMPTZ(6),
ADD COLUMN     "offsite_error" TEXT,
ADD COLUMN     "row_counts" JSONB;
