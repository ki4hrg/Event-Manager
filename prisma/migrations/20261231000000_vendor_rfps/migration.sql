-- Vendor RFPs (docs/proposals/vendor-rfps.md): AV / catering / print / other
-- kinds, line items copied from orders, and vendor quotes answering them.

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('RECEIVED', 'ACCEPTED', 'DECLINED');

-- AlterEnum
ALTER TYPE "RfpKind" ADD VALUE 'AV';
ALTER TYPE "RfpKind" ADD VALUE 'CATERING';
ALTER TYPE "RfpKind" ADD VALUE 'PRINT';
ALTER TYPE "RfpKind" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "FileUpload" ADD COLUMN     "vendorQuoteId" TEXT;

-- AlterTable
ALTER TABLE "Rfp" ADD COLUMN     "service" TEXT;

-- CreateTable
CREATE TABLE "RfpLineItem" (
    "id" TEXT NOT NULL,
    "rfpId" TEXT NOT NULL,
    "group" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER,
    "unit" TEXT,
    "day" DATE,
    "endDay" DATE,
    "startTime" TEXT,
    "endTime" TEXT,
    "notes" TEXT,
    "avOrderId" TEXT,
    "cateringOrderId" TEXT,
    "printOrderId" TEXT,
    "equipmentItemId" TEXT,
    "printItemId" TEXT,
    "cateringLineItemId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RfpLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorQuote" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "rfpId" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'RECEIVED',
    "reference" TEXT,
    "submittedOn" DATE,
    "validUntil" DATE,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "serviceCharge" DECIMAL(10,2),
    "tax" DECIMAL(10,2),
    "otherFees" DECIMAL(10,2),
    "depositAmount" DECIMAL(10,2),
    "depositDue" DATE,
    "cancellationTerms" TEXT,
    "notes" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorQuoteLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "rfpLineItemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2),
    "unitPrice" DECIMAL(10,2),
    "amount" DECIMAL(10,2),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VendorQuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RfpLineItem_rfpId_idx" ON "RfpLineItem"("rfpId");

-- CreateIndex
CREATE INDEX "RfpLineItem_avOrderId_idx" ON "RfpLineItem"("avOrderId");

-- CreateIndex
CREATE INDEX "RfpLineItem_cateringOrderId_idx" ON "RfpLineItem"("cateringOrderId");

-- CreateIndex
CREATE INDEX "RfpLineItem_printOrderId_idx" ON "RfpLineItem"("printOrderId");

-- CreateIndex
CREATE INDEX "RfpLineItem_equipmentItemId_idx" ON "RfpLineItem"("equipmentItemId");

-- CreateIndex
CREATE INDEX "RfpLineItem_printItemId_idx" ON "RfpLineItem"("printItemId");

-- CreateIndex
CREATE INDEX "RfpLineItem_cateringLineItemId_idx" ON "RfpLineItem"("cateringLineItemId");

-- CreateIndex
CREATE INDEX "VendorQuote_eventId_idx" ON "VendorQuote"("eventId");

-- CreateIndex
CREATE INDEX "VendorQuote_vendorId_idx" ON "VendorQuote"("vendorId");

-- CreateIndex
CREATE INDEX "VendorQuote_rfpId_idx" ON "VendorQuote"("rfpId");

-- CreateIndex
CREATE INDEX "VendorQuote_updatedById_idx" ON "VendorQuote"("updatedById");

-- CreateIndex
CREATE INDEX "VendorQuoteLine_quoteId_idx" ON "VendorQuoteLine"("quoteId");

-- CreateIndex
CREATE INDEX "VendorQuoteLine_rfpLineItemId_idx" ON "VendorQuoteLine"("rfpLineItemId");

-- CreateIndex
CREATE INDEX "FileUpload_vendorQuoteId_idx" ON "FileUpload"("vendorQuoteId");

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_vendorQuoteId_fkey" FOREIGN KEY ("vendorQuoteId") REFERENCES "VendorQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpLineItem" ADD CONSTRAINT "RfpLineItem_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpLineItem" ADD CONSTRAINT "RfpLineItem_avOrderId_fkey" FOREIGN KEY ("avOrderId") REFERENCES "AVOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpLineItem" ADD CONSTRAINT "RfpLineItem_cateringOrderId_fkey" FOREIGN KEY ("cateringOrderId") REFERENCES "BEO"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpLineItem" ADD CONSTRAINT "RfpLineItem_printOrderId_fkey" FOREIGN KEY ("printOrderId") REFERENCES "PrintOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpLineItem" ADD CONSTRAINT "RfpLineItem_equipmentItemId_fkey" FOREIGN KEY ("equipmentItemId") REFERENCES "EquipmentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpLineItem" ADD CONSTRAINT "RfpLineItem_printItemId_fkey" FOREIGN KEY ("printItemId") REFERENCES "PrintItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpLineItem" ADD CONSTRAINT "RfpLineItem_cateringLineItemId_fkey" FOREIGN KEY ("cateringLineItemId") REFERENCES "BEOLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuote" ADD CONSTRAINT "VendorQuote_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuote" ADD CONSTRAINT "VendorQuote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuote" ADD CONSTRAINT "VendorQuote_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuote" ADD CONSTRAINT "VendorQuote_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuoteLine" ADD CONSTRAINT "VendorQuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "VendorQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuoteLine" ADD CONSTRAINT "VendorQuoteLine_rfpLineItemId_fkey" FOREIGN KEY ("rfpLineItemId") REFERENCES "RfpLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Option lists for vendor RFPs, for tenants that predate them.
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", v.category, v.label, v.sort, CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES
  ('rfp_service', 'Transportation', 0), ('rfp_service', 'DMC', 1), ('rfp_service', 'Security', 2),
  ('rfp_service', 'Staffing', 3), ('rfp_service', 'Photography', 4),
  ('rfp_term', 'Deposit schedule', 0), ('rfp_term', 'Payment terms', 1), ('rfp_term', 'Cancellation', 2),
  ('rfp_term', 'Overtime rate', 3), ('rfp_term', 'Delivery window', 4), ('rfp_term', 'Certificate of insurance', 5),
  ('rfp_term', 'Price hold', 6)
) AS v(category, label, sort)
WHERE NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = v.category AND lower(o."label") = lower(v.label))
ON CONFLICT DO NOTHING;
