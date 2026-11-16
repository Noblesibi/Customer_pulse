-- Set NDA Head as Account Owner of ABC Bank (as shown in Admin's view)
UPDATE "Accounts" SET "ownerId" = 'mock-nda-head-uid', "ownerName" = 'NDA Head' WHERE "accountId" = 'acc-abc';

-- Confirm all accounts and their owners
SELECT "accountId", "companyName", "ownerId", "ownerName" FROM "Accounts" ORDER BY "companyName";
