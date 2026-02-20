/**
 * Cron-based auto-generation scheduler for work summaries.
 * Uses the cron library to manage scheduled summary generation
 * based on configuration from the .archguard.yml summaries section.
 */

import { CronJob } from 'cron';
import {
  loadConfig,
  type ArchGuardConfig,
  type SummaryType,
  type SummarySchedule,
} from '@archguard/core';

import { collectData, type CollectorOptions, type PullRequestInfo } from './collector.js';
import { generateSummary, type SummaryOptions } from './summarizer.js';

// ─── Types ────────────────────────────────────────────────────────

/** Callback invoked when a summary is generated */
export type SummaryCallback = (summary: Awaited<ReturnType<typeof generateSummary>>) => void | Promise<void>;

/** Callback invoked when a scheduled job encounters an error */
export type ErrorCallback = (error: Error, schedule: SummarySchedule) => void | Promise<void>;

/** Configuration for the summary scheduler */
export interface SchedulerConfig {
  /** Path to the project/repository directory */
  projectDir: string;
  /** Developer identifier (name or email) for data collection */
  developer: string;
  /** Display name for the developer in summaries */
  developerName: string;
  /** Team ID for generated summaries */
  teamId: string;
  /** Pre-loaded ArchGuard config (loaded from projectDir if not provided) */
  config?: ArchGuardConfig;
  /** Callback when a summary is successfully generated */
  onSummary?: SummaryCallback;
  /** Callback when an error occurs during generation */
  onError?: ErrorCallback;
  /** External PR data provider for collection */
  pullRequestProvider?: () => Promise<PullRequestInfo[]>;
}

/** Information about a running cron job */
interface ManagedJob {
  schedule: SummarySchedule;
  cronJob: CronJob;
  lastRun?: Date;
  lastError?: Error;
}

// ─── Scheduler Class ──────────────────────────────────────────────

/**
 * Manages multiple cron jobs for scheduled summary generation.
 * Reads schedule configuration from .archguard.yml and creates
 * a cron job for each configured summary schedule.
 */
export class SummaryScheduler {
  private readonly jobs: Map<string, ManagedJob> = new Map();
  private readonly config: ArchGuardConfig;
  private readonly schedulerConfig: SchedulerConfig;
  private running = false;

  constructor(schedulerConfig: SchedulerConfig) {
    this.schedulerConfig = schedulerConfig;
    this.config = schedulerConfig.config ?? loadConfig(schedulerConfig.projectDir);
  }

  /**
   * Start all configured summary cron jobs.
   * Reads schedules from config.summaries.schedules and creates
   * a CronJob for each one.
   */
  start(): void {
    if (this.running) {
      return;
    }

    const { summaries } = this.config;

    if (!summaries.enabled) {
      return;
    }

    for (const schedule of summaries.schedules) {
      this.addJob(schedule);
    }

    this.running = true;
  }

  /**
   * Stop all running cron jobs and clean up.
   */
  stop(): void {
    for (const [key, managed] of this.jobs.entries()) {
      managed.cronJob.stop();
      this.jobs.delete(key);
    }

    this.running = false;
  }

  /**
   * Add a single summary schedule as a cron job.
   * Can be used to dynamically add schedules beyond what's in config.
   */
  addJob(schedule: SummarySchedule): void {
    const jobKey = `${schedule.type}:${schedule.cron}`;

    // Stop existing job with the same key if present
    if (this.jobs.has(jobKey)) {
      this.jobs.get(jobKey)!.cronJob.stop();
    }

    const cronJob = new CronJob(
      schedule.cron,
      () => {
        void this.executeSummaryJob(schedule, jobKey);
      },
      null,   // onComplete
      false,  // start immediately (we start manually)
      'UTC'   // timezone
    );

    const managed: ManagedJob = {
      schedule,
      cronJob,
    };

    this.jobs.set(jobKey, managed);

    if (this.running) {
      cronJob.start();
    }
  }

  /**
   * Remove a specific job by its type and cron expression.
   */
  removeJob(type: SummaryType, cron: string): boolean {
    const jobKey = `${type}:${cron}`;
    const managed = this.jobs.get(jobKey);

    if (!managed) {
      return false;
    }

    managed.cronJob.stop();
    this.jobs.delete(jobKey);
    return true;
  }

