-- Charge scopes for a charge per room (once for the stay) and a one-time
-- charge for the group (#175).
ALTER TYPE "HotelChargeScope" ADD VALUE 'PER_ROOM';
ALTER TYPE "HotelChargeScope" ADD VALUE 'ONE_TIME';
