import type { Politician } from "@/lib/types";
import politiciansData from "./politicians.json";

export interface SourcesUpdated {
  legislators?: string;
  fec?: string;
  fecIndiv?: string;
  votes?: string;
  lda?: string;
  ld203?: string;
}

export interface PoliticiansDataset {
  meta: {
    syncedAt: string;
    cycle: number;
    count: number;
    sources: string[];
    sourcesUpdated?: SourcesUpdated;
  };
  politicians: Politician[];
}

const dataset = politiciansData as PoliticiansDataset;

export const dataMeta = dataset.meta;
export const politicians: Politician[] = dataset.politicians;