-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN     "two_factor_reminder_dismissed_at" TIMESTAMPTZ(6),
ADD COLUMN     "two_factor_reminders_sent" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
