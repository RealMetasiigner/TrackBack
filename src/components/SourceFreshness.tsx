import { dataMeta } from "@/data/politicians";
import { getSourceFreshnessEntries } from "@/lib/source-freshness";

export default function SourceFreshness({ compact = false }: { compact?: boolean }) {
  const entries = getSourceFreshnessEntries(dataMeta?.sourcesUpdated);
  if (!entries.length) return null;

  if (compact) {
    const votes = entries.find((e) => e.key === "votes");
    const fec = entries.find((e) => e.key === "fec");
    return (
      <span className="text-blue-300/70">
        {votes ? `Votes ${votes.date}` : null}
        {votes && fec ? " · " : null}
        {fec ? `FEC ${fec.date}` : null}
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Data freshness by source
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {entries.map((entry) => (
          <li key={entry.key} className="text-sm text-slate-400">
            <span className="text-slate-300">{entry.label}:</span> {entry.date}
          </li>
        ))}
      </ul>
    </div>
  );
}