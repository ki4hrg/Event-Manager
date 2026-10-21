-- Lets a super admin show diagnostics (inbox .eml, authentication results,
-- parser errors) to an account that isn't a super admin.
ALTER TABLE "User" ADD COLUMN "showDiagnostics" BOOLEAN NOT NULL DEFAULT false;
