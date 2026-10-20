-- A function's default set-up (setup_type label), for before any setup order
-- exists; new setup orders and RFP function-space rows start from it.

-- AlterTable
ALTER TABLE "Function" ADD COLUMN     "defaultSetup" TEXT;

