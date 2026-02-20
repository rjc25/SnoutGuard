/**
 * Anthropic LLM client wrapper with caching support.
 * Provides a unified interface for making Claude API calls
 * with response caching to avoid redundant analysis.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as crypto from 'node:crypto';
import type { ArchGuardConfig } from './types.js';

/** In-memory LLM response cache */
const responseCache = new Map<string, { response: string; expiresAt: number }>();

/** Create an Anthropic client from config */
export function createLlmClient(config: ArchGuardConfig): Anthropic {
  const apiKey = process.env[config.llm.apiKeyEnv];
  if (!apiKey) {
    throw new Error(
      `Missing API key. Set the ${config.llm.apiKeyEnv} environment variable.`
    );
  }
  return new Anthropic({ apiKey });
}

/** Options for an LLM analysis call */
export interface AnalysisOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Run an LLM analysis with caching.
 * Returns cached results if available and not expired.
 */
export async function analyzeWithLlm(
  client: Anthropic,
  config: ArchGuardConfig,
  options: AnalysisOptions
): Promise<string> {
  const cacheKey = computeCacheKey(options);
  const cached = responseCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.response;
  }

  const message = await client.messages.create({
    model: config.llm.model,
    max_tokens: options.maxTokens ?? config.llm.maxTokensPerAnalysis,
    temperature: options.temperature ?? 0.3,
    system: options.systemPrompt,
    messages: [{ role: 'user', content: options.userPrompt }],
  });

  const response = message.content
    .filter((block) => block.type === 'text')
    .map((block) => {
      if (block.type === 'text') return block.text;
      return '';
    })
    .join('');

  // Cache the response
  const ttlMs = config.llm.cacheTtlHours * 60 * 60 * 1000;
  responseCache.set(cacheKey, {
    response,
    expiresAt: Date.now() + ttlMs,
  });

  return response;
}

/**
 * Stream an LLM response for CLI progress display.
 * Yields text chunks as they arrive.
 */
export async function* streamAnalysis(
  client: Anthropic,
  config: ArchGuardConfig,
  options: AnalysisOptions
): AsyncGenerator<string> {
  const stream = client.messages.stream({
    model: config.llm.model,
    max_tokens: options.maxTokens ?? config.llm.maxTokensPerAnalysis,
    temperature: options.temperature ?? 0.3,
    system: options.systemPrompt,
    messages: [{ role: 'user', content: options.userPrompt }],
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield event.delta.text;
    }
  }
}

/** Clear the response cache */
export function clearCache(): void {
  responseCache.clear();
}

/** Compute a cache key from analysis options */
function computeCacheKey(options: AnalysisOptions): string {
  const input = `${options.systemPrompt}::${options.userPrompt}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}
