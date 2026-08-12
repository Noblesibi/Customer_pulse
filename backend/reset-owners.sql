-- Reset acc-1 (Acme Corporation) owner back to Admin User
UPDATE "Accounts" SET "ownerId" = 'mock-admin-uid', "ownerName" = 'Admin User' WHERE "accountId" = 'acc-1';

-- Verify
SELECT "accountId", "companyName", "ownerId", "ownerName" FROM "Accounts" ORDER BY "accountId";
