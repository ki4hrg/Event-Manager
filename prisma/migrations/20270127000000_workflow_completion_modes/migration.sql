-- CreateEnum
CREATE TYPE "WorkflowCompletionMode" AS ENUM ('MANUAL', 'AUTO', 'PROMPT');

-- AlterTable
ALTER TABLE "WorkflowStep" ADD COLUMN     "completionMode" "WorkflowCompletionMode" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "WorkflowChecklistItem" DROP COLUMN "computedKey",
ADD COLUMN     "required" BOOLEAN NOT NULL DEFAULT true;
