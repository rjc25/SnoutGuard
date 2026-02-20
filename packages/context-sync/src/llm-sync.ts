/**
 * LLM-powered context file generation.
 *
 * Instead of mechanically dumping every decision into a template,
 * sends all decisions to Opus which intelligently compresses,
 * prioritizes, and organizes them into an optimally dense context
 * file that fits within the configured token budget.
 *
 * The LLM is told the token limit and format requirements — it
 * handles prioritization and compression internally rather than
 * us enforcing a hard truncation.
 */

import type { ArchDecision, ArchGuardConfig, SyncFormat } from '@archguard/core';
import { createLlmClient, analyzeWithLlm } from '@archguard/core';
import { activeDecisions, sortByConfidence } from './templates.js';

/** Format-specific instructions for the LLM */
const FORMAT_INSTRUCTIONS: Record<string, string> = {
  claude: `Output format: Markdown (CLAUDE.md for Claude Code).
Start with "# Architecture" header.
Claude Code reads this file automatically when working in the repository.
Use ## sections, bullet lists, and code fences where helpful.
Write constraints as imperative rules ("You MUST...", "Never...", "Always...").`,

  cursorrules: `Output format: Plain text rules (.cursorrules for Cursor).
Write as a flat list of rules and constraints — no markdown headers.
Each rule should be a single clear sentence or short paragraph.
Cursor loads this as system-level context for every interaction.`,

  copilot: `Output format: Markdown (.github/copilot-instructions.md for GitHub Copilot).
Start with a brief project overview paragraph.
Use ## sections for major architectural areas.
Write constraints as clear directives.`,

  windsurf: `Output format: Plain text rules (.windsurfrules for Windsurf).
Similar to .cursorrules — flat list of architectural rules and patterns.
Keep entries concise and actionable.`,

  kiro: `Output format: Markdown (.kiro/steering.md for AWS Kiro).
Use ## sections for architectural areas.
Write constraints as steering directives that guide code generation.`,

  agents: `Output format: Markdown (agents.md for Agents.md format).
Use ## sections for major decisions.
Focus on constraints and patterns that autonomous agents need to follow.`,
};

/**
 * Generate a context file using LLM-powered intelligent compression.
 *
 * Sends all decisions to the configured sync model (default: Opus)
 * with a token budget. The LLM decides what to prioritize, how to
 * compress, and how to organize — producing a context file that
 * another AI agent will actually find useful.
 */
export async function generateWithLlm(
  decisions: ArchDecision[],
  config: ArchGuardConfig,
  format: SyncFormat,
): Promise<string> {
  const client = createLlmClient(config);
  const active = sortByConfidence(activeDecisions(decisions));
  const maxTokens = config.sync.maxContextTokens;
  // Double the budget for LLM output so it has room to work,
  // then the LLM self-limits to the stated target
  const outputMaxTokens = maxTokens * 2;

  const formatInstructions = FORMAT_INSTRUCTIONS[format]
    ?? FORMAT_INSTRUCTIONS['claude'];

  const decisionsXml = active.map((d: ArchDecision, i: number) => {
    const constraintsBlock = d.constraints.length > 0
      ? `\n    <constraints>\n${d.constraints.map((c: string) => `      <constraint>${c}</constraint>`).join('\n')}\n    </constraints>`
      : '';
    const evidenceBlock = d.evidence.length > 0
      ? `\n    <evidence>\n${d.evidence.slice(0, 5).map((e: ArchDecision['evidence'][0]) => `      <file path="${e.filePath}" lines="${e.lineRange[0]}-${e.lineRange[1]}">${e.explanation}</file>`).join('\n')}\n    </evidence>`
      : '';
    const tagsBlock = d.tags.length > 0
      ? `\n    <tags>${d.tags.join(', ')}</tags>`
      : '';

    return `  <decision index="${i + 1}" category="${d.category}" confidence="${Math.round(d.confidence * 100)}%" status="${d.status}">
    <title>${d.title}</title>
    <description>${d.description}</description>${constraintsBlock}${evidenceBlock}${tagsBlock}
  </decision>`;
  }).join('\n');

  const systemPrompt = `You are an expert software architect writing a context file that will be loaded into an AI coding agent's system prompt every time it works on this codebase.

Your job: take the raw architectural decisions below and produce the most useful, dense, and well-organized context file possible.

Critical rules:
- Your output IS the context file. Do not wrap it in code fences or add meta-commentary.
- You have a budget of approximately ${maxTokens} tokens for the output. Stay within this budget. This is roughly ${Math.round(maxTokens * 3.5)} characters. Do NOT exceed this — the file must be concise enough to fit in every agent session.
- Prioritize ruthlessly: constraints that prevent real mistakes matter more than descriptions of what the code does.
- Merge related decisions into coherent sections rather than listing each one separately.
- Write constraints as imperative rules the agent must follow ("Always...", "Never...", "You MUST...").
- Omit low-confidence decisions (below 70%) unless their constraints are critical.
- Include key file paths where patterns are exemplified, but don't list every evidence location.
- The target reader is an AI coding agent, not a human. Optimize for machine comprehension.

${formatInstructions}`;

  const userPrompt = `<project>
  <languages>${config.analysis.languages.join(', ')}</languages>
  <total_decisions>${active.length}</total_decisions>
  <token_budget>${maxTokens}</token_budget>
</project>

<decisions>
${decisionsXml}
</decisions>

Generate the context file now. Remember: stay within ~${maxTokens} tokens. Prioritize constraints that prevent architectural violations. Merge related decisions. Write for an AI agent, not a human.`;

  const response = await analyzeWithLlm(
    client,
    config,
    {
      systemPrompt,
      userPrompt,
      maxTokens: outputMaxTokens,
      temperature: 0.2,
    },
    'sync',
  );

  return response;
}
