import Link from "next/link";
import { dataMeta } from "@/data/politicians";
import { NON_MONETIZATION_PLEDGE } from "@/lib/compliance";
import { formatSourceDate } from "@/lib/source-freshness";

export default function DataDisclaimer() {
  const cycle = dataMeta?.cycle || "2024";
  const syncedDate = formatSourceDate(dataMeta?.syncedAt);
  const votesDate = formatSourceDate(dataMeta?.sourcesUpdated?.votes);
  const fecDate = formatSourceDate(dataMeta?.sourcesUpdated?.fec);

  return (
    <div className="border-b border-blue-500/20 bg-blue-950/30">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p className="text-sm text-blue-200">
          <span className="font-semibold text-white">Live public data.</span>{" "}
          FEC {cycle} election cycle · official bulk filings
          {syncedDate ? (
            <span className="text-blue-300/80">
              {" "}
              (pipeline {syncedDate}
              {votesDate ? ` · votes ${votesDate}` : ""}
              {fecDate && fecDate !== votesDate ? ` · FEC ${fecDate}` : ""})
            </span>
          ) : null}
          . Sources:{" "}
          <a
            href="https://www.fec.gov/"
            className="underline hover:text-white"
            target="_blank"
            rel="noopener noreferrer"
          >
            FEC
          </a>
          ,{" "}
          <a
            href="https://lda.gov/"
            className="underline hover:text-white"
            target="_blank"
            rel="noopener noreferrer"
          >
            LDA.gov
          </a>
          ,{" "}
          <a
            href="https://www.govtrack.us/"
            className="underline hover:text-white"
            target="_blank"
            rel="noopener noreferrer"
          >
            GovTrack
          </a>
          ,{" "}
          <a
            href="https://www.congress.gov/"
            className="underline hover:text-white"
            target="_blank"
            rel="noopener noreferrer"
          >
            Congress.gov
          </a>
          .
        </p>
        <p className="shrink-0 text-xs text-blue-300/60">
          {dataMeta?.count || "—"} members · 137 lobbying orgs ·{" "}
          <Link href="/legal" className="underline hover:text-blue-200">
            Legal &amp; commitments
          </Link>
        </p>
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-2 sm:px-6 lg:px-8">
        <p className="text-center text-xs text-blue-300/50 sm:text-left">
          {NON_MONETIZATION_PLEDGE}
        </p>
      </div>
    </div>
  );
}