import Link from "next/link";
import SourceFreshness from "@/components/SourceFreshness";
import { dataMeta } from "@/data/politicians";
import {
  FEC_CONTRIBUTOR_NOTICE,
  NON_MONETIZATION_PLEDGE,
  PURITY_SCORE_OPINION_NOTICE,
} from "@/lib/compliance";
import { PURITY_SCORE_EXPLANATION } from "@/lib/purity-score";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1 text-sm text-slate-400 transition hover:text-white"
      >
        <span aria-hidden="true">{"\u2190"}</span> Back to TrackBack
      </Link>

      <h1 className="text-3xl font-bold text-white sm:text-4xl">About TrackBack</h1>
      <p className="mt-4 text-lg text-slate-300">
        TrackBack maps every FEC-reported dollar we can classify — then links it to
        voting behavior and registered lobbying. No mock data. No accounts.
      </p>

      <section className="mt-10 space-y-4 text-slate-400">
        <h2 className="text-xl font-semibold text-white">What we track</h2>
        <ul className="list-inside list-disc space-y-2 text-sm">
          <li>Committee & PAC contributions (FEC pas2 bulk data)</li>
          <li>Itemized individual donors with employers (FEC indiv)</li>
          <li>Outside super PAC spending for/against candidates (FEC IE)</li>
          <li>137 registered lobbying organizations via LDA.gov</li>
          <li>LD-203 lobbyist contributions to officials (LDA.gov)</li>
          <li>Small-donor share and outside super PAC spending ratios (FEC)</li>
          <li>Pro-Israel advocacy spenders: UDP, DMFI, NorPAC, AIPAC-affiliated PACs</li>
          <li>Pharma, oil, defense, finance, tech, prisons, tobacco, unions, and more</li>
          <li>Nay votes on donor-aligned legislation (GovTrack roll calls)</li>
        </ul>
      </section>

      <section className="mt-10 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-xl font-semibold text-white">
          {PURITY_SCORE_EXPLANATION.title}
        </h2>
        <p className="mt-3 text-slate-300">{PURITY_SCORE_EXPLANATION.summary}</p>
        <div className="mt-6 space-y-3 text-sm text-slate-400">
          <p>
            <span className="font-medium text-white">Base:</span>{" "}
            {PURITY_SCORE_EXPLANATION.formula}
          </p>
          <p>
            <span className="font-medium text-emerald-400">Bonus:</span>{" "}
            {PURITY_SCORE_EXPLANATION.bonuses}
          </p>
          <p>
            <span className="font-medium text-red-400">Penalties:</span>{" "}
            {PURITY_SCORE_EXPLANATION.penalties}
          </p>
          <p>
            <span className="font-medium text-amber-400">Lobbying exposure:</span>{" "}
            Additional deduction when a member has many tracked lobbying ties, direct
            FEC matches to influence groups, or pro-Israel outside spending.
          </p>
        </div>
      </section>

      <section className="mt-10 rounded-xl border border-slate-800 bg-slate-900/30 p-6 text-sm text-slate-400">
        <h2 className="text-lg font-semibold text-white">Commitments</h2>
        <p className="mt-3 text-slate-300">{NON_MONETIZATION_PLEDGE}</p>
        <p className="mt-4">{FEC_CONTRIBUTOR_NOTICE}</p>
        <p className="mt-4">{PURITY_SCORE_OPINION_NOTICE}</p>
        <p className="mt-4">
          <Link href="/legal" className="text-blue-400 underline hover:text-blue-300">
            Full legal &amp; commitments page →
          </Link>
        </p>
      </section>

      <section className="mt-10">
        <SourceFreshness />
      </section>

      <section className="mt-10 text-sm text-slate-500">
        <p>
          Dataset: {dataMeta?.count} current members · FEC {dataMeta?.cycle} cycle.
          Refreshed by re-running our public-data sync pipeline — never scraped from
          private sources.
        </p>
        <p className="mt-4">
          TrackBack is for educational and accountability purposes. It is not
          affiliated with the FEC, Congress, or any campaign.
        </p>
      </section>
    </div>
  );
}