  /**
   * Get the status of all managed jobs.
   */
  getStatus(): Array<{
    type: SummaryType;
    cron: string;
    running: boolean;
    lastRun?: Date;
    lastError?: string;
    slackChannel?: string;
  }> {
    return Array.from(this.jobs.values()).map((managed) => ({
      type: managed.schedule.type,
      cron: managed.schedule.cron,
      running: managed.cronJob.running ?? false,
      lastRun: managed.lastRun,
      lastError: managed.lastError?.message,
      slackChannel: managed.schedule.slackChannel,
    }));
  }

  /**
   * Check if the scheduler is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the number of active jobs.
   */
  getJobCount(): number {
    return this.jobs.size;
  }

  /**
   * Manually trigger a summary generation for a specific type.
   * Useful for testing or on-demand generation.
   */
  async triggerNow(type: SummaryType): Promise<void> {
    const schedule: SummarySchedule = {
      type,
      cron: '* * * * *', // dummy cron, not actually used for manual trigger
    };

    const jobKey = `manual:${type}`;
    await this.executeSummaryJob(schedule, jobKey);
  }

  // ─── Private Methods ────────────────────────────────────────────

  /**
   * Execute a summary generation job.
   * Collects data, generates the summary, and invokes callbacks.
   */
  private async executeSummaryJob(schedule: SummarySchedule, jobKey: string): Promise<void> {
    const managed = this.jobs.get(jobKey);

    try {
      const { periodStart, periodEnd, periodLabel } = computePeriod(
        schedule.type,
        this.config.summaries.sprintLengthDays,
      );

      // Gather external PR data if a provider is configured
      const pullRequests = this.schedulerConfig.pullRequestProvider
        ? await this.schedulerConfig.pullRequestProvider()
        : [];

      const collectorOptions: CollectorOptions = {
        repoPath: this.schedulerConfig.projectDir,
        developer: this.schedulerConfig.developer,
        periodStart,
        periodEnd,
        pullRequests,
      };

      const data = await collectData(collectorOptions);

      const summaryOptions: SummaryOptions = {
        data,
        type: schedule.type,
        developerName: this.schedulerConfig.developerName,
        period: periodLabel,
        teamId: this.schedulerConfig.teamId,
        config: this.config,
      };

      const summary = await generateSummary(summaryOptions);

      if (managed) {
        managed.lastRun = new Date();
        managed.lastError = undefined;
      }

      if (this.schedulerConfig.onSummary) {
        await this.schedulerConfig.onSummary(summary);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      if (managed) {
        managed.lastRun = new Date();
        managed.lastError = error;
      }

      if (this.schedulerConfig.onError) {
        await this.schedulerConfig.onError(error, schedule);
      }
    }
  }
}

// ─── Period Computation ───────────────────────────────────────────

/**
 * Compute the time period for a summary based on its type.
 * - standup: last 24 hours
 * - one_on_one: last 7 days
 * - sprint_review: uses sprintLengthDays from config (default 14)
 * - progress_report: last 30 days
 */
function computePeriod(type: SummaryType, sprintLengthDays = 14): {
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
} {
  const now = new Date();
  const periodEnd = now.toISOString().slice(0, 10);
  let periodStart: string;
  let periodLabel: string;

  switch (type) {
    case 'standup': {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      periodStart = yesterday.toISOString().slice(0, 10);
      periodLabel = `Daily standup for ${periodEnd}`;
      break;
    }
    case 'one_on_one': {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      periodStart = weekAgo.toISOString().slice(0, 10);
      periodLabel = `Week of ${periodStart} to ${periodEnd}`;
      break;
    }
    case 'sprint_review': {
      const sprintStart = new Date(now);
      sprintStart.setDate(sprintStart.getDate() - sprintLengthDays);
      periodStart = sprintStart.toISOString().slice(0, 10);
      periodLabel = `Sprint ${periodStart} to ${periodEnd}`;
      break;
    }
    case 'progress_report': {
      const monthAgo = new Date(now);
      monthAgo.setDate(monthAgo.getDate() - 30);
      periodStart = monthAgo.toISOString().slice(0, 10);
      periodLabel = `Progress report: ${periodStart} to ${periodEnd}`;
      break;
    }
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown summary type: ${_exhaustive}`);
    }
  }

  return { periodStart, periodEnd, periodLabel };
}
