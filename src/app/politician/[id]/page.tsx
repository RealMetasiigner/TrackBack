import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import DonorTable from "@/components/DonorTable";
import IndustryBreakdown from "@/components/IndustryBreakdown";
import LobbyingOrganizationsTable from "@/components/LobbyingOrganizationsTable";
import LobbyistContributionsTable from "@/components/LobbyistContributionsTable";
import OutsideSpendingTable from "@/components/OutsideSpendingTable";
import PartyBadge from "@/components/PartyBadge";
import PurityScoreDisplay from "@/components/PurityScoreDisplay";
import ScoreBreakdown from "@/components/ScoreBreakdown";
import ScoreChangeIndicator from "@/components/ScoreChangeIndicator";
import ScoreHistoryChart from "@/components/ScoreHistoryChart";
import DataCompleteness from "@/components/DataCompleteness";
import LobbyingHighlights from "@/components/LobbyingHighlights";
import MoneySourceBar from "@/components/MoneySourceBar";
import { dataMeta, politicians } from "@/data/politicians";
import { formatSourceDate } from "@/lib/source-freshness";
import {
  getInfluenceHighlights,
  getIndividualVsPacPercent,
  getScoreSummaryLine,
} from "@/lib/score-summary";
import { getScoreLabel } from "@/lib/purity-score";
import { formatCurrency, getDataCompleteness, getPoliticianById } from "@/lib/utils";

interface PoliticianPageProps {
  params: { id: string };
}

export function generateStaticParams() {
  return politicians.map((p) => ({ id: p.id }));
}

