/*
  Warnings:

  - Added the required column `updatedAt` to the `SlackToken` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SlackToken" ADD COLUMN     "bot_user_id" TEXT,
ADD COLUMN     "scope" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "user_id" TEXT;

-- CreateTable
CREATE TABLE "SlackChannel" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "topic" TEXT,
    "purpose" TEXT,
    "member_count" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackMessage" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT,
    "text" TEXT,
    "thread_ts" TEXT,
    "message_type" TEXT NOT NULL DEFAULT 'message',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slack_ts" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlackChannel_channel_id_team_id_key" ON "SlackChannel"("channel_id", "team_id");

-- CreateIndex
CREATE INDEX "SlackMessage_team_id_channel_id_slack_ts_idx" ON "SlackMessage"("team_id", "channel_id", "slack_ts");

-- CreateIndex
CREATE UNIQUE INDEX "SlackMessage_message_id_channel_id_team_id_key" ON "SlackMessage"("message_id", "channel_id", "team_id");
