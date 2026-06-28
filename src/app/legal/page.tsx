import type { ReactNode } from "react";
import Link from "next/link";
import { dataMeta } from "@/data/politicians";
import SourceFreshness from "@/components/SourceFreshness";
import {
  COMPLETED_DATA_SOURCES,
  DATA_ACCURACY_NOTICE,
  FEC_CONTRIBUTOR_NOTICE,
  FUTURE_DATA_ROADMAP,
  GITHUB_URL,
  LDA_DERIVATION_NOTICE,
  NON_AFFILIATION_NOTICE,
  NON_MONETIZATION_PLEDGE,
  PURITY_SCORE_OPINION_NOTICE,
} from "@/lib/compliance";
import { PURITY_SCORE_EXPLANATION } from "@/lib/purity-score";

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-400">
        {children}
      </div>
    </section>
  );
}

export default function LegalPage() {
  const syncedDate = dataMeta?.syncedAt
    ? new Date(dataMeta.syncedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1 text-sm text-slate-400 transition hover:text-white"
      >
        <span aria-hidden="true">{"\u2190"}</span> Back to TrackBack
      </Link>

      <h1 className="text-3xl font-bold text-white sm:text-4xl">
        Legal &amp; Commitments
      </h1>
      <p className="mt-4 text-lg text-slate-300">
        How TrackBack uses public data, what we will never do, and how to
        interpret scores and matches on this site.
      </p>

      <div className="mt-10 space-y-8">
        <Section title="Non-monetization pledge">
          <p className="text-slate-300">{NON_MONETIZATION_PLEDGE}</p>
          <p>
            TrackBack is open source on{" "}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 underline hover:text-blue-300"
            >
              GitHub
            </a>
            . The code is MIT-licensed; underlying government data is public
            record and not subject to copyright.
          </p>
        </Section>

        <Section title="FEC contributor data">
          <p>{FEC_CONTRIBUTOR_NOTICE}</p>
          <p>
            We display donor names, employers, and amounts from FEC bulk filings.
            We do not display mailing addresses. PAC and committee names are not
            subject to the individual-contributor sale/use restriction.
          </p>
        </Section>

        <Section title="Purity Score disclaimer">
          <p>{PURITY_SCORE_OPINION_NOTICE}</p>
          <p>{PURITY_SCORE_EXPLANATION.summary}</p>
          <p>
            Labels such as &ldquo;Cleanest&rdquo; and &ldquo;Most
            Compromised&rdquo; reflect our scoring formula applied to public
            filings — not moral judgments or legal conclusions.
          </p>
        </Section>

        <Section title="Lobbying data (LDA.gov)">
          <p>{LDA_DERIVATION_NOTICE}</p>
          {syncedDate && (
            <p>
              LDA data in the current dataset was last retrieved on{" "}
              <span className="text-slate-300">{syncedDate}</span> (FEC{" "}
              {dataMeta?.cycle || "2024"} cycle).
            </p>
          )}
          <p>
            When a member appears in an LDA match, it means their name was found
            in lobbying filing text — not necessarily that a meeting occurred.
            Check the original filing at{" "}
            <a
              href="https://lda.gov/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 underline hover:text-blue-300"
            >
              LDA.gov
            </a>
            .
          </p>
        </Section>

        <Section title="Non-affiliation & accuracy">
          <p>{NON_AFFILIATION_NOTICE}</p>
          <p>{DATA_ACCURACY_NOTICE}</p>
        </Section>

        <Section title="Data freshness">
          <SourceFreshness />
        </Section>

        <Section title="Completed data sources">
          <ul className="list-inside list-disc space-y-1">
            {COMPLETED_DATA_SOURCES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>

        <Section title="Future public data (roadmap)">
          <p>
            Staying non-commercial allows us to publish public accountability
            data without FEC commercial-use concerns. Planned additions — all
            from legal public sources:
          </p>
          <ul className="list-inside list-disc space-y-1">
            {FUTURE_DATA_ROADMAP.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">
            We will never email donors from FEC data, sell contributor lists, or
            scrape sites that prohibit automated access.
          </p>
        </Section>
      </div>

      <p className="mt-10 text-center text-xs text-slate-600">
        This page is for transparency and is not legal advice. For official
        filings, use{" "}
        <a
          href="https://www.fec.gov/"
          className="underline hover:text-slate-400"
          target="_blank"
          rel="noopener noreferrer"
        >
          FEC.gov
        </a>
        .
      </p>
    </div>
  );
}