/**
 * `archguard analyze` command.
 * Runs a full codebase analysis using the analyzer package,
 * with progress display via ora spinner.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadConfig, generateId, findProjectRoot } from '@archguard/core';
import { runAnalysis } from '@archguard/analyzer';

export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze')
    .description('Analyze the codebase for architectural decisions, patterns, and drift')
    .option('--path <dir>', 'Project directory to analyze', '.')
    .option('--no-llm', 'Skip LLM-powered analysis')
    .option('--json', 'Output results as JSON')
    .option('--output <file>', 'Write report to a file')
    .action(
      async (options: {
        path: string;
        llm: boolean;
        json?: boolean;
        output?: string;
      }) => {
        const projectDir = path.resolve(options.path);
        const config = loadConfig(projectDir);
        const repoId = generateId();

        console.log(
          chalk.bold(`\n  Analyzing ${chalk.cyan(projectDir)}\n`)
        );

        const spinner = ora('Scanning codebase...').start();

        try {
          spinner.text = 'Scanning files and detecting patterns...';
          const result = await runAnalysis(projectDir, config, {
            repoId,
            useLlm: options.llm,
          });

          spinner.succeed('Analysis complete');

          // Display summary
          console.log('');
          console.log(
            chalk.bold('  Results:')
          );
          console.log(
            `    Files scanned:    ${chalk.cyan(String(result.scanResult.totalFiles))}`
          );
          console.log(
            `    Total lines:      ${chalk.cyan(String(result.scanResult.totalLines))}`
          );
          console.log(
            `    Decisions found:  ${chalk.cyan(String(result.decisions.length))}`
          );
          console.log(
            `    Drift score:      ${formatDriftScore(result.drift.driftScore)}`
          );
          console.log(
            `    Drift events:     ${chalk.cyan(String(result.drift.events.length))}`
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
              const statusColor =
                decision.status === 'confirmed'
                  ? chalk.green
                  : decision.status === 'deprecated'
                    ? chalk.red
                    : chalk.yellow;
              console.log(
                `    ${statusColor(`[${decision.status}]`)} ${decision.title} (${Math.round(decision.confidence * 100)}%)`
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
