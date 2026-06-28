/** Re-run Senate LDA lobbying enrichment on existing politicians.json */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildLobbyingDataForPoliticians } from "./lda-sync.mjs";
import { applyScoreRecalcToAll } from "./score-algorithm.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CACHE = join(ROOT, "scripts", "cache");
const OUT_FILE = join(ROOT, "src", "data", "politicians.json");

const data = JSON.parse(readFileSync(OUT_FILE, "utf8"));
const ldaSource = "LDA.gov API — registered lobbying organizations (lda.gov)";
if (!data.meta.sources.includes(ldaSource)) {
  data.meta.sources.push(ldaSource);
}

console.log(`Enriching ${data.politicians.length} politicians with LDA data...`);
const enriched = await buildLobbyingDataForPoliticians(data.politicians, CACHE);
const withOrgs = enriched.filter((p) => (p.lobbyingOrganizations || []).length > 0).length;

data.politicians = applyScoreRecalcToAll(enriched);
const now = new Date().toISOString();
data.meta.syncedAt = now;
data.meta.sourcesUpdated = { ...(data.meta.sourcesUpdated || {}), lda: now };
writeFileSync(OUT_FILE, JSON.stringify(data, null, 2));

console.log(`Done — ${withOrgs} politicians have lobbying org matches.`);