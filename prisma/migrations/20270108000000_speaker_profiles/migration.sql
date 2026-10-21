-- AlterEnum
ALTER TYPE "FormType" ADD VALUE 'SPEAKER_PROFILE';

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "headshotFileId" TEXT,
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "pronouns" TEXT,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "FileUpload" ADD COLUMN     "contactId" TEXT;

-- CreateTable
CREATE TABLE "SpeakerProfile" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "arrivalAt" TIMESTAMP(3),
    "departureAt" TIMESTAMP(3),
    "travelNotes" TEXT,
    "hotel" TEXT,
    "dietary" TEXT,
    "avNeeds" TEXT,
    "shirtSize" TEXT,
    "notes" TEXT,
    "internalNotes" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpeakerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpeakerProfile_contactId_idx" ON "SpeakerProfile"("contactId");

-- CreateIndex
CREATE INDEX "SpeakerProfile_updatedById_idx" ON "SpeakerProfile"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "SpeakerProfile_eventId_contactId_key" ON "SpeakerProfile"("eventId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_headshotFileId_key" ON "Contact"("headshotFileId");

-- CreateIndex
CREATE INDEX "FileUpload_contactId_idx" ON "FileUpload"("contactId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_headshotFileId_fkey" FOREIGN KEY ("headshotFileId") REFERENCES "FileUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerProfile" ADD CONSTRAINT "SpeakerProfile_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerProfile" ADD CONSTRAINT "SpeakerProfile_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerProfile" ADD CONSTRAINT "SpeakerProfile_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

