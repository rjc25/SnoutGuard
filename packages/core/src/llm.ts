/**
 * Production-grade Anthropic LLM client.
 *
 * Features:
 * - API key enforcement with clear error messages
 * - Exponential backoff retry (configurable retries, 1s/2s/4s delays)
 * - Per-operation model selection (analyze=Opus, review/mcp/summary=Sonnet)
 * - Zod schema validation on responses
 * - Token counting to avoid context window overflows
 * - Cost tracking with per-call logging
 * - In-memory response caching with TTL
 * - Structured error types
 * - Request timeout handling
 */

import Anthropic from '@anthropic-ai/sdk';
import * as crypto from 'node:crypto';
import { z, type ZodSchema } from 'zod';
import type { ArchGuardConfig, LlmCallRecord } from './types.js';
import { generateId, now, sleep } from './utils.js';
import { getLogger } from './logger.js';

// ─── Error Types ───────────────────────────────────────────────────

export class LlmError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'LlmError';
  }
}

export class LlmAuthError extends LlmError {
  constructor(apiKeyEnv: string) {
    super(
      `\nAnthopic API key required.\n\n` +
      `ArchGuard uses Claude to analyze your codebase architecture.\n` +
      `Set your API key as an environment variable:\n\n` +
      `  export ${apiKeyEnv}=sk-ant-...\n\n` +
      `Get an API key at: https://console.anthropic.com/settings/keys\n`,
      'AUTH_MISSING'
    );
    this.name = 'LlmAuthError';
  }
}

export class LlmRateLimitError extends LlmError {
  constructor(public readonly retryAfterMs: number) {
    super(`Rate limited by Anthropic API. Retry after ${retryAfterMs}ms.`, 'RATE_LIMIT');
    this.name = 'LlmRateLimitError';
  }
}

export class LlmValidationError extends LlmError {
  constructor(
    message: string,
    public readonly rawResponse: string,
    public readonly zodErrors?: z.ZodError
  ) {
    super(message, 'VALIDATION_FAILED');
    this.name = 'LlmValidationError';
  }
}

/**
 * Map an error to a human-readable failure reason for the final
 * "Analysis failed" message.
 */
export function getFailureReason(error: unknown): string {
  if (error instanceof LlmAuthError) return 'API key invalid or missing';
  if (error instanceof LlmRateLimitError) return 'API rate limited';
  if (error instanceof LlmCostLimitError) return 'Cost limit reached';
  if (error instanceof LlmValidationError) {
    if (error.zodErrors) return 'JSON schema validation failed';
    return 'JSON parse failed — could not extract valid JSON from LLM response';
  }
  if (error instanceof LlmError) {
    if (error.code === 'CONTEXT_OVERFLOW') return 'Context window exceeded';
    if (error.code === 'AUTH_FAILED') return 'API authentication failed';
    if (error.code === 'MAX_RETRIES') return 'LLM call failed after retries';
    return `LLM error (${error.code})`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export class LlmCostLimitError extends LlmError {
  constructor(currentCost: number, limit: number) {
    super(
      `Cost limit exceeded: $${currentCost.toFixed(4)} spent this run (limit: $${limit.toFixed(2)}). ` +
      `Increase llm.max_cost_per_run in .archguard.yml or set to 0 to disable.`,
      'COST_LIMIT'
    );
    this.name = 'LlmCostLimitError';
  }
}

// ─── Cost Tracking ─────────────────────────────────────────────────

/** Pricing per million tokens by model (input/output) */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 15.0, output: 75.0 },
  'claude-opus-4-5-20250514': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-5-20241022': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.0 },
};

/** In-memory cost accumulator for current run */
let runCostAccumulator = 0;
const callHistory: LlmCallRecord[] = [];

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? { input: 3.0, output: 15.0 };
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

/** Reset cost accumulator (call at start of each CLI run) */
export function resetRunCost(): void {
  runCostAccumulator = 0;
  callHistory.length = 0;
}

/** Get current run cost */
export function getRunCost(): number {
  return runCostAccumulator;
}

