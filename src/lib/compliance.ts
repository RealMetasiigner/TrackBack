export const GITHUB_URL = "https://github.com/RealMetasiigner/TrackBack";

export const NON_MONETIZATION_PLEDGE =
  "TrackBack is and will remain free, open source, and non-commercial. No advertising. No paywall. No paid data access. Ever.";

export const FEC_CONTRIBUTOR_NOTICE =
  "Individual donor names and employers are from public FEC filings (contributions over $200). Per 52 U.S.C. § 30111, this information is displayed for public accountability only — not for solicitation or commercial use. TrackBack does not sell, rent, or use this data to contact donors.";

export const PURITY_SCORE_OPINION_NOTICE =
  "Purity Scores are analytical interpretations of public FEC and GovTrack data — not official government ratings, legal findings, or accusations of corruption.";

export const LDA_DERIVATION_NOTICE =
  "Lobbying data is retrieved from LDA.gov. Senate Office of Public Records cannot vouch for analyses derived after retrieval. Name matches in LDA filing text are heuristic — verify in the source filing.";

export const NON_AFFILIATION_NOTICE =
  "TrackBack is an independent accountability tool. It is not affiliated with the FEC, Congress, any campaign, or any lobbying organization. Organization names (e.g. AIPAC, PhRMA) appear descriptively from public records — no endorsement is implied.";

export const DATA_ACCURACY_NOTICE =
  "Campaign finance and lobbying data may contain errors from source filings. Always verify amounts and connections via linked FEC, LDA.gov, and OpenSecrets records.";

export const COMPLETED_DATA_SOURCES = [
  "LD-203 lobbyist contributions to officials (LDA.gov)",
] as const;

export const FUTURE_DATA_ROADMAP = [
  "Automated weekly GovTrack vote refresh (GitHub Actions)",
  "FEC 2026 election cycle bulk ingestion",
  "STOCK Act periodic transaction reports",
  "FEC Schedule B committee disbursements",
  "Congressional financial disclosure forms",
  "DOJ FARA foreign lobbying registrations",
] as const;