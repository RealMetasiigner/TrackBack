/** Enrich politicians.json with LD-203 lobbyist contributions, then recalc scores */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildLd203DataForPoliticians } from "./ld203-sync.mjs";
import { applyScoreRecalcToAll } from "./score-algorithm.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CACHE = join(ROOT, "scripts", "cache");
const OUT_FILE = join(ROOT, "src", "data", "politicians.json");

const data = JSON.parse(readFileSync(OUT_FILE, "utf8"));
const ld203Source = "LDA.gov LD-203 — lobbyist contributions to officials (lda.gov)";
if (!data.meta.sources.includes(ld203Source)) data.meta.sources.push(ld203Source);

console.log(`Enriching ${data.politicians.length} politicians with LD-203 data...`);
const withLd203 = await buildLd203DataForPoliticians(data.politicians, CACHE);
data.politicians = applyScoreRecalcToAll(withLd203);
const now = new Date().toISOString();
data.meta.syncedAt = now;
data.meta.sourcesUpdated = { ...(data.meta.sourcesUpdated || {}), ld203: now };
writeFileSync(OUT_FILE, JSON.stringify(data, null, 2));

const withContribs = data.politicians.filter((p) => p.lobbyistContributions?.eventCount > 0).length;
const scores = data.politicians.filter((p) => p.hasFinancialData).map((p) => p.purityScore).sort((a, b) => a - b);
console.log(`Done — ${withContribs} members have LD-203 contributions.`);
console.log(`Score range: ${scores[0]} – ${scores[scores.length - 1]}`);