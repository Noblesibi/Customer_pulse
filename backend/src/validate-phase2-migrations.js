import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

const migrationPath = path.join(backendRoot, 'migrations', '002_phase2_teams_governance.sql');
const schemaPath = path.join(backendRoot, 'schema.postgres.sql');
const postgresConfigPath = path.join(backendRoot, 'src', 'config', 'postgres.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

console.log('\n================================================================');
console.log('🧪 PHASE 2 POSTGRESQL MIGRATION VALIDATION (STATIC / SAFE)');
console.log('================================================================\n');

const migrationSql = fs.readFileSync(migrationPath, 'utf8');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
const postgresJs = fs.readFileSync(postgresConfigPath, 'utf8');

const requiredTeamsColumns = [
  'onlineMeetingId',
  'organizerEmployeeId',
  'relatedContactIds',
  'aiSummary',
  'keyTopics',
  'keyDecisions',
  'actionItems',
  'customerRequirements',
  'commitments',
  'risksIdentified',
  'sentiment',
  'aiStatus',
  'aiError',
  'externalAttendees',
  'internalAttendees',
  'transcriptStatus',
  'hasRecording',
  'durationSeconds',
  'wordCount',
];

for (const col of requiredTeamsColumns) {
  assert(
    migrationSql.includes(`"${col}"`),
    `002_phase2_teams_governance.sql defines TeamsMeetings."${col}"`
  );
  assert(
    schemaSql.includes(`"${col}"`),
    `schema.postgres.sql defines TeamsMeetings."${col}"`
  );
  assert(
    postgresJs.includes(`"${col}"`),
    `postgres.js migration defines TeamsMeetings."${col}"`
  );
}

const requiredTables = [
  'AuthorizedOrganizers',
  'OrganizerOwnershipHistory',
  'OrganizerPolicySync',
  'OrganizerApprovalHistory',
  'SyncCheckpoints',
  'CommunicationReviewQueue',
  'AiRecommendations',
  'UserIntegrations',
  'SyncHistory',
];

for (const tbl of requiredTables) {
  assert(
    migrationSql.includes(`CREATE TABLE IF NOT EXISTS "${tbl}"`),
    `002_phase2_teams_governance.sql creates "${tbl}" idempotently`
  );
  assert(
    postgresJs.includes(`CREATE TABLE IF NOT EXISTS "${tbl}"`),
    `postgres.js creates "${tbl}" idempotently`
  );
}

// Verify no duplicate AuthorizedMailboxes table remains in schema or migration
assert(
  !migrationSql.includes('"AuthorizedMailboxes"') && !schemaSql.includes('"AuthorizedMailboxes"'),
  'No duplicate AuthorizedMailboxes table alongside AuthorizedOrganizers'
);

// Strip SQL comments before parsing statements & checking destructive SQL
const strippedSql = migrationSql
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/--.*$/gm, '');

const destructivePatterns = [
  /\bDROP\s+TABLE\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bUPDATE\s+"Users"\b/i,
  /\bALTER\s+TABLE\s+"Users"/i,
];
for (const pat of destructivePatterns) {
  assert(
    !pat.test(strippedSql),
    `002_phase2_teams_governance.sql contains no destructive SQL ${pat}`
  );
}

const statements = strippedSql
  .split(';')
  .map(s => s.trim())
  .filter(Boolean);

assert(statements.length >= 25, `Parsed ${statements.length} SQL migration statements`);

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  if (/^(BEGIN|COMMIT)$/i.test(stmt)) continue;
  const openCount = (stmt.match(/\(/g) || []).length;
  const closeCount = (stmt.match(/\)/g) || []).length;
  assert(
    openCount === closeCount,
    `Statement #${i + 1} has balanced parentheses (${openCount}/${closeCount})`
  );
}

for (const key of [
  'authorizedorganizers',
  'organizerownershiphistory',
  'organizerpolicysync',
  'organizerapprovalhistory',
  'synccheckpoints',
  'communicationreviewqueue',
  'airecommendations',
]) {
  assert(postgresJs.includes(`${key}:`), `postgres.js maps ${key}`);
}

console.log(`\nSUMMARY: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
