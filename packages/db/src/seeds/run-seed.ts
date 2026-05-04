/**
 * CLI runner for the archangel seed.
 *
 *   DATABASE_URL=... pnpm --filter @paperclipai/db tsx src/seeds/run-seed.ts <companyId>
 *   COMPANY_ID=... DATABASE_URL=... pnpm --filter @paperclipai/db tsx src/seeds/run-seed.ts
 *
 * The script is idempotent: re-running it is safe and will skip archangels
 * that already exist for the given company.
 */
import { createDb } from "../client.js";
import { seedArchangels } from "./archangels.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[seed] DATABASE_URL is required");
  process.exit(1);
}

const companyId = process.argv[2] ?? process.env.COMPANY_ID ?? "";
if (!companyId) {
  console.error(
    "[seed] companyId is required. Pass as the first CLI arg or set COMPANY_ID env var.",
  );
  console.error(
    "[seed] Usage: tsx src/seeds/run-seed.ts <companyId>",
  );
  process.exit(1);
}

const db = createDb(url);

console.log(`[seed] Seeding archangels for company ${companyId}...`);

try {
  const result = await seedArchangels(db, companyId);
  console.log(JSON.stringify({ ok: true, companyId, ...result }, null, 2));
  process.exit(0);
} catch (err) {
  console.error(
    "[seed] failed:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
}
