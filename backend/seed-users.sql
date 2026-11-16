-- Cleanup / verify mock users are removed
DELETE FROM "Users" WHERE uid IN (
  'mock-exec-uid',
  'mock-manager-uid',
  'mock-employee-uid',
  'mock-nazneen-ceo-uid',
  'mock-finance-head-uid',
  'mock-global-hr-head-uid',
  'mock-itg-head-uid',
  'mock-nda-head-uid',
  'mock-tc-head-uid',
  'mock-quality-head-uid'
) OR email IN (
  'executive@pulse.com',
  'manager@pulse.com',
  'employee@pulse.com',
  'nj@gmail.com',
  'financehead@gmail.com',
  'globalhrhead@gmail.com',
  'itghead@gmail.com',
  'ndahead@gmail.com',
  'tchead@gmail.com',
  'qualityhead@gmail.com'
);

-- Verify final count
SELECT count(*) as total_users FROM "Users";
