/**
 * BullMQ queue setup for the SnoutGuard server.
 * Creates and manages named queues for asynchronous job processing:
 * analysis, review, velocity, summary, and sync.
 */

import { Queue, Worker, type Job, type Processor } from 'bullmq';
import IORedis from 'ioredis';

// ─── Redis Connection ─────────────────────────────────────────────

/** Redis connection options from environment */
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/** Shared Redis connection for all queues */
let connection: IORedis | null = null;

/**
 * Get or create the shared Redis connection.
 */
export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });
  }
  return connection;
}

// ─── Queue Names ──────────────────────────────────────────────────

export const QUEUE_NAMES = {
  ANALYSIS: 'snoutguard:analysis',
  REVIEW: 'snoutguard:review',
  VELOCITY: 'snoutguard:velocity',
  SUMMARY: 'snoutguard:summary',
  SYNC: 'snoutguard:sync',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ─── Queue Instances ──────────────────────────────────────────────

const queues = new Map<string, Queue>();
const workers = new Map<string, Worker>();

/**
 * Get or create a named queue.
 */
export function getQueue(name: QueueName): Queue {
  if (!queues.has(name)) {
    const queue = new Queue(name, {
      connection: getRedisConnection() as never,
      defaultJobOptions: {
        removeOnComplete: { age: 24 * 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600, count: 5000 },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    });
    queues.set(name, queue);
  }
  return queues.get(name)!;
}

// ─── Worker Registration ──────────────────────────────────────────

/**
 * Register a worker processor for a named queue.
 *
 * @param name - The queue name
 * @param processor - The job processing function
 * @param concurrency - Number of concurrent jobs (default: 1)
 */
export function registerWorker(
  name: QueueName,
  processor: Processor,
  concurrency: number = 1
): Worker {
  if (workers.has(name)) {
    return workers.get(name)!;
  }

  const worker = new Worker(name, processor, {
    connection: getRedisConnection() as never,
    concurrency,
    limiter: {
      max: concurrency * 2,
      duration: 60_000,
    },
  });

  // Error handler
  worker.on('failed', (job: Job | undefined, error: Error) => {
    console.error(
      `[${name}] Job ${job?.id ?? 'unknown'} failed (attempt ${job?.attemptsMade ?? 0}):`,
      error.message
    );
  });

  // Completion handler
  worker.on('completed', (job: Job) => {
    console.log(`[${name}] Job ${job.id} completed`);
  });

  workers.set(name, worker);
  return worker;
}

// ─── Job Helpers ──────────────────────────────────────────────────

/** Data shape for analysis jobs */
export interface AnalysisJobData {
  repoId: string;
  orgId: string;
  triggeredBy: string;
  options?: {
    useLlm?: boolean;
    branch?: string;
  };
}

/** Data shape for review jobs */
export interface ReviewJobData {
  repoId: string;
  orgId: string;
  prNumber?: number;
  ref: string;
  triggeredBy: 'webhook' | 'cli' | 'manual';
}

/** Data shape for velocity jobs */
export interface VelocityJobData {
  orgId: string;
  repoId?: string;
  period: 'daily' | 'weekly' | 'sprint' | 'monthly';
}

/** Data shape for summary jobs */
export interface SummaryJobData {
  orgId: string;
  type: 'one_on_one' | 'standup' | 'sprint_review' | 'progress_report';
  developerId?: string;
  periodStart: string;
  periodEnd: string;
}

/** Data shape for sync jobs */
export interface SyncJobData {
  repoId: string;
  orgId: string;
  formats?: string[];
}

// ─── Queue Convenience Methods ────────────────────────────────────

/**
 * Add an analysis job to the queue.
 */
export async function enqueueAnalysis(data: AnalysisJobData): Promise<string> {
  const queue = getQueue(QUEUE_NAMES.ANALYSIS);
  const job = await queue.add('analyze', data, {
    priority: 1,
  });
  return job.id ?? '';
}

/**
 * Add a review job to the queue.
 */
export async function enqueueReview(data: ReviewJobData): Promise<string> {
  const queue = getQueue(QUEUE_NAMES.REVIEW);
  const job = await queue.add('review', data, {
    priority: 2,
  });
  return job.id ?? '';
}

/**
 * Add a velocity calculation job to the queue.
 */
export async function enqueueVelocity(data: VelocityJobData): Promise<string> {
  const queue = getQueue(QUEUE_NAMES.VELOCITY);
  const job = await queue.add('velocity', data, {
    priority: 3,
  });
  return job.id ?? '';
}

/**
 * Add a summary generation job to the queue.
 */
export async function enqueueSummary(data: SummaryJobData): Promise<string> {
  const queue = getQueue(QUEUE_NAMES.SUMMARY);
  const job = await queue.add('summary', data, {
    priority: 3,
  });
  return job.id ?? '';
}

/**
 * Add a sync job to the queue.
 */
export async function enqueueSync(data: SyncJobData): Promise<string> {
  const queue = getQueue(QUEUE_NAMES.SYNC);
  const job = await queue.add('sync', data, {
    priority: 4,
  });
  return job.id ?? '';
}

// ─── Lifecycle ────────────────────────────────────────────────────

/**
 * Gracefully shut down all queues and workers.
 */
export async function shutdownQueues(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  for (const worker of workers.values()) {
    closePromises.push(worker.close());
  }

  for (const queue of queues.values()) {
    closePromises.push(queue.close());
  }

  await Promise.all(closePromises);

  if (connection) {
    connection.disconnect();
    connection = null;
  }

  workers.clear();
  queues.clear();
}

/**
 * Get the status of a job by queue name and job ID.
 */
export async function getJobStatus(
  queueName: QueueName,
  jobId: string
): Promise<{
  id: string;
  status: string;
  progress: number;
  data: unknown;
  failedReason?: string;
  finishedOn?: number;
  processedOn?: number;
} | null> {
  const queue = getQueue(queueName);
  const job = await queue.getJob(jobId);

  if (!job) return null;

  const state = await job.getState();

  return {
    id: job.id ?? jobId,
    status: state,
    progress: typeof job.progress === 'number' ? job.progress : 0,
    data: job.data,
    failedReason: job.failedReason,
    finishedOn: job.finishedOn,
    processedOn: job.processedOn,
  };
}
