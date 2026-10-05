// Per-job state + lane queue for whole-novel batch translations.
//
// Lanes cap how many batches run at once: Google-only "fast" batches and local-LLM (Ollama)
// polish batches allow 2 each; cloud-LLM polish (Gemini/OpenRouter) runs one novel at a time
// and later ones wait in FIFO order.
//
// ponytail: in-process state. Correct under the single custom server (server.js); a PM2 cluster
// would need this in the DB. Jobs are lost on restart (same as the old global flags).

export type Lane = 'fast' | 'local' | 'cloud';

export const LANE_CAP: Record<Lane, number> = { fast: 2, local: 2, cloud: 1 };

export interface BatchJob {
  id: string;
  lane: Lane;
  initiatorUserId?: string;
  novelId: string;
  running: boolean;
  isPaused: boolean;
  isCancelled: boolean;
  /** Last progress payload, replayed to the initiator's widget after a page refresh. */
  payload: Record<string, any>;
}

const g = global as any;
const jobs: Map<string, BatchJob> = g.__batchJobs ?? (g.__batchJobs = new Map());

export async function laneFor(enablePolish: boolean, providerOverride?: string): Promise<Lane> {
  if (!enablePolish) return 'fast';
  // Lazy import keeps this module prisma-free, so batchJobs.check.mts runs under plain node.
  const { resolveProvider } = await import('./aiSettings');
  const { provider } = await resolveProvider({ provider: providerOverride });
  return provider === 'ollama' ? 'local' : 'cloud';
}

/** Jobs in a lane in arrival order (Map keeps insertion order). */
function inLane(lane: Lane) {
  return [...jobs.values()].filter((j) => j.lane === lane && !j.isCancelled);
}

export function isLaneFull(lane: Lane): boolean {
  return inLane(lane).length >= LANE_CAP[lane];
}

export function createJob(job: Omit<BatchJob, 'id' | 'running' | 'isPaused' | 'isCancelled'>): BatchJob {
  const created: BatchJob = { ...job, id: crypto.randomUUID(), running: false, isPaused: false, isCancelled: false };
  jobs.set(created.id, created);
  return created;
}

/**
 * Wait until this job may run. Calls onWait(position) whenever its place in the queue changes.
 * Returns false if the job was cancelled while waiting.
 * ponytail: 1s poll instead of a waiter list, so cancel and position updates need no extra wiring.
 */
export async function waitForTurn(job: BatchJob, onWait: (position: number) => void): Promise<boolean> {
  let lastPos = -1;
  while (!job.isCancelled) {
    const lane = inLane(job.lane);
    const running = lane.filter((j) => j.running).length;
    const position = lane.filter((j) => !j.running).indexOf(job) + 1;
    if (running < LANE_CAP[job.lane] && position === 1) {
      job.running = true;
      return true;
    }
    if (position !== lastPos) {
      lastPos = position;
      onWait(position);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

export function finishJob(job: BatchJob) {
  jobs.delete(job.id);
}

/** Stop every batch for these novels (deleted/binned): no more scraping into rows that are gone. */
export function cancelNovelJobs(novelIds: string | string[]) {
  const ids = new Set(Array.isArray(novelIds) ? novelIds : [novelIds]);
  for (const job of jobs.values()) if (ids.has(job.novelId)) job.isCancelled = true;
}

export function jobsOf(userId: string): BatchJob[] {
  return [...jobs.values()].filter((j) => j.initiatorUserId === userId && !j.isCancelled);
}
