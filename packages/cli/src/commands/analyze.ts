/**
 * `archguard analyze` command.
 *
 * Runs a full codebase analysis using Claude (Opus by default).
 * Requires an Anthropic API key — the LLM IS the product.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  loadConfig,
  generateId,
  requireApiKey,
  getModelForOperation,
  LlmAuthError,
} from '@archguard/core';
import { runAnalysis } from '@archguard/analyzer';

export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze')
    .description('Analyze the codebase for architectural decisions, patterns, and drift')
    .option('--path <dir>', 'Project directory to analyze', '.')
    .option('--json', 'Output results as JSON')
    .option('--output <file>', 'Write report to a file')
    .action(
      async (options: {
        path: string;
        json?: boolean;
        output?: string;
      }) => {
        const projectDir = path.resolve(options.path);
        const config = loadConfig(projectDir);
        const repoId = generateId();

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
        console.log(
          chalk.bold(`\n  Analyzing ${chalk.cyan(projectDir)}`)
        );
        console.log(
          chalk.gray(`  Model: ${model}\n`)
        );

        if (config.llm.maxCostPerRun > 0) {
          console.log(
            chalk.gray(`  Cost limit: $${config.llm.maxCostPerRun.toFixed(2)} per run\n`)
          );
        }

        const spinner = ora('Scanning codebase...').start();

        try {
          spinner.text = 'Scanning files and building dependency graph...';
          const result = await runAnalysis(projectDir, config, { repoId });

          spinner.succeed('Analysis complete');

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

          console.log('');
        } catch (error: unknown) {
          spinner.fail('Analysis failed');
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`\n  ${message}\n`));
          process.exit(1);
        }
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
