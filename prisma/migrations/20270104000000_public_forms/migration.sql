-- CreateEnum
CREATE TYPE "FormType" AS ENUM ('FUNCTION_REVIEW');

-- CreateEnum
CREATE TYPE "FormSubmissionState" AS ENUM ('DRAFT', 'SUBMITTED', 'APPLIED', 'REJECTED', 'WITHDRAWN');

-- AlterEnum
ALTER TYPE "PermissionResource" ADD VALUE 'FORMS';

-- AlterEnum
ALTER TYPE "StatusModelType" ADD VALUE 'FORM_SUBMISSION';

-- AlterTable
ALTER TABLE "FileUpload" ADD COLUMN     "formSubmissionId" TEXT;

-- CreateTable
CREATE TABLE "FormLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "formType" "FormType" NOT NULL,
    "functionId" TEXT,
    "contactId" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "label" TEXT,
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "workflowTemplateId" TEXT,
    "dueAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "maxSubmissions" INTEGER,
    "submittedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "lastAccessedAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSubmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "formLinkId" TEXT NOT NULL,
    "formType" "FormType" NOT NULL,
    "state" "FormSubmissionState" NOT NULL DEFAULT 'DRAFT',
    "draftKey" TEXT NOT NULL,
    "status" "EntityStatus",
    "substatus" TEXT,
    "requiredTemplateId" TEXT,
    "submitterName" TEXT,
    "submitterEmail" TEXT,
    "submitterOrg" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "baseline" JSONB,
    "applyResult" JSONB,
    "reviewNotes" TEXT,
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormLink_token_key" ON "FormLink"("token");

-- CreateIndex
CREATE INDEX "FormLink_tenantId_idx" ON "FormLink"("tenantId");

-- CreateIndex
CREATE INDEX "FormLink_eventId_idx" ON "FormLink"("eventId");

-- CreateIndex
CREATE INDEX "FormLink_functionId_idx" ON "FormLink"("functionId");

-- CreateIndex
CREATE INDEX "FormLink_contactId_idx" ON "FormLink"("contactId");

-- CreateIndex
CREATE INDEX "FormLink_workflowTemplateId_idx" ON "FormLink"("workflowTemplateId");

-- CreateIndex
CREATE INDEX "FormLink_createdById_idx" ON "FormLink"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "FormSubmission_draftKey_key" ON "FormSubmission"("draftKey");

-- CreateIndex
CREATE INDEX "FormSubmission_tenantId_idx" ON "FormSubmission"("tenantId");

-- CreateIndex
CREATE INDEX "FormSubmission_eventId_state_idx" ON "FormSubmission"("eventId", "state");

-- CreateIndex
CREATE INDEX "FormSubmission_formLinkId_createdAt_idx" ON "FormSubmission"("formLinkId", "createdAt");

-- CreateIndex
CREATE INDEX "FormSubmission_handledById_idx" ON "FormSubmission"("handledById");

-- CreateIndex
CREATE INDEX "FileUpload_formSubmissionId_idx" ON "FileUpload"("formSubmissionId");

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_formSubmissionId_fkey" FOREIGN KEY ("formSubmissionId") REFERENCES "FormSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormLink" ADD CONSTRAINT "FormLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormLink" ADD CONSTRAINT "FormLink_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormLink" ADD CONSTRAINT "FormLink_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "Function"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormLink" ADD CONSTRAINT "FormLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormLink" ADD CONSTRAINT "FormLink_workflowTemplateId_fkey" FOREIGN KEY ("workflowTemplateId") REFERENCES "WorkflowTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormLink" ADD CONSTRAINT "FormLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_formLinkId_fkey" FOREIGN KEY ("formLinkId") REFERENCES "FormLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
