/**
 * Structured logger for ArchGuard.
 *
 * Writes debug logs to `.archguard/logs/` automatically so users can
 * share log files when filing issues.  Optionally echoes verbose output
 * to the console when `--verbose` is active.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Types ──────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface LoggerOptions {
  /** Project directory — logs go to `<projectDir>/.archguard/logs/` */
  projectDir: string;
  /** If true, also print verbose output to the console */
  verbose?: boolean;
  /** An optional callback invoked on every log entry (for testing / custom sinks) */
  onLog?: (entry: LogEntry) => void;
}

// ─── Log level ordering ─────────────────────────────────────────────

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ─── Logger ─────────────────────────────────────────────────────────

export class Logger {
  private logFilePath: string;
  private verbose: boolean;
  private onLog?: (entry: LogEntry) => void;
  private entries: LogEntry[] = [];
  private fileStream: fs.WriteStream | null = null;

  constructor(opts: LoggerOptions) {
    this.verbose = opts.verbose ?? false;
    this.onLog = opts.onLog;

    // Ensure log directory exists
    const logDir = path.join(opts.projectDir, '.archguard', 'logs');
    fs.mkdirSync(logDir, { recursive: true });

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, 19);
    this.logFilePath = path.join(logDir, `analyze-${timestamp}.log`);

    // Open write stream for append
    this.fileStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
    this.info('logger', 'Log session started', { logFile: this.logFilePath });
  }

  /** Path to the current log file */
  get filePath(): string {
    return this.logFilePath;
  }

  /** All entries captured this session (in-memory) */
  get allEntries(): readonly LogEntry[] {
    return this.entries;
  }

  // ── Public logging methods ────────────────────────────────────────

  debug(category: string, message: string, data?: Record<string, unknown>): void {
    this.log('debug', category, message, data);
  }

  info(category: string, message: string, data?: Record<string, unknown>): void {
    this.log('info', category, message, data);
  }

  warn(category: string, message: string, data?: Record<string, unknown>): void {
    this.log('warn', category, message, data);
  }

  error(category: string, message: string, data?: Record<string, unknown>): void {
    this.log('error', category, message, data);
  }

  // ── Specialised helpers ───────────────────────────────────────────

  /** Log an LLM request being sent */
  llmRequest(opts: {
    operation: string;
    model: string;
    inputTokens: number;
    filesIncluded?: number;
    filesList?: string[];
  }): void {
    this.info('llm', `Sending ${opts.operation} request to ${opts.model}`, {
      inputTokens: opts.inputTokens,
      filesIncluded: opts.filesIncluded,
      ...(opts.filesList ? { filesList: opts.filesList } : {}),
    });
  }

  /** Log an LLM response received */
  llmResponse(opts: {
    operation: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    cost: number;
    cacheHit: boolean;
  }): void {
    this.info('llm', `Response from ${opts.model} (${opts.operation})`, {
      inputTokens: opts.inputTokens,
      outputTokens: opts.outputTokens,
      latencyMs: opts.latencyMs,
      cost: `$${opts.cost.toFixed(6)}`,
      cacheHit: opts.cacheHit,
    });
  }

  /** Log an LLM error with full API details */
  llmError(opts: {
    operation: string;
    model: string;
    statusCode?: number;
    errorType?: string;
    errorMessage: string;
    rawResponse?: string;
    attempt?: number;
    maxAttempts?: number;
  }): void {
    const data: Record<string, unknown> = {
      operation: opts.operation,
      model: opts.model,
    };
    if (opts.statusCode !== undefined) data.statusCode = opts.statusCode;
    if (opts.errorType) data.errorType = opts.errorType;
    if (opts.attempt !== undefined) data.attempt = `${opts.attempt}/${opts.maxAttempts ?? '?'}`;
    if (opts.rawResponse) {
      data.rawResponsePreview = opts.rawResponse.slice(0, 500);
    }
    this.error('llm', opts.errorMessage, data);
  }

  /** Log a JSON validation failure with the raw LLM output */
  jsonParseFailure(rawResponse: string, parseError: string): void {
    this.error('llm', 'JSON parse/validation failure', {
      parseError,
      rawResponseFirst500: rawResponse.slice(0, 500),
      rawResponseLength: rawResponse.length,
    });
  }

  /** Log file scanning progress */
  scanProgress(opts: {
    phase: string;
    filesScanned?: number;
    totalFiles?: number;
    currentFile?: string;
  }): void {
    this.debug('scan', opts.phase, {
      ...(opts.filesScanned !== undefined ? { filesScanned: opts.filesScanned } : {}),
      ...(opts.totalFiles !== undefined ? { totalFiles: opts.totalFiles } : {}),
      ...(opts.currentFile ? { currentFile: opts.currentFile } : {}),
    });
  }

  /** Flush and close the log file */
  close(): void {
    this.info('logger', 'Log session ended', {
      totalEntries: this.entries.length,
    });
    if (this.fileStream) {
      this.fileStream.end();
      this.fileStream = null;
    }
  }

  // ── Core write ────────────────────────────────────────────────────

  private log(
    level: LogLevel,
    category: string,
    message: string,
    data?: Record<string, unknown>
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      ...(data ? { data } : {}),
    };

    this.entries.push(entry);
    this.onLog?.(entry);

    // Write to file (always)
    const fileLine = this.formatForFile(entry);
    this.fileStream?.write(fileLine + '\n');

    // Write to console only if verbose and level >= info (skip debug unless verbose)
    if (this.verbose && LEVEL_PRIORITY[level] >= LEVEL_PRIORITY['debug']) {
      // console verbose output is handled by the CLI layer via onLog
      // but we also print error-level entries unconditionally
    }
  }

  private formatForFile(entry: LogEntry): string {
    const ts = entry.timestamp;
    const lvl = entry.level.toUpperCase().padEnd(5);
    const cat = `[${entry.category}]`.padEnd(10);
    let line = `${ts} ${lvl} ${cat} ${entry.message}`;
    if (entry.data) {
      line += ' ' + JSON.stringify(entry.data);
    }
    return line;
  }
}

// ─── Global singleton (set once per CLI run) ────────────────────────

let globalLogger: Logger | null = null;

/** Initialise the global logger. Call once at CLI startup. */
export function initLogger(opts: LoggerOptions): Logger {
  if (globalLogger) {
    globalLogger.close();
  }
  globalLogger = new Logger(opts);
  return globalLogger;
}

/** Get the current global logger, or a no-op stub if none initialised. */
export function getLogger(): Logger {
  if (!globalLogger) {
    // Return a lightweight stub that silently discards logs.
    // This is safe for library code that logs but is called outside the CLI.
    return new Proxy({} as Logger, {
      get(_target, prop) {
        if (prop === 'filePath') return '';
        if (prop === 'allEntries') return [];
        if (prop === 'close') return () => {};
        // All logging methods become no-ops
        return () => {};
      },
    }) as Logger;
  }
  return globalLogger;
}
