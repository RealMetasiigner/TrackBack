/**
 * TrackBack Data Sync — uses legal public bulk downloads (no scraping)
 * Sources: FEC bulk CSV/ZIP, unitedstates/congress-legislators, GovTrack API
 */

import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  createReadStream,
  statSync,
  unlinkSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { createInterface } from "readline";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { createWriteStream } from "fs";
import { classifySource, isControversialIndustry, INDUSTRY_TAXONOMY } from "./industry-taxonomy.mjs";
import { buildLobbyingDataForPoliticians } from "./lda-sync.mjs";
import { buildLd203DataForPoliticians } from "./ld203-sync.mjs";
import { calculatePurityScore } from "./score-algorithm.mjs";
import { applyScoreRecalcToAll } from "./score-algorithm.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CACHE = join(ROOT, "scripts", "cache");
const OUT_DIR = join(ROOT, "src", "data");
const OUT_FILE = join(OUT_DIR, "politicians.json");
const LOCK_FILE = join(CACHE, ".sync.lock");
const LOCK_STALE_MS = 2 * 60 * 60 * 1000;

const CYCLE = 2024;
const PREV_CYCLE = 2022;

const PRO_ISRAEL_SPENDER_PATTERNS =
  INDUSTRY_TAXONOMY.find((t) => t.id === "pro-israel")?.patterns || [];

const TOP_DONOR_LIMIT = 25;
const TOP_IE_LIMIT = 12;
const MAX_DONORS_PER_CANDIDATE = 150;
const DONOR_PRUNE_TARGET = 100;

