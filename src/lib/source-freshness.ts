import type { SourcesUpdated } from "@/data/politicians";

export function formatSourceDate(iso?: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export const SOURCE_LABELS: Record<keyof SourcesUpdated, string> = {
  legislators: "Member roster",
  fec: "FEC campaign finance",
  fecIndiv: "FEC individual donors",
  votes: "GovTrack votes",
  lda: "LDA lobbying orgs",
  ld203: "LD-203 lobbyist contributions",
};

export function getSourceFreshnessEntries(
  sourcesUpdated?: SourcesUpdated
): { key: string; label: string; date: string }[] {
  if (!sourcesUpdated) return [];
  return (Object.keys(SOURCE_LABELS) as (keyof SourcesUpdated)[])
    .filter((key) => sourcesUpdated[key])
    .map((key) => ({
      key,
      label: SOURCE_LABELS[key],
      date: formatSourceDate(sourcesUpdated[key]) || "—",
    }));
}