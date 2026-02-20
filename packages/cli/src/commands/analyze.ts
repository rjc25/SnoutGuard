/**
 * `archguard analyze` command.
 *
 * Runs a full codebase analysis using Claude (Opus by default).
 * Requires an Anthropic API key — the LLM IS the product.
 *
 * Features:
 * - Tapir-themed spinner animation during analysis
 * - Real-time step progress updates
 * - --verbose flag for detailed console output
 * - Automatic debug log file in .archguard/logs/
 * - Specific failure reasons on error
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  loadConfig,
  generateId,
  requireApiKey,
  getModelForOperation,
  initLogger,
  getLogger,
  getFailureReason,
  initializeDatabase,
  schema,
  LlmAuthError,
  LlmValidationError,
  type LogEntry,
} from '@archguard/core';
import { runAnalysis } from '@archguard/analyzer';
import { createTapirSpinner, TAPIR_ASCII } from '../tapir-spinner.js';

export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze')
    .description('Analyze the codebase for architectural decisions, patterns, and drift')
    .option('--path <dir>', 'Project directory to analyze', '.')
    .option('--json', 'Output results as JSON')
    .option('--output <file>', 'Write report to a file')
    .option('--verbose', 'Show detailed logs: files sent to LLM, token counts, response times')
    .option('--force', 'Bypass cache and run full analysis')
    .action(
      async (options: {
        path: string;
        json?: boolean;
        output?: string;
        verbose?: boolean;
        force?: boolean;
      }) => {
        const projectDir = path.resolve(options.path);
        const config = loadConfig(projectDir);
        const repoId = generateId();
        const verbose = options.verbose ?? false;

        // Initialise logger — always writes to .archguard/logs/
        const logger = initLogger({
          projectDir,
          verbose,
          onLog: verbose ? verboseConsoleHandler : undefined,
        });

        // Validate API key upfront with clear messaging
        try {
          requireApiKey(config);
        } catch (error) {
          if (error instanceof LlmAuthError) {
            console.error(chalk.red(error.message));
            process.exit(1);
          }
          throw error;
        }

        const model = getModelForOperation(config, 'analyze');

        // Print header
        console.log(chalk.magenta(TAPIR_ASCII));
        console.log(
          chalk.bold(`  Analyzing ${chalk.cyan(projectDir)}`)
        );
        console.log(
          chalk.gray(`  Model: ${model}`)
        );

        if (config.llm.maxCostPerRun > 0) {
          console.log(
            chalk.gray(`  Cost limit: $${config.llm.maxCostPerRun.toFixed(2)} per run`)
          );
        }
        console.log(
          chalk.gray(`  Log file: ${logger.filePath}`)
        );
        console.log('');

        const spinner = createTapirSpinner({ text: 'Scanning codebase...' }).start();

        try {
          const result = await runAnalysis(projectDir, config, {
            repoId,
            force: options.force,
            onProgress: (event) => {
              spinner.text = `[${event.step}/${event.totalSteps}] ${event.phase}${event.detail ? chalk.gray(` — ${event.detail}`) : ''}`;
            },
          });

          spinner.succeed(chalk.green('Analysis complete'));

          // Display summary
          console.log('');
          console.log(chalk.bold('  Results:'));
          console.log(
            `    Files scanned:      ${chalk.cyan(String(result.scanResult.totalFiles))}`
          );
          console.log(
            `    Total lines:        ${chalk.cyan(String(result.scanResult.totalLines))}`
          );
          console.log(
            `    Decisions found:    ${chalk.cyan(String(result.decisions.length))}`
          );
          console.log(
            `    Drift score:        ${formatDriftScore(result.drift.driftScore)}`
          );
          console.log(
            `    Drift events:       ${chalk.cyan(String(result.drift.events.length))}`
          );
          console.log(
            `    Layer violations:   ${result.layerViolations.length > 0 ? chalk.red(String(result.layerViolations.length)) : chalk.green('0')}`
          );

          // Language breakdown
          const langBreakdown = result.scanResult.languageBreakdown;
          if (Object.keys(langBreakdown).length > 0) {
            console.log(chalk.bold('\n  Languages:'));
            for (const [lang, lines] of Object.entries(langBreakdown)) {
              console.log(`    ${lang}: ${chalk.cyan(String(lines))} lines`);
            }
          }

          // Decisions summary
          if (result.decisions.length > 0) {
            console.log(chalk.bold('\n  Architectural Decisions:'));
            for (const decision of result.decisions.slice(0, 10)) {
              const confColor =
                decision.confidence >= 0.8
                  ? chalk.green
                  : decision.confidence >= 0.5
                    ? chalk.yellow
                    : chalk.gray;
              console.log(
                `    ${confColor(`[${Math.round(decision.confidence * 100)}%]`)} ${decision.title}`
              );
            }
            if (result.decisions.length > 10) {
              console.log(
                chalk.gray(
                  `    ... and ${result.decisions.length - 10} more`
                )
              );
            }
          }

          // Layer violations
          if (result.layerViolations.length > 0) {
            console.log(chalk.bold('\n  Layer Violations:'));
            for (const v of result.layerViolations.slice(0, 5)) {
              console.log(
                chalk.red(`    ${v.sourceLayer} -> ${v.targetLayer}: ${v.sourceFile}`)
              );
            }
            if (result.layerViolations.length > 5) {
              console.log(
                chalk.gray(`    ... and ${result.layerViolations.length - 5} more`)
              );
            }
          }

          // Cost summary
          console.log(chalk.bold('\n  LLM Cost:'));
          console.log(
            `    Total: ${chalk.yellow('$' + result.cost.totalCost.toFixed(4))}`
          );
          console.log(
            `    API calls: ${chalk.cyan(String(result.cost.calls.filter((c) => !c.cacheHit).length))}`
          );
          console.log(
            `    Cache hits: ${chalk.green(String(result.cost.calls.filter((c) => c.cacheHit).length))}`
          );

          // Per-call breakdown in verbose mode
          if (verbose && result.cost.calls.length > 0) {
            console.log(chalk.bold('\n  LLM Call Details:'));
            for (const call of result.cost.calls) {
              if (call.cacheHit) {
                console.log(chalk.gray(`    [cache hit] ${call.operation}`));
              } else {
                console.log(
                  `    ${chalk.cyan(call.operation)} ` +
                  chalk.gray(`${call.model} `) +
                  `in:${chalk.yellow(String(call.inputTokens))} ` +
                  `out:${chalk.yellow(String(call.outputTokens))} ` +
                  `${chalk.gray(call.latencyMs + 'ms')} ` +
                  chalk.yellow(`$${call.estimatedCost.toFixed(4)}`)
                );
              }
            }
          }

          // Persist decisions to local database so `archguard sync` can use them
          try {
            const db = initializeDatabase();
            const now = new Date().toISOString();
            const localOrgId = 'local-org';
            let localRepoId = repoId;

            // Ensure a local organization exists
            const existingOrg = db.select().from(schema.organizations).all();
            if (existingOrg.length === 0) {
              db.insert(schema.organizations).values({
                id: localOrgId,
                name: 'Local',
                slug: 'local',
                plan: 'free',
                createdAt: now,
                updatedAt: now,
              }).run();
            }

            // Ensure a local repository entry exists
            const existingRepo = db.select().from(schema.repositories).all();
            if (existingRepo.length > 0) {
              localRepoId = existingRepo[0].id;
            } else {
              db.insert(schema.repositories).values({
                id: localRepoId,
                orgId: existingOrg.length > 0 ? existingOrg[0].id : localOrgId,
                name: path.basename(projectDir),
                fullName: projectDir,
                provider: 'local',
                providerId: 'local',
                defaultBranch: 'main',
                cloneUrl: projectDir,
                createdAt: now,
              }).run();
            }

            // Clear previous decisions and evidence, then insert fresh ones
            db.delete(schema.decisions).run();
            db.delete(schema.evidence).run();
            
            for (const decision of result.decisions) {
              const decisionId = decision.id ?? generateId();
              
              // Insert the decision
              db.insert(schema.decisions).values({
                id: decisionId,
                repoId: localRepoId,
                title: decision.title,
                description: decision.description,
                category: decision.category,
                status: 'detected',
                confidence: decision.confidence,
                constraints: JSON.stringify(decision.constraints ?? []),
                relatedDecisions: JSON.stringify(decision.relatedDecisions ?? []),
                tags: JSON.stringify(decision.tags ?? []),
                detectedAt: now,
                updatedAt: now,
              }).run();
              
              // Insert evidence for this decision
              if (decision.evidence && decision.evidence.length > 0) {
                for (const ev of decision.evidence) {
                  db.insert(schema.evidence).values({
                    id: generateId(),
                    decisionId,
                    filePath: ev.filePath,
                    lineStart: ev.lineRange[0],
                    lineEnd: ev.lineRange[1],
                    snippet: ev.snippet,
                    explanation: ev.explanation,
                  }).run();
                }
              }
            }
            
            const totalEvidence = result.decisions.reduce((sum, d) => sum + (d.evidence?.length ?? 0), 0);
            logger.info('analysis', `Persisted ${result.decisions.length} decisions and ${totalEvidence} evidence items to local database`);
          } catch (dbError: unknown) {
            const dbMsg = dbError instanceof Error ? dbError.message : String(dbError);
            logger.warn('analysis', `Could not persist decisions to database: ${dbMsg}`);
          }

          // Output handling
          if (options.json) {
            const jsonOutput = JSON.stringify(result.jsonReport, null, 2);
            if (options.output) {
              const outputPath = path.resolve(options.output);
              fs.writeFileSync(outputPath, jsonOutput, 'utf-8');
              console.log(
                chalk.green(`\n  JSON report written to ${chalk.bold(outputPath)}`)
              );
            } else {
              console.log('\n' + jsonOutput);
            }
          } else if (options.output) {
            const outputPath = path.resolve(options.output);
            fs.writeFileSync(outputPath, result.markdownReport, 'utf-8');
            console.log(
              chalk.green(`\n  Report written to ${chalk.bold(outputPath)}`)
            );
          }

          console.log(
            chalk.gray(`\n  Full log: ${logger.filePath}`)
          );
          console.log('');
        } catch (error: unknown) {
          spinner.fail(chalk.red('Analysis failed'));

          // Determine specific failure reason
          const reason = getFailureReason(error);
          console.error(chalk.red(`\n  Reason: ${reason}`));

          // Show raw LLM response preview on JSON parse failures
          if (error instanceof LlmValidationError && error.rawResponse) {
            console.error(chalk.gray(`\n  LLM response preview (first 500 chars):`));
            console.error(chalk.gray(`  ${error.rawResponse.slice(0, 500)}`));
          }

          // Show zod errors if schema validation failed
          if (error instanceof LlmValidationError && error.zodErrors) {
            console.error(chalk.gray(`\n  Schema validation errors:`));
            for (const issue of error.zodErrors.issues.slice(0, 5)) {
              console.error(chalk.gray(`    ${issue.path.join('.')}: ${issue.message}`));
            }
          }

          // Always show log file location
          console.error(
            chalk.gray(`\n  Debug log: ${logger.filePath}`)
          );
          console.error(
            chalk.gray(`  Re-run with --verbose for detailed console output\n`)
          );

          // Log the full error to file
          const fullError = error instanceof Error ? error : new Error(String(error));
          logger.error('analysis', `Analysis failed: ${reason}`, {
            errorName: fullError.name,
            errorMessage: fullError.message,
            stack: fullError.stack,
          });

          logger.close();
          process.exit(1);
        }

        logger.close();
      }
    );
}

/** Format a drift score with color coding */
function formatDriftScore(score: number): string {
  const percent = Math.round(score * 100);
  if (percent <= 20) return chalk.green(`${percent}%`);
  if (percent <= 50) return chalk.yellow(`${percent}%`);
  return chalk.red(`${percent}%`);
}

/**
 * Console handler for --verbose mode.
 * Formats log entries for real-time console display.
 */
function verboseConsoleHandler(entry: LogEntry): void {
  const levelColors: Record<string, (s: string) => string> = {
    debug: chalk.gray,
    info: chalk.blue,
    warn: chalk.yellow,
    error: chalk.red,
  };
  const colorFn = levelColors[entry.level] ?? chalk.white;
  const prefix = colorFn(`  [${entry.level.toUpperCase()}]`);
  const cat = chalk.gray(`[${entry.category}]`);

  let line = `${prefix} ${cat} ${entry.message}`;
  if (entry.data) {
    const dataStr = Object.entries(entry.data)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ');
    line += chalk.gray(` ${dataStr}`);
  }

  // Use stderr so it doesn't interfere with --json stdout output
  process.stderr.write(line + '\n');
}
