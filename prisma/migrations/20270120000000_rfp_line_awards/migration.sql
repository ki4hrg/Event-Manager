-- Split RFP awards across vendors (#164): each vendor RFP line item records
-- the accepted quote that won it.
-- AlterTable
ALTER TABLE "RfpLineItem" ADD COLUMN     "awardedQuoteId" TEXT;

-- CreateIndex
CREATE INDEX "RfpLineItem_awardedQuoteId_idx" ON "RfpLineItem"("awardedQuoteId");

-- AddForeignKey
ALTER TABLE "RfpLineItem" ADD CONSTRAINT "RfpLineItem_awardedQuoteId_fkey" FOREIGN KEY ("awardedQuoteId") REFERENCES "VendorQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill awards made before this: a line goes to the one accepted quote
-- that priced it; a line no accepted quote priced goes to the RFP's only
-- accepted quote. Anything ambiguous stays open for the user to award.
UPDATE "RfpLineItem" li
SET "awardedQuoteId" = COALESCE(
  (SELECT MIN(q."id") FROM "VendorQuote" q
    WHERE q."rfpId" = li."rfpId" AND q."status" = 'ACCEPTED'
      AND EXISTS (SELECT 1 FROM "VendorQuoteLine" ql WHERE ql."quoteId" = q."id" AND ql."rfpLineItemId" = li."id")
    HAVING COUNT(*) = 1),
  (SELECT MIN(q."id") FROM "VendorQuote" q
    WHERE q."rfpId" = li."rfpId" AND q."status" = 'ACCEPTED'
      AND NOT EXISTS (
        SELECT 1 FROM "VendorQuote" q2 JOIN "VendorQuoteLine" ql ON ql."quoteId" = q2."id"
        WHERE q2."rfpId" = li."rfpId" AND q2."status" = 'ACCEPTED' AND ql."rfpLineItemId" = li."id")
    HAVING COUNT(*) = 1)
)
WHERE EXISTS (SELECT 1 FROM "VendorQuote" q WHERE q."rfpId" = li."rfpId" AND q."status" = 'ACCEPTED');
