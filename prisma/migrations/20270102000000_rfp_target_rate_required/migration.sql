-- A block's target rate can be a ceiling ("must be no more than") or a target.
ALTER TABLE "RfpHotelBlock" ADD COLUMN "targetRateRequired" BOOLEAN NOT NULL DEFAULT false;