/** Get call history for cost reporting */
export function getCallHistory(): LlmCallRecord[] {
  return [...callHistory];
}

// ─── Cache ─────────────────────────────────────────────────────────

const responseCache = new Map<string, { response: string; expiresAt: number }>();

/** Clear the response cache */
export function clearCache(): void {
  responseCache.clear();
}

function computeCacheKey(model: string, options: AnalysisOptions): string {
  const input = `${model}::${options.systemPrompt}::${options.userPrompt}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

// ─── Token Estimation ──────────────────────────────────────────────

/** Rough token count estimation (~4 chars per token for English) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/** Max context windows by model family */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4-6': 200_000,
  'claude-sonnet-4-6': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
};

function getContextWindow(model: string): number {
  return MODEL_CONTEXT_WINDOWS[model] ?? 200_000;
}

// ─── Client Creation ───────────────────────────────────────────────

/** LLM operation type for model selection */
export type LlmOperation = 'analyze' | 'review' | 'mcp' | 'summary' | 'sync';

/**
 * Validate that the API key is configured.
 * Throws LlmAuthError with setup instructions if missing.
 */
export function requireApiKey(config: ArchGuardConfig): string {
  const apiKey = process.env[config.llm.apiKeyEnv];
  if (!apiKey) {
    throw new LlmAuthError(config.llm.apiKeyEnv);
  }
  if (!apiKey.startsWith('sk-ant-')) {
    throw new LlmError(
      `Invalid API key format. Anthropic API keys start with "sk-ant-". ` +
      `Check the value of ${config.llm.apiKeyEnv}.`,
      'AUTH_INVALID'
    );
  }
  return apiKey;
}

/** Create an Anthropic client from config. Throws LlmAuthError if no API key. */
export function createLlmClient(config: ArchGuardConfig): Anthropic {
  const apiKey = requireApiKey(config);
  return new Anthropic({
    apiKey,
    timeout: config.llm.requestTimeoutMs,
  });
}

/** Get the model to use for a specific operation */
export function getModelForOperation(config: ArchGuardConfig, operation: LlmOperation): string {
  return config.llm.models[operation];
}

// ─── Analysis Options ──────────────────────────────────────────────

/** Options for an LLM analysis call */
export interface AnalysisOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

// ─── Main API Call with Retry ──────────────────────────────────────

/**
 * Run an LLM analysis with retry, caching, cost tracking, and validation.
 *
 * @param client - Anthropic client
 * @param config - ArchGuard config
 * @param options - Prompt options
 * @param operation - Which operation this is for (determines model)
 * @returns Raw text response from Claude
 */
export async function analyzeWithLlm(
  client: Anthropic,
  config: ArchGuardConfig,
  options: AnalysisOptions,
  operation: LlmOperation = 'analyze'
): Promise<string> {
  const model = getModelForOperation(config, operation);

  // Check cache
  const cacheKey = computeCacheKey(model, options);
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    // Log cache hit
    callHistory.push({
      id: generateId(),
      model,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      latencyMs: 0,
      operation,
      cacheHit: true,
      timestamp: now(),
    });
    return cached.response;
  }

  // Estimate input tokens and check against context window
  const inputEstimate = estimateTokens(options.systemPrompt + options.userPrompt);
  const maxOutput = options.maxTokens ?? config.llm.maxTokensPerAnalysis;
  const contextWindow = getContextWindow(model);

  if (inputEstimate + maxOutput > contextWindow * 0.95) {
    throw new LlmError(
      `Prompt too large: ~${inputEstimate} input tokens + ${maxOutput} max output tokens ` +
      `exceeds ${contextWindow} context window for ${model}. Reduce input size.`,
      'CONTEXT_OVERFLOW'
    );
  }

  // Check cost limit before making the call
  if (config.llm.maxCostPerRun > 0) {
    const estimatedCallCost = estimateCost(model, inputEstimate, maxOutput);
    if (runCostAccumulator + estimatedCallCost > config.llm.maxCostPerRun) {
      throw new LlmCostLimitError(runCostAccumulator + estimatedCallCost, config.llm.maxCostPerRun);
    }
  }

  // Retry loop with exponential backoff
  const maxRetries = config.llm.maxRetries;
  const baseDelay = config.llm.retryBaseDelayMs;
  let lastError: Error | undefined;
  const log = getLogger();

  log.llmRequest({
    operation,
    model,
    inputTokens: inputEstimate,
  });

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = baseDelay * Math.pow(2, attempt - 1);
      log.debug('llm', `Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay`);
      await sleep(delay);
    }

    const startTime = Date.now();

    try {
      const message = await client.messages.create({
        model,
        max_tokens: maxOutput,
        temperature: options.temperature ?? 0.3,
        system: options.systemPrompt,
        messages: [{ role: 'user', content: options.userPrompt }],
      });

      const latencyMs = Date.now() - startTime;
      const response = message.content
        .filter((block) => block.type === 'text')
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('');

      // Track cost
      const inputTokens = message.usage?.input_tokens ?? inputEstimate;
      const outputTokens = message.usage?.output_tokens ?? estimateTokens(response);
      const cost = estimateCost(model, inputTokens, outputTokens);
      runCostAccumulator += cost;

      const record: LlmCallRecord = {
        id: generateId(),
        model,
        inputTokens,
        outputTokens,
        estimatedCost: cost,
        latencyMs,
        operation,
        cacheHit: false,
        timestamp: now(),
      };
      callHistory.push(record);

      log.llmResponse({
        operation,
        model,
        inputTokens,
        outputTokens,
        latencyMs,
        cost,
        cacheHit: false,
      });

      // Cache the response
      const ttlMs = config.llm.cacheTtlHours * 60 * 60 * 1000;
      responseCache.set(cacheKey, {
        response,
        expiresAt: Date.now() + ttlMs,
      });

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const latencyMs = Date.now() - startTime;

      // Extract Anthropic API error details if available
      const apiError = error as { status?: number; error?: { type?: string; message?: string } };
      const statusCode = apiError.status;
      const errorType = apiError.error?.type;

      log.llmError({
        operation,
        model,
        statusCode,
        errorType,
        errorMessage: lastError.message,
        attempt: attempt + 1,
        maxAttempts: maxRetries + 1,
      });

      // Don't retry auth errors
      if (statusCode === 401 || lastError.message.includes('401') || lastError.message.includes('authentication')) {
        throw new LlmError(
          `Anthropic API authentication failed. Check your API key (${config.llm.apiKeyEnv}).`,
          'AUTH_FAILED'
        );
      }

      // Don't retry validation errors
      if (error instanceof LlmValidationError) {
        throw error;
      }

      // Rate limit — respect retry-after header if available
      if (statusCode === 429 || lastError.message.includes('429')) {
        const retryAfter = baseDelay * Math.pow(2, attempt + 1);
        log.warn('llm', `Rate limited. Waiting ${retryAfter}ms before retry.`);
        if (attempt === maxRetries) {
          throw new LlmRateLimitError(retryAfter);
        }
        await sleep(retryAfter);
        continue;
      }

      // Other errors: retry if we have attempts left
      if (attempt === maxRetries) {
        throw new LlmError(
          `LLM call failed after ${maxRetries + 1} attempts: ${lastError.message}`,
          'MAX_RETRIES'
        );
      }
    }
  }

  throw lastError ?? new LlmError('Unknown LLM error', 'UNKNOWN');
}

/**
 * Run an LLM analysis and validate the response with a Zod schema.
 * Retries with a refined prompt if validation fails.
 */
export async function analyzeWithLlmValidated<T>(
  client: Anthropic,
  config: ArchGuardConfig,
  options: AnalysisOptions,
  schema: ZodSchema<T>,
  operation: LlmOperation = 'analyze'
): Promise<T> {
  const maxValidationRetries = 2;
  const log = getLogger();

  for (let attempt = 0; attempt <= maxValidationRetries; attempt++) {
    const promptToUse = attempt === 0
      ? options
      : {
          ...options,
          userPrompt: options.userPrompt +
            `\n\nIMPORTANT: Your previous response did not match the required JSON schema. ` +
            `Please respond with ONLY valid JSON matching the exact schema specified. ` +
            `No markdown, no code fences, no explanatory text — pure JSON only.`,
        };

    if (attempt > 0) {
      log.warn('llm', `JSON validation retry ${attempt}/${maxValidationRetries} — re-prompting LLM`);
    }

    const raw = await analyzeWithLlm(client, config, promptToUse, operation);
    const jsonStr = extractJson(raw);

    if (!jsonStr) {
      log.jsonParseFailure(raw, 'Could not extract JSON object/array from response');
      if (attempt === maxValidationRetries) {
        throw new LlmValidationError(
          `Could not extract valid JSON from LLM response after ${maxValidationRetries + 1} attempts`,
          raw
        );
      }
      continue;
    }

    try {
      const parsed = JSON.parse(jsonStr);
      const result = schema.parse(parsed);
      log.debug('llm', 'JSON validation passed');
      return result;
    } catch (error) {
      const parseMsg = error instanceof z.ZodError
        ? error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : String(error);
      log.jsonParseFailure(raw, parseMsg);
      if (attempt === maxValidationRetries) {
        throw new LlmValidationError(
          `LLM response failed schema validation after ${maxValidationRetries + 1} attempts`,
          raw,
          error instanceof z.ZodError ? error : undefined
        );
      }
    }
  }

  throw new LlmError('Validation retry loop exited unexpectedly', 'UNKNOWN');
}

/**
 * Stream an LLM response for CLI progress display.
 * Yields text chunks as they arrive.
 */
export async function* streamAnalysis(
  client: Anthropic,
  config: ArchGuardConfig,
  options: AnalysisOptions,
  operation: LlmOperation = 'analyze'
): AsyncGenerator<string> {
  const model = getModelForOperation(config, operation);

  const stream = client.messages.stream({
    model,
    max_tokens: options.maxTokens ?? config.llm.maxTokensPerAnalysis,
    temperature: options.temperature ?? 0.3,
    system: options.systemPrompt,
    messages: [{ role: 'user', content: options.userPrompt }],
  });

  let fullResponse = '';
  const startTime = Date.now();

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      fullResponse += event.delta.text;
      yield event.delta.text;
    }
  }

  // Track cost for streamed responses
  const latencyMs = Date.now() - startTime;
  const inputTokens = estimateTokens(options.systemPrompt + options.userPrompt);
  const outputTokens = estimateTokens(fullResponse);
  const cost = estimateCost(model, inputTokens, outputTokens);
  runCostAccumulator += cost;

  callHistory.push({
    id: generateId(),
    model,
    inputTokens,
    outputTokens,
    estimatedCost: cost,
    latencyMs,
    operation,
    cacheHit: false,
    timestamp: now(),
  });
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Extract JSON from an LLM response that may contain markdown code fences
 * or surrounding text.
 */
export function extractJson(text: string): string | null {
  // Strip markdown fences before parsing — handles both complete
  // (```json ... ```) and truncated (```json ... <eof>) responses
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
    .trim();

  // Try direct parse first
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      // Fall through to other extraction methods
    }
  }

  // Extract from code fences
  const codeFenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeFenceMatch) {
    const inner = codeFenceMatch[1].trim();
    try {
      JSON.parse(inner);
      return inner;
    } catch {
      // Fall through
    }
  }

  // Find JSON object or array anywhere in text
  for (const startChar of ['{', '[']) {
    const startIdx = trimmed.indexOf(startChar);
    if (startIdx === -1) continue;

    const endChar = startChar === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = startIdx; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === startChar) depth++;
      if (ch === endChar) depth--;
      if (depth === 0) {
        const candidate = trimmed.slice(startIdx, i + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          break;
        }
      }
    }
  }

  return null;
}
