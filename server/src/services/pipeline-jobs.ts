/**
 * Pipeline Job Queue — in-memory tracker for active auto-run jobs.
 *
 * When auto-run fires, it registers a job here, processes in the background,
 * and updates the job's stage/status as it progresses. The UI polls
 * GET /api/suno-pipeline/processing to see live progress.
 */

export interface PipelineJob {
  id: string;
  issueId: string;
  companyId: string;
  concept: string;
  musicBackend: string;
  /** Current stage being processed */
  currentStage: "assign" | "dispatch" | "soundPrompt" | "lyrics" | "visualPrompt" | "music" | "coverArt" | "releaseCopy" | "review" | "done" | "failed";
  /** Stages that have completed */
  completedStages: string[];
  /** Error message if failed */
  error: string | null;
  /** When the job started */
  startedAt: number;
  /** When the job finished (or null if still running) */
  finishedAt: number | null;
}

const activeJobs = new Map<string, PipelineJob>();

/** Register a new job. Returns the job object. */
export function createJob(issueId: string, companyId: string, concept: string, musicBackend: string): PipelineJob {
  const job: PipelineJob = {
    id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    issueId,
    companyId,
    concept,
    musicBackend,
    currentStage: "assign",
    completedStages: [],
    error: null,
    startedAt: Date.now(),
    finishedAt: null,
  };
  activeJobs.set(job.id, job);
  return job;
}

/** Update a job's current stage. */
export function advanceJob(jobId: string, completedStage: string, nextStage: PipelineJob["currentStage"]) {
  const job = activeJobs.get(jobId);
  if (!job) return;
  job.completedStages.push(completedStage);
  job.currentStage = nextStage;
}

/** Mark a job as complete. */
export function completeJob(jobId: string) {
  const job = activeJobs.get(jobId);
  if (!job) return;
  job.currentStage = "done";
  job.finishedAt = Date.now();
  // Remove after 60s so UI has time to see "done"
  setTimeout(() => activeJobs.delete(jobId), 60_000);
}

/** Mark a job as failed. */
export function failJob(jobId: string, error: string) {
  const job = activeJobs.get(jobId);
  if (!job) return;
  job.currentStage = "failed";
  job.error = error;
  job.finishedAt = Date.now();
  // Remove after 2 min
  setTimeout(() => activeJobs.delete(jobId), 120_000);
}

/** Get all active/recent jobs for a company. */
export function getJobs(companyId: string): PipelineJob[] {
  return Array.from(activeJobs.values())
    .filter((j) => j.companyId === companyId)
    .sort((a, b) => b.startedAt - a.startedAt);
}

/** Get a specific job. */
export function getJob(jobId: string): PipelineJob | undefined {
  return activeJobs.get(jobId);
}