function loadEnv() {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv();

if (process.argv.includes("--quick")) {
  process.env.SKIP_INDIV_SYNC = "1";
  process.env.SKIP_LDA_SYNC = "1";
  process.env.SKIP_LD203_SYNC = "1";
  console.log("Quick sync: preserving cached indiv, LDA, and LD-203 from existing dataset");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isProcessRunning(pid) {
  if (!pid || Number.isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock() {
  mkdirSync(CACHE, { recursive: true });
  if (existsSync(LOCK_FILE)) {
    const lockPid = parseInt(readFileSync(LOCK_FILE, "utf8"), 10);
    const lockAge = Date.now() - statSync(LOCK_FILE).mtimeMs;
    if (lockAge < LOCK_STALE_MS && isProcessRunning(lockPid)) {
      console.error(
        `Sync already running (PID ${lockPid}). Wait for it to finish — do not start a second sync.`
      );
      process.exit(1);
    }
    unlinkSync(LOCK_FILE);
  }
  writeFileSync(LOCK_FILE, String(process.pid));
}

function releaseLock() {
  try {
    if (existsSync(LOCK_FILE) && readFileSync(LOCK_FILE, "utf8") === String(process.pid)) {
      unlinkSync(LOCK_FILE);
    }
  } catch {
    /* ignore */
  }
}

async function downloadFile(url, dest, minBytes = 100) {
  if (existsSync(dest) && statSync(dest).size >= minBytes) {
    console.log(`  Cache hit: ${dest.split(/[/\\]/).pop()}`);
    return dest;
  }
  console.log(`  Downloading ${url.split("/").pop()}...`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Download failed ${url}: ${res.status}`);
  if (!res.body) throw new Error(`Download failed ${url}: empty body`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  return dest;
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

async function loadCandidateSummary(cycle) {
  const url = `https://www.fec.gov/files/bulk-downloads/${cycle}/candidate_summary_${cycle}.csv`;
  const dest = join(CACHE, `candidate_summary_${cycle}.csv`);
  try {
    await downloadFile(url, dest);
  } catch {
    return new Map();
  }
  const text = readFileSync(dest, "utf8");
  const lines = text.split("\n").filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  const map = new Map();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row = Object.fromEntries(headers.map((h, idx) => [h, cols[idx] || ""]));
    const candId = row.Cand_Id;
    if (!candId) continue;
    row._cycle = cycle;
    map.set(candId, row);
  }
  return map;
}

function mergeCandidateSummaries(...maps) {
  const merged = new Map();
  for (const map of maps) {
    for (const [candId, row] of map) {
      const receipts = parseFloat(row.Total_Receipt) || 0;
      const existing = merged.get(candId);
      if (!existing || receipts > (parseFloat(existing.Total_Receipt) || 0)) {
        merged.set(candId, row);
      }
    }
  }
  return merged;
}

function unzipFile(zipPath, outDir) {
  mkdirSync(outDir, { recursive: true });
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${outDir}' -Force"`,
      { stdio: "pipe" }
    );
  } else {
    execSync(`unzip -o "${zipPath}" -d "${outDir}"`, { stdio: "pipe" });
  }
}

function findTxtInDir(dir, preferredName) {
  const preferred = join(dir, preferredName);
  if (existsSync(preferred)) return preferred;
  const files = execSync(`dir /b "${dir}"`, { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  const txt = files.find((f) => f.endsWith(".txt"));
  if (!txt) throw new Error(`No .txt file in ${dir}`);
  return join(dir, txt);
}

async function loadPas2Contributions() {
  const url =
    "https://www.fec.gov/files/bulk-downloads/2024/pas224.zip";
  const zipDest = join(CACHE, "pas224.zip");
  const extractDir = join(CACHE, "pas224");
  await downloadFile(url, zipDest);
  unzipFile(zipDest, extractDir);

  const txtFile = join(extractDir, "pas224.txt");
  if (!existsSync(txtFile)) {
    const files = execSync(`dir /b "${extractDir}"`, { encoding: "utf8" }).trim().split("\n");
    const txt = files.find((f) => f.endsWith(".txt"));
    if (!txt) throw new Error("pas224.txt not found in archive");
    return loadPas2FromFile(join(extractDir, txt.trim()));
  }
  return loadPas2FromFile(txtFile);
}

async function loadPas2FromFile(filePath) {
  const byCandidate = new Map();
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = line.split("|");
    if (cols.length < 17) continue;
    const name = cols[7]?.trim();
    const amount = parseFloat(cols[14]) || 0;
    const candId = cols[16]?.trim();
    const entityType = cols[6]?.trim();
    const memoCd = cols[19]?.trim();
    if (!candId || !name || amount <= 0 || memoCd === "X") continue;

    if (!byCandidate.has(candId)) byCandidate.set(candId, new Map());
    const donors = byCandidate.get(candId);
    const key = name.toUpperCase();
    const existing = donors.get(key);
    if (existing) {
      existing.amount += amount;
    } else {
      donors.set(key, {
        name: titleCase(name),
        industry: detectIndustry("", name),
        amount,
        type: entityType === "PAC" || entityType === "PTY" ? "PAC" : entityType === "COM" ? "Corporate" : "PAC",
      });
    }
  }

  const result = new Map();
  for (const [candId, donors] of byCandidate) {
    const list = [...donors.values()].sort((a, b) => b.amount - a.amount).slice(0, TOP_DONOR_LIMIT);
    const pacTotal = [...donors.values()].reduce((s, d) => s + d.amount, 0);
    result.set(candId, { donors: list, pacTotal, allDonors: [...donors.values()] });
  }
  return result;
}

async function loadCclLinkages(targetCandIds) {
  const suffix = String(CYCLE).slice(2);
  const url = `https://www.fec.gov/files/bulk-downloads/${CYCLE}/ccl${suffix}.zip`;
  const zipDest = join(CACHE, `ccl${suffix}.zip`);
  const extractDir = join(CACHE, `ccl${suffix}`);
  await downloadFile(url, zipDest);
  unzipFile(zipDest, extractDir);

  const txtFile = findTxtInDir(extractDir, `ccl${suffix}.txt`);
  const cmteToCands = new Map();
  const rl = createInterface({ input: createReadStream(txtFile), crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = line.split("|");
    if (cols.length < 4) continue;
    const candId = cols[0]?.trim();
    const fecElectionYr = cols[2]?.trim();
    const cmteId = cols[3]?.trim();
    if (!candId || !cmteId || fecElectionYr !== String(CYCLE)) continue;
    if (!targetCandIds.has(candId)) continue;

    if (!cmteToCands.has(cmteId)) cmteToCands.set(cmteId, new Set());
    cmteToCands.get(cmteId).add(candId);
  }

  console.log(`  ccl: ${cmteToCands.size} committees linked to current members`);
  return cmteToCands;
}

function pruneDonorMap(donors) {
  if (donors.size <= MAX_DONORS_PER_CANDIDATE) return;
  const entries = [...donors.entries()].sort((a, b) => a[1].amount - b[1].amount);
  for (let i = 0; i < entries.length - DONOR_PRUNE_TARGET; i++) {
    donors.delete(entries[i][0]);
  }
}

async function loadIndividualContributions(cmteToCands) {
  if (process.env.SKIP_INDIV_SYNC === "1") {
    console.log("  Skipping indiv bulk (SKIP_INDIV_SYNC=1)");
    return new Map();
  }

  const suffix = String(CYCLE).slice(2);
  const url = `https://www.fec.gov/files/bulk-downloads/${CYCLE}/indiv${suffix}.zip`;
  const zipDest = join(CACHE, `indiv${suffix}.zip`);
  const extractDir = join(CACHE, `indiv${suffix}`);

  await downloadFile(url, zipDest, 1_000_000_000);
  const preferredTxt = join(extractDir, `itcont${suffix}.txt`);
  let txtFile = existsSync(preferredTxt) ? preferredTxt : null;
  if (!txtFile) {
    try {
      txtFile = findTxtInDir(extractDir, `itcont${suffix}.txt`);
    } catch {
      txtFile = null;
    }
  }
  if (!txtFile) {
    console.log("  Extracting indiv archive (large — may take several minutes)...");
    unzipFile(zipDest, extractDir);
    txtFile = findTxtInDir(extractDir, `itcont${suffix}.txt`);
  } else {
    console.log(`  Cache hit: ${txtFile.split(/[/\\]/).pop()} (skip extract)`);
  }
  const byCandidate = new Map();
  let lineCount = 0;
  const rl = createInterface({ input: createReadStream(txtFile), crlfDelay: Infinity });

  for await (const line of rl) {
    lineCount++;
    if (lineCount % 5_000_000 === 0) {
      console.log(`  indiv: ${(lineCount / 1_000_000).toFixed(1)}M rows processed...`);
    }
    if (!line.trim()) continue;
    const cols = line.split("|");
    if (cols.length < 15) continue;

    const cmteId = cols[0]?.trim();
    const name = cols[7]?.trim();
    const employer = cols[11]?.trim();
    const amount = parseFloat(cols[14]) || 0;
    const memoCd = cols[18]?.trim();
    if (!cmteId || !name || amount <= 0 || memoCd === "X") continue;

    const cands = cmteToCands.get(cmteId);
    if (!cands) continue;

    const sector = classifySource(name, employer);
    const donorKey = `${name}|${employer || ""}`.toUpperCase();

    for (const candId of cands) {
      if (!byCandidate.has(candId)) {
        byCandidate.set(candId, { industries: new Map(), donors: new Map(), total: 0 });
      }
      const entry = byCandidate.get(candId);
      entry.total += amount;

      const existingSector = entry.industries.get(sector.id);
      if (existingSector) {
        existingSector.amount += amount;
        existingSector.sourceCount += 1;
      } else {
        entry.industries.set(sector.id, {
          id: sector.id,
          label: sector.label,
          amount,
          sourceCount: 1,
        });
      }

      const existingDonor = entry.donors.get(donorKey);
      if (existingDonor) {
        existingDonor.amount += amount;
      } else {
        if (entry.donors.size >= MAX_DONORS_PER_CANDIDATE) pruneDonorMap(entry.donors);
        entry.donors.set(donorKey, {
          name: titleCase(name),
          industry: sector.label,
          amount,
          type: "Individual",
          employer: employer ? titleCase(employer) : undefined,
        });
      }
    }
  }

  console.log(`  indiv: ${lineCount.toLocaleString()} rows → ${byCandidate.size} candidates with itemized individuals`);
  return byCandidate;
}

function mergeTopDonors(pas2Donors, indivEntry, limit = TOP_DONOR_LIMIT) {
  const all = new Map();

  for (const d of pas2Donors) {
    const key = `PAC|${d.name}`.toUpperCase();
    const existing = all.get(key);
    if (existing) existing.amount += d.amount;
    else all.set(key, { ...d });
  }

  if (indivEntry?.donors) {
    for (const d of indivEntry.donors.values()) {
      const key = `IND|${d.name}|${d.employer || ""}`.toUpperCase();
      const existing = all.get(key);
      if (existing) existing.amount += d.amount;
      else all.set(key, { ...d });
    }
  }

  return [...all.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
}

function buildIndustryBreakdown({ pas2Donors, outsideSpending, indivEntry, totalDonations }) {
  const sectors = new Map();

  const add = (id, label, amount, sourceCount = 0) => {
    if (!sectors.has(id)) sectors.set(id, { id, label, amount: 0, sourceCount: 0 });
    const s = sectors.get(id);
    s.amount += amount;
    s.sourceCount += sourceCount;
  };

  for (const donor of pas2Donors) {
    const sector =
      donor.type === "Individual"
        ? classifySource(donor.name, donor.employer || "")
        : classifySource(donor.name, "");
    add(sector.id, sector.label, donor.amount, 1);
  }

  for (const ie of outsideSpending) {
    const sector = classifySource(ie.spender, "");
    add(sector.id, sector.label, ie.amount, 1);
  }

  if (indivEntry?.industries) {
    for (const [, data] of indivEntry.industries) {
      add(data.id, data.label, data.amount, data.sourceCount || 1);
    }
  }

  const sectorTotal = [...sectors.values()].reduce((s, x) => s + x.amount, 0);
  const denom = sectorTotal > 0 ? sectorTotal : totalDonations || 1;

  return [...sectors.values()]
    .map((s) => ({
      id: s.id,
      label: s.label,
      amount: Math.round(s.amount),
      percent: Math.round((s.amount / denom) * 1000) / 10,
      sourceCount: s.sourceCount,
    }))
    .filter((s) => s.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

function titleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bPac\b/g, "PAC");
}

function detectIndustry(employer, name) {
  return classifySource(name, employer).label;
}

function computeDataCompleteness(params) {
  const {
    hasFinancialData,
    totalDonations,
    individualContributionTotal,
    topDonorsCount,
    outsideSpendingCount,
    industryBreakdownCount,
  } = params;

  if (!hasFinancialData || totalDonations < 1000) {
    return { percent: 0, tier: "insufficient" };
  }

  let points = 0;
  if (totalDonations >= 100_000) points += 25;
  else if (totalDonations >= 10_000) points += 18;
  else points += 10;

  if (individualContributionTotal >= 100_000) points += 30;
  else if (individualContributionTotal > 0) points += 15;

  if (topDonorsCount >= 20) points += 20;
  else if (topDonorsCount >= 5) points += 10;

  if (outsideSpendingCount > 0) points += 10;
  if (industryBreakdownCount >= 5) points += 15;
  else if (industryBreakdownCount >= 2) points += 8;

  const percent = Math.min(100, points);
  let tier = "low";
  if (percent >= 80) tier = "high";
  else if (percent >= 55) tier = "medium";
  else if (percent < 25) tier = "insufficient";

  return { percent, tier };
}

function detectControversialIndustries(donors, outsideSpending = [], industryBreakdown = []) {
  const found = new Set();
  for (const d of donors) {
    if (isControversialIndustry(d.industry)) found.add(d.industry);
  }
  for (const s of outsideSpending) {
    const label = classifySource(s.spender, "").label;
    if (isControversialIndustry(label)) found.add(label);
  }
  for (const item of industryBreakdown) {
    if (isControversialIndustry(item.label)) found.add(item.label);
  }
  return [...found];
}

async function loadIndependentExpenditures() {
  const url = "https://www.fec.gov/files/bulk-downloads/2024/independent_expenditure_2024.csv";
  const dest = join(CACHE, "independent_expenditure_2024.csv");
  await downloadFile(url, dest);

  const text = readFileSync(dest, "utf8");
  const lines = text.split("\n").filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  const byCandidate = new Map();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row = Object.fromEntries(headers.map((h, idx) => [h, (cols[idx] || "").replace(/^"|"$/g, "")]));
    const candId = row.cand_id;
    const spender = row.spe_nam?.trim();
    const amount = parseFloat(row.exp_amo) || 0;
    const position = row.sup_opp === "O" ? "oppose" : "support";
    if (!candId || !spender || amount <= 0) continue;

    if (!byCandidate.has(candId)) byCandidate.set(candId, new Map());
    const spenders = byCandidate.get(candId);
    const key = `${spender.toUpperCase()}|${position}`;
    const existing = spenders.get(key);
    if (existing) {
      existing.amount += amount;
    } else {
      spenders.set(key, {
        spender: titleCase(spender),
        amount,
        position,
        isProIsraelAdvocacy: PRO_ISRAEL_SPENDER_PATTERNS.some((p) =>
          spender.toLowerCase().includes(p)
        ),
      });
    }
  }

  const result = new Map();
  for (const [candId, spenders] of byCandidate) {
    const list = [...spenders.values()].sort((a, b) => b.amount - a.amount).slice(0, TOP_IE_LIMIT);
    const total = [...spenders.values()].reduce((s, x) => s + x.amount, 0);
    const proIsraelTotal = [...spenders.values()]
      .filter((x) => x.isProIsraelAdvocacy)
      .reduce((s, x) => s + x.amount, 0);
    result.set(candId, { spending: list, total, proIsraelTotal });
  }
  return result;
}

function normalizeParty(party) {
  const p = (party || "").toUpperCase();
  if (p.startsWith("DEM")) return "Democrat";
  if (p.startsWith("REP")) return "Republican";
  if (p === "IND" || p.includes("IND")) return "Independent";
  return "Independent";
}

function getCurrentTerm(legislator) {
  const terms = legislator.terms || [];
  return terms.filter((t) => !t.end || t.end >= "2025-01-01").at(-1) || terms.at(-1);
}

function getFecId(legislator, term) {
  const fecIds = legislator.id?.fec || [];
  if (!fecIds.length) return null;
  const prefix = term.type === "sen" ? "S" : "H";
  const matching = fecIds.filter((id) => id.startsWith(prefix));
  return matching.at(-1) || fecIds.at(-1);
}

function calculateScores(params) {
  return calculatePurityScore({
    ...params,
    lobbyingExposurePenalty: 0,
    hasFinancialData: true,
  });
}

function buildScoreHistory(s22, s24) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  return months.map((month, i) => ({ month, score: Math.round(s22 + ((s24 - s22) * (i + 1)) / 6) }));
}

function scoresFromFecRow(row, pas2PacTotal = 0) {
  const totalDonations = parseFloat(row?.Total_Receipt) || 0;
  const individual = parseFloat(row?.Individual_Contribution) || 0;
  const pac = parseFloat(row?.Other_Committee_Contribution) || 0;
  const party = parseFloat(row?.Party_Committee_Contribution) || 0;
  const transfers = parseFloat(row?.Transfer_From_Other_Auth_Committee) || 0;

  let totalOutsideMoney = pac + party + transfers;
  if (totalDonations > 0) {
    totalOutsideMoney = Math.max(totalOutsideMoney, totalDonations - individual);
  }

  let effectiveTotal = totalDonations;
  if (effectiveTotal === 0 && pas2PacTotal > 0) {
    effectiveTotal = pas2PacTotal * 4;
    totalOutsideMoney = pas2PacTotal;
  }

  const pacDependenceScore =
    effectiveTotal > 0 ? Math.round((Math.max(pac, pas2PacTotal) / effectiveTotal) * 100) : 0;

  return {
    totalDonations: effectiveTotal,
    totalOutsideMoney,
    pacDependenceScore,
    hasFinancialData: effectiveTotal > 1000,
    dataCycleUsed: row?._cycle || CYCLE,
  };
}

async function fetchAllGovTrackRoles() {
  const roles = [];
  let offset = 0;
  while (true) {
    const data = await fetch(`https://www.govtrack.us/api/v2/role?current=true&limit=100&offset=${offset}`).then((r) => r.json());
    roles.push(...data.objects);
    if (roles.length >= data.meta.total_count) break;
    offset += 100;
    await sleep(150);
  }
  return roles;
}

function govtrackPersonId(person) {
  const m = (person?.link || "").match(/\/(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

async function fetchRecentVotes(personId, topDonors) {
  if (!personId) return [];
  const res = await fetch(
    `https://www.govtrack.us/api/v2/vote_voter?person=${personId}&limit=40&created__gt=2024-01-01&sort=-created`
  );
  const data = await res.json();
  const votes = [];

  for (const vv of data.objects || []) {
    if (vv.option?.value !== "Nay") continue;
    const vote = vv.vote;
    if (!vote || vote.category === "procedural") continue;
    const question = vote.question || vote.display_title || "Roll call vote";
    const billMatch = question.match(/([HS]\.?\s*(?:J\.?\s*Res\.?|Res\.?|Con\.?\s*Res\.?|R\.?)?\s*\d+)/i);
    const billNumber = billMatch ? billMatch[1].replace(/\s+/g, " ").trim() : `Vote ${vote.id}`;

    let donorAffected = null;
    const qLower = question.toLowerCase();
    for (const donor of topDonors) {
      const dLower = `${donor.name} ${donor.industry}`.toLowerCase();
      for (const sector of INDUSTRY_TAXONOMY) {
        if (!isControversialIndustry(sector.label)) continue;
        if (sector.patterns.some((p) => dLower.includes(p) && qLower.includes(p.split(" ")[0]))) {
          donorAffected = donor.name;
          break;
        }
      }
      if (donorAffected) break;
    }

    votes.push({
      billName: question.slice(0, 140),
      billNumber,
      date: (vv.created || "").slice(0, 10),
      donorAffected: donorAffected || "Industry-aligned legislation",
      vote: "Nay",
      description: donorAffected
        ? `Nay vote on legislation related to ${donorAffected}'s sector (GovTrack)`
        : `Recorded Nay on ${vote.category || "floor"} measure (GovTrack)`,
      isIndependenceVote: !!donorAffected,
    });
    if (votes.length >= 5) break;
  }
  return votes;
}

function loadExistingDataset() {
  if (!existsSync(OUT_FILE)) return null;
  try {
    return JSON.parse(readFileSync(OUT_FILE, "utf8"));
  } catch {
    return null;
  }
}

function mergePreservedFields(politicians, existingById) {
  if (!existingById?.size) return politicians;

  return politicians.map((p) => {
    const ex = existingById.get(p.id);
    if (!ex) return p;

    const merged = { ...p };

    if (process.env.SKIP_INDIV_SYNC === "1") {
      if (ex.individualContributionTotal) {
        merged.individualContributionTotal = ex.individualContributionTotal;
      }
      if (ex.topDonors?.length) {
        const pas2Only = (p.topDonors || []).filter((d) => d.type === "PAC" || d.type === "Corporate");
        const indivOnly = (ex.topDonors || []).filter((d) => d.type === "Individual");
        const seen = new Set();
        merged.topDonors = [...pas2Only, ...indivOnly]
          .filter((d) => {
            const key = d.name.toUpperCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .sort((a, b) => b.amount - a.amount)
          .slice(0, TOP_DONOR_LIMIT);
      }
      if (ex.industryBreakdown?.length && !p.industryBreakdown?.length) {
        merged.industryBreakdown = ex.industryBreakdown;
      }
    }

    if (process.env.SKIP_LDA_SYNC === "1") {
      merged.lobbyingOrganizations = ex.lobbyingOrganizations || [];
      merged.totalLobbyingExposure = ex.totalLobbyingExposure || 0;
    }

    if (process.env.SKIP_LD203_SYNC === "1") {
      merged.lobbyistContributions = ex.lobbyistContributions || null;
    }

    return merged;
  });
}

function buildSourcesUpdated(existingMeta, now) {
  const prev = existingMeta?.sourcesUpdated || {};
  const fallback = existingMeta?.syncedAt;
  const updated = { ...prev };

  updated.legislators = now;
  updated.fec = now;
  updated.votes = now;

  if (process.env.SKIP_INDIV_SYNC !== "1") {
    updated.fecIndiv = now;
  } else if (!updated.fecIndiv && fallback) {
    updated.fecIndiv = fallback;
  }

  if (process.env.SKIP_LDA_SYNC !== "1") {
    updated.lda = now;
  } else if (!updated.lda && fallback) {
    updated.lda = fallback;
  }

  if (process.env.SKIP_LD203_SYNC !== "1") {
    updated.ld203 = now;
  } else if (!updated.ld203 && fallback) {
    updated.ld203 = fallback;
  }

  return updated;
}

async function main() {
  acquireLock();
  console.log("TrackBack bulk data sync...");
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const existingData = loadExistingDataset();
  const existingById = new Map(
    (existingData?.politicians || []).map((p) => [p.id, p])
  );

  const legislatorsRaw = await fetch(
    "https://raw.githubusercontent.com/unitedstates/congress-legislators/gh-pages/legislators-current.json"
  ).then((r) => r.json());

  const targetCandIds = new Set();
  for (const leg of legislatorsRaw) {
    const term = getCurrentTerm(leg);
    if (!term || (term.type !== "sen" && term.type !== "rep")) continue;
    const fecId = getFecId(leg, term);
    if (fecId) targetCandIds.add(fecId);
  }

  const [govtrackRoles, fec2024, fec2022, fec2020, pas2Data, ieData, cmteToCands] = await Promise.all([
    fetchAllGovTrackRoles(),
    loadCandidateSummary(CYCLE),
    loadCandidateSummary(PREV_CYCLE),
    loadCandidateSummary(2020),
    loadPas2Contributions(),
    loadIndependentExpenditures(),
    loadCclLinkages(targetCandIds),
  ]);

  const indivData = await loadIndividualContributions(cmteToCands);

  const fecMerged = mergeCandidateSummaries(fec2024, fec2022, fec2020);

  const govtrackByBioguide = new Map(govtrackRoles.map((r) => [r.person?.bioguideid, r]));

  const politicians = [];
  let idx = 0;

  for (const leg of legislatorsRaw) {
    const term = getCurrentTerm(leg);
    if (!term || (term.type !== "sen" && term.type !== "rep")) continue;
    const bio = leg.id?.bioguide;
    if (!bio) continue;

    const name = leg.name?.official_full || [leg.name?.first, leg.name?.last].filter(Boolean).join(" ");
    const fecId = getFecId(leg, term);
    const fecRow = fecId ? fecMerged.get(fecId) : null;
    const fecPrev = fecId ? fec2022.get(fecId) || fec2020.get(fecId) : null;
    const gtRole = govtrackByBioguide.get(bio);
    const personId = gtRole ? govtrackPersonId(gtRole.person) : null;
    const osid = leg.id?.opensecrets || gtRole?.person?.osid;

    const pas2Entry = fecId ? pas2Data.get(fecId) : null;
    const pas2PacTotal = pas2Entry?.pacTotal || 0;
    const pas2Donors = pas2Entry?.allDonors || pas2Entry?.donors || [];
    const indivEntry = fecId ? indivData.get(fecId) : null;
    const topDonors = mergeTopDonors(pas2Entry?.donors || [], indivEntry);
    const ieEntry = fecId ? ieData.get(fecId) : null;
    const outsideSpending = ieEntry?.spending || [];
    const proIsraelOutsideSpending = ieEntry?.proIsraelTotal || 0;

    const fin = scoresFromFecRow(fecRow, pas2PacTotal);
    const finPrev = fecPrev ? scoresFromFecRow(fecPrev, pas2PacTotal) : fin;
    const industryBreakdown = buildIndustryBreakdown({
      pas2Donors,
      outsideSpending,
      indivEntry,
      totalDonations: fin.totalDonations,
    });
    const controversialIndustries = detectControversialIndustries(
      topDonors,
      outsideSpending,
      industryBreakdown
    );

    let recentVotes = [];
    try {
      recentVotes = await fetchRecentVotes(personId, topDonors);
      await sleep(120);
    } catch {
      /* skip */
    }

    const independenceVotes = recentVotes.filter((v) => v.isIndependenceVote).length;

    let scoreBreakdown = calculateScores({ ...fin, controversialIndustries, independenceVotes });
    let scorePrev = calculateScores({ ...finPrev, controversialIndustries: [], independenceVotes: 0 }).finalScore;

    if (!fin.hasFinancialData) {
      scoreBreakdown = { baseScore: 0, outsideMoneyPercent: 0, votingBonus: 0, lobbyistMeetingPenalty: 0, controversialIndustryPenalty: 0, finalScore: 0 };
      scorePrev = 0;
    }

    const dataCompleteness = computeDataCompleteness({
      hasFinancialData: fin.hasFinancialData,
      totalDonations: fin.totalDonations,
      individualContributionTotal: indivEntry?.total || 0,
      topDonorsCount: topDonors.length,
      outsideSpendingCount: outsideSpending.length,
      industryBreakdownCount: industryBreakdown.length,
    });

    const bioSnippet = (() => {
      const parts = [];
      const firstStart = leg.terms?.[0]?.start;
      if (firstStart) {
        const since = firstStart.slice(0, 4);
        const years = new Date().getFullYear() - parseInt(since, 10);
        parts.push(`In Congress since ${since} (${years}+ years)`);
      }
      const leadership = (leg.leadership_roles || []).find(
        (r) => !r.end || r.end >= "2025-01-01"
      );
      if (leadership?.title) parts.push(leadership.title);
      if (term.type === "sen") parts.push(`U.S. Senator for ${term.state}`);
      else {
        const dist = term.district === 0 ? "at-large" : `District ${term.district}`;
        parts.push(`U.S. Representative for ${term.state} (${dist})`);
      }
      return parts.join(" · ");
    })();

    politicians.push({
      id: bio.toLowerCase(),
      bioguideId: bio,
      name,
      bio: bioSnippet,
      birthday: leg.bio?.birthday,
      party: normalizeParty(term.party),
      chamber: term.type === "sen" ? "Senate" : "House",
      state: term.state,
      district: term.type === "rep" ? (term.district === 0 ? "At-Large" : String(term.district)) : undefined,
      photoUrl: `https://bioguide.congress.gov/photo/${bio}.jpg`,
      openSecretsUrl: osid ? `https://www.opensecrets.org/members-of-congress/summary?cid=${osid}` : null,
      fecUrl: fecId ? `https://www.fec.gov/data/candidate/${fecId}/` : null,
      purityScore: scoreBreakdown.finalScore,
      nationalRank: 0,
      scoreChange: scoreBreakdown.finalScore - scorePrev,
      totalOutsideMoney: fin.totalOutsideMoney,
      totalDonations: fin.totalDonations,
      lobbyistMeetings: fin.pacDependenceScore,
      topDonors,
      industryBreakdown,
      individualContributionTotal: indivEntry?.total || 0,
      outsideSpending,
      totalOutsideSpending: ieEntry?.total || 0,
      proIsraelOutsideSpending,
      recentVotesAgainstDonors: recentVotes.map(({ isIndependenceVote, ...v }) => v),
      scoreBreakdown,
      scoreHistory: buildScoreHistory(scorePrev, scoreBreakdown.finalScore),
      controversialIndustries,
      dataCycle: fin.dataCycleUsed || CYCLE,
      hasFinancialData: fin.hasFinancialData,
      dataCompletenessPercent: dataCompleteness.percent,
      dataCompletenessTier: dataCompleteness.tier,
      lastSynced: new Date().toISOString(),
    });

    idx++;
    if (idx % 50 === 0) console.log(`  Processed ${idx} legislators...`);
  }

  const ranked = politicians.filter((p) => p.hasFinancialData);
  ranked.sort((a, b) => b.purityScore - a.purityScore);
  ranked.forEach((p, i) => { p.nationalRank = i + 1; });
  politicians.filter((p) => !p.hasFinancialData).forEach((p) => { p.nationalRank = ranked.length + 1; });

  const mergedPoliticians = mergePreservedFields(politicians, existingById);
  const withLobbying = await buildLobbyingDataForPoliticians(mergedPoliticians, CACHE);
  const withLd203 = await buildLd203DataForPoliticians(withLobbying, CACHE);
  const politiciansWithLobbying = applyScoreRecalcToAll(withLd203);

  const syncedAt = new Date().toISOString();
  const output = {
    meta: {
      syncedAt,
      cycle: CYCLE,
      count: politicians.length,
      sourcesUpdated: buildSourcesUpdated(existingData?.meta, syncedAt),
      sources: [
        "FEC candidate_summary bulk CSV (fec.gov)",
        "FEC pas2 bulk file — committee-to-candidate contributions (fec.gov)",
        "FEC indiv bulk file — itemized individual contributions by employer (fec.gov)",
        "FEC ccl bulk file — committee-to-candidate linkage (fec.gov)",
        "FEC independent_expenditure bulk CSV — outside PAC spending (fec.gov)",
        "TrackBack industry taxonomy — 25+ sectors from public FEC names/employers",
        "unitedstates/congress-legislators (public domain)",
        "GovTrack.us — roll call voting records",
        "Congress.gov Bioguide — official photos",
        "LDA.gov API — registered lobbying organizations (lda.gov)",
        "LDA.gov LD-203 — lobbyist contributions to officials (lda.gov)",
      ],
    },
    politicians: politiciansWithLobbying,
  };

  writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nDone! ${politicians.length} members synced.`);
  console.log(`Scores: ${politicians.at(-1)?.purityScore} – ${politicians[0]?.purityScore}`);
  console.log(`Written to ${OUT_FILE}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    releaseLock();
  });