export default function PoliticianPage({ params }: PoliticianPageProps) {
  const politician = getPoliticianById(params.id, politicians);

  if (!politician) {
    notFound();
  }

  const location =
    politician.chamber === "House"
      ? `${politician.state} · District ${politician.district}`
      : politician.state;

  const dataCompleteness = getDataCompleteness(politician);
  const scoreSummary = getScoreSummaryLine(politician);
  const moneySplit = getIndividualVsPacPercent(politician);
  const influenceHighlights = getInfluenceHighlights(politician);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1 text-sm text-slate-400 transition hover:text-white"
      >
        <span aria-hidden="true">{"\u2190"}</span> Back to TrackBack
      </Link>

      <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
        <div className="relative mx-auto h-48 w-48 shrink-0 overflow-hidden rounded-xl border border-slate-700 bg-slate-800 sm:mx-0">
          <Image
            src={politician.photoUrl}
            alt={politician.name}
            fill
            className="object-cover"
            sizes="192px"
            priority
          />
        </div>

        <div className="flex-1 text-center sm:text-left">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            {politician.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
            <PartyBadge party={politician.party} />
            <span className="text-slate-400">
              {politician.chamber} · {location}
            </span>
          </div>
          {politician.bio && (
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              {politician.bio}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-6 sm:justify-start">
            <span className="text-sm text-slate-400">
              National rank{" "}
              <span className="font-bold text-white">
                #{politician.nationalRank}
              </span>{" "}
              of {politicians.length}
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300">
              {getScoreLabel(politician.purityScore)}
            </span>
            <ScoreChangeIndicator change={politician.scoreChange} />
          </div>
          <p className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
            <span className="font-medium text-white">Why this score: </span>
            {scoreSummary}
          </p>
          <p className="mt-3 text-sm text-slate-500">
            Non-individual contributions:{" "}
            <span className="font-mono text-slate-300">
              {formatCurrency(politician.totalOutsideMoney)}
            </span>{" "}
            of{" "}
            <span className="font-mono text-slate-300">
              {formatCurrency(politician.totalDonations)}
            </span>{" "}
            raised ({politician.dataCycle || "2024"} cycle, FEC)
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-3 sm:justify-start">
            {politician.fecUrl && (
              <a
                href={politician.fecUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 underline hover:text-blue-300"
              >
                View FEC filings →
              </a>
            )}
            {politician.openSecretsUrl && (
              <a
                href={politician.openSecretsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 underline hover:text-blue-300"
              >
                View OpenSecrets profile →
              </a>
            )}
          </div>
        </div>

        <div className="shrink-0">
          <PurityScoreDisplay score={politician.purityScore} size="lg" />
        </div>
      </div>

      <div className="mt-8">
        <DataCompleteness
          percent={dataCompleteness.percent}
          tier={dataCompleteness.tier}
        />
        {(dataMeta?.sourcesUpdated?.votes || dataMeta?.sourcesUpdated?.fec) && (
          <p className="mt-2 text-xs text-slate-500">
            {dataMeta.sourcesUpdated?.votes && (
              <>Votes through {formatSourceDate(dataMeta.sourcesUpdated.votes)}</>
            )}
            {dataMeta.sourcesUpdated?.votes && dataMeta.sourcesUpdated?.fec && " · "}
            {dataMeta.sourcesUpdated?.fec && (
              <>FEC {politician.dataCycle || dataMeta.cycle} data through{" "}
              {formatSourceDate(dataMeta.sourcesUpdated.fec)}</>
            )}
          </p>
        )}
      </div>

      <div className="mt-8">
        <MoneySourceBar
          individualPercent={moneySplit.individualPercent}
          pacPercent={moneySplit.pacPercent}
          individualAmount={moneySplit.individualAmount}
          pacAmount={moneySplit.pacAmount}
          cycle={politician.dataCycle}
        />
      </div>

      {influenceHighlights.length > 0 && (
        <div className="mt-8">
          <LobbyingHighlights highlights={influenceHighlights} />
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <ScoreBreakdown
          breakdown={politician.scoreBreakdown}
          pacDependencePercent={politician.lobbyistMeetings}
        />
        <ScoreHistoryChart history={politician.scoreHistory} />
      </div>

      {politician.topDonors.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-white">Top 5 Donors</h2>
          <p className="mt-1 text-sm text-slate-400">
            Highest itemized FEC contributors this cycle — PACs, committees, and
            individuals with employers.
          </p>
          <div className="mt-6">
            <DonorTable donors={politician.topDonors} limit={5} />
          </div>
        </section>
      )}

      {politician.industryBreakdown &&
        politician.industryBreakdown.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-bold text-white">
              Who Buys Them — Industry Breakdown
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Pharma, oil, ag, tech, AIPAC-affiliated spenders, labor unions,
              civic groups, fraternities — every FEC-reported name we can
              classify ({politician.dataCycle || "2024"} cycle).
            </p>
            {politician.controversialIndustries.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {politician.controversialIndustries.map((ind) => (
                  <span
                    key={ind}
                    className="rounded-full border border-amber-500/30 bg-amber-950/30 px-3 py-1 text-xs font-medium text-amber-200"
                  >
                    {ind}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-6">
              <IndustryBreakdown
                items={politician.industryBreakdown}
                totalTracked={politician.industryBreakdown.reduce(
                  (s, i) => s + i.amount,
                  0
                )}
              />
            </div>
          </section>
        )}

      {politician.outsideSpending && politician.outsideSpending.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-white">
            Outside Spending (Independent Expenditures)
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            PAC and super PAC spending for or against this candidate — FEC
            independent expenditure filings ({politician.dataCycle || "2024"}{" "}
            cycle). Includes AIPAC-affiliated spenders like United Democracy
            Project where reported.
          </p>
          {politician.proIsraelOutsideSpending ? (
            <p className="mt-2 text-sm text-amber-300/90">
              Pro-Israel advocacy outside spending:{" "}
              <span className="font-mono font-semibold text-amber-200">
                {formatCurrency(politician.proIsraelOutsideSpending)}
              </span>
            </p>
          ) : null}
          <div className="mt-6">
            <OutsideSpendingTable spending={politician.outsideSpending} />
          </div>
        </section>
      )}

      {politician.lobbyistContributions &&
        politician.lobbyistContributions.eventCount > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-bold text-white">
              Lobbyist Contributions (LD-203)
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Direct lobbyist-hosted contributions to this official — public LDA.gov
              LD-203 filings (2024).
            </p>
            <div className="mt-6">
              <LobbyistContributionsTable
                total2024={politician.lobbyistContributions.total2024}
                eventCount={politician.lobbyistContributions.eventCount}
                events={politician.lobbyistContributions.events}
              />
            </div>
          </section>
        )}

      {(politician.smallDonorPercent !== undefined ||
        politician.outsideSpendingPercent !== undefined) && (
        <section className="mt-12 rounded-xl border border-slate-800 bg-slate-900/40 p-6">
          <h2 className="text-lg font-semibold text-white">Money mix</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {politician.smallDonorPercent !== undefined && (
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Itemized individual share
                </p>
                <p className="mt-1 font-mono text-2xl text-emerald-400">
                  {politician.smallDonorPercent}%
                </p>
              </div>
            )}
            {politician.outsideSpendingPercent !== undefined && (
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Outside super PAC spend ratio
                </p>
                <p className="mt-1 font-mono text-2xl text-amber-400">
                  {politician.outsideSpendingPercent}%
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {politician.lobbyingOrganizations &&
        politician.lobbyingOrganizations.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-bold text-white">
              Registered Lobbying Organizations
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {politician.lobbyingOrganizations.length} tracked influence
              groups — pharma, oil, defense, finance, tech, prisons, tobacco,
              unions, AIPAC, and more. Matched via FEC donors, sector exposure,
              and Senate LDA filings (2024 cycle).
            </p>
            {politician.totalLobbyingExposure ? (
              <p className="mt-2 text-sm text-slate-400">
                Combined org lobbying spend (matched groups):{" "}
                <span className="font-mono font-semibold text-slate-200">
                  {formatCurrency(politician.totalLobbyingExposure)}
                </span>
              </p>
            ) : null}
            <div className="mt-6">
              <LobbyingOrganizationsTable
                organizations={politician.lobbyingOrganizations}
              />
            </div>
            <p className="mt-3 text-xs text-slate-600">
              Source:{" "}
              <a
                href="https://lda.gov/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 underline hover:text-blue-400"
              >
                LDA.gov disclosures
              </a>{" "}
              + FEC itemized contributions.
            </p>
          </section>
        )}

      {politician.topDonors.length > 5 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-white">All Top Donors</h2>
          <p className="mt-1 text-sm text-slate-400">
            Full donor list ({politician.topDonors.length} entries) from FEC{" "}
            {politician.dataCycle || "2024"} filings.
            {politician.individualContributionTotal ? (
              <>
                {" "}
                Individual itemized total:{" "}
                <span className="font-mono text-slate-300">
                  {formatCurrency(politician.individualContributionTotal)}
                </span>
                .
              </>
            ) : null}
          </p>
          <div className="mt-6">
            <DonorTable donors={politician.topDonors} />
          </div>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-xl font-bold text-white">
          Votes Against Major Donors
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Recent Nay votes on legislation touching top donor industries — from
          GovTrack roll call records
        </p>

        {politician.recentVotesAgainstDonors.length === 0 ? (
          <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/50 p-6 text-center text-slate-500">
            No qualifying independence votes found in recent roll calls.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {politician.recentVotesAgainstDonors.map((vote, i) => (
              <div
                key={`${vote.billNumber}-${i}`}
                className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-white">
                      {vote.billName}
                    </h3>
                    <p className="text-sm text-slate-400">
                      {vote.billNumber} · {vote.date}
                    </p>
                  </div>
                  <span className="rounded bg-emerald-900/40 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                    Voted {vote.vote}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-300">
                  {vote.description}
                </p>
                <p className="mt-2 text-xs text-emerald-400">
                  Related to: {vote.donorAffected}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}