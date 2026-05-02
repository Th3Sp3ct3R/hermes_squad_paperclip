/**
 * Suno pipeline API client. Wraps GET/POST/PATCH /api/suno-pipeline and
 * mirrors the column shape declared in `packages/db/src/schema/sunoIssues.ts`.
 *
 * Frontend types are kept narrow (string for status / chakra) so the UI can
 * iterate without a tight coupling to the DB-types path. The canonical sets
 * live in the server schema and are validated server-side via Zod.
 */
import { api } from "./client";

export const SUNO_CHAKRAS = [
  "ROOT",
  "SACRAL",
  "SOLAR",
  "HEART",
  "THROAT",
  "THIRD_EYE",
  "CROWN",
] as const;
export type SunoChakra = (typeof SUNO_CHAKRAS)[number];

export const SUNO_CHAKRA_FREQUENCIES: Record<SunoChakra, number> = {
  ROOT: 396,
  SACRAL: 417,
  SOLAR: 528,
  HEART: 639,
  THROAT: 741,
  THIRD_EYE: 852,
  CROWN: 963,
};

export const SUNO_STATUSES = [
  "DRAFT",
  "GENERATING",
  "REVIEW",
  "APPROVED",
  "PUBLISHED",
  "FAILED",
] as const;
export type SunoStatus = (typeof SUNO_STATUSES)[number];

/**
 * Pipeline-stage Kanban columns. The DB only stores 6 statuses; the UI groups
 * them visually. "GENERATING" splits visually into Lyrics+Prompt → Generating
 * → Visuals → Video purely via metadata.stage hints, but persists as a single
 * GENERATING status row. Keep this aligned with the SunoPipeline page below.
 */
export const SUNO_BOARD_COLUMNS = [
  "DRAFT",
  "GENERATING",
  "REVIEW",
  "APPROVED",
  "PUBLISHED",
  "FAILED",
] as const;

export interface SunoIssue {
  id: string;
  companyId: string;
  issueId: string | null;
  concept: string;
  targetChakra: SunoChakra;
  targetFrequency: number;
  genre: string | null;
  lyricsAgentId: string | null;
  soundAgentId: string | null;
  visualAgentId: string | null;
  sunoSongId: string | null;
  audioUrl: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  status: SunoStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSunoIssueInput {
  concept: string;
  targetChakra: SunoChakra;
  targetFrequency?: number;
  genre?: string | null;
  lyricsAgentId?: string | null;
  soundAgentId?: string | null;
  visualAgentId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateSunoIssueInput {
  concept?: string;
  targetChakra?: SunoChakra;
  targetFrequency?: number;
  genre?: string | null;
  lyricsAgentId?: string | null;
  soundAgentId?: string | null;
  visualAgentId?: string | null;
  sunoSongId?: string | null;
  audioUrl?: string | null;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  status?: SunoStatus;
  metadata?: Record<string, unknown>;
}

function withQuery(path: string, params: Record<string, string | undefined>) {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  ) as [string, string][];
  if (entries.length === 0) return path;
  const search = new URLSearchParams(entries).toString();
  return `${path}?${search}`;
}

export const sunoPipelineApi = {
  list: (companyId: string) =>
    api.get<SunoIssue[]>(withQuery("/suno-pipeline", { companyId })),
  create: (companyId: string, input: CreateSunoIssueInput) =>
    api.post<SunoIssue>("/suno-pipeline", { companyId, ...input }),
  update: (id: string, companyId: string, input: UpdateSunoIssueInput) =>
    api.patch<SunoIssue>(
      withQuery(`/suno-pipeline/${encodeURIComponent(id)}`, { companyId }),
      { companyId, ...input },
    ),
};
