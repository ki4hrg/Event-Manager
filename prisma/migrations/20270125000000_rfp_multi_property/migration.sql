-- A hotel RFP awarded to several properties (a citywide, a mix of price points).
ALTER TABLE "Rfp" ADD COLUMN "multiProperty" BOOLEAN NOT NULL DEFAULT false;
