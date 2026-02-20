/**
 * `snoutguard review` command.
 *
 * Performs architectural review of code changes using Claude (Sonnet by default).
 * Requires an Anthropic API key.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  loadConfig,
  requireApiKey,
  getModelForOperation,
  createGitClient,
  getDiff,
  getCommitDiff,
  LlmAuthError,
  type Violation,
  type ReviewResult,
} from '@snoutguard/core';

/** Format a violation for terminal display */
function formatViolation(violation: Violation): string {
  const severityColor =
    violation.severity === 'error'
      ? chalk.red
      : violation.severity === 'warning'
        ? chalk.yellow
        : chalk.blue;

  const severity = severityColor(
    `[${violation.severity.toUpperCase()}]`.padEnd(11)
  );
  const location = chalk.gray(
    `${violation.filePath}:${violation.lineStart}-${violation.lineEnd}`
  );
  const rule = chalk.cyan(violation.rule);

  const lines = [
    `  ${severity} ${rule}`,
    `  ${chalk.gray('Location:')} ${location}`,
    `  ${violation.message}`,
  ];

  if (violation.suggestion) {
    lines.push(`  ${chalk.green('Suggestion:')} ${violation.suggestion}`);
  }

  return lines.join('\n');
}

/** Format review results for GitHub PR comments */
function formatGitHub(result: ReviewResult): string {
  const lines: string[] = [
    '## SnoutGuard Architectural Review',
    '',
    `| Metric | Count |`,
    `|--------|-------|`,
    `| Errors | ${result.errors} |`,
    `| Warnings | ${result.warnings} |`,
    `| Info | ${result.infos} |`,
    `| **Total** | **${result.totalViolations}** |`,
    '',
  ];

  if (result.violations.length > 0) {
    lines.push('### Violations');
    lines.push('');

    for (const v of result.violations) {
      const icon =
        v.severity === 'error'
          ? ':x:'
          : v.severity === 'warning'
            ? ':warning:'
            : ':information_source:';
      lines.push(
        `${icon} **${v.rule}** in \`${v.filePath}:${v.lineStart}\``
      );
      lines.push(`> ${v.message}`);
      if (v.suggestion) {
        lines.push(`> *Suggestion:* ${v.suggestion}`);
      }
      lines.push('');
    }
  } else {
    lines.push(':white_check_mark: No architectural violations found.');
  }

  return lines.join('\n');
}

/** Format review results for Bitbucket PR comments */
function formatBitbucket(result: ReviewResult): string {
  const lines: string[] = [
    '## SnoutGuard Architectural Review',
    '',
    `Errors: ${result.errors} | Warnings: ${result.warnings} | Info: ${result.infos}`,
    '',
  ];

  for (const v of result.violations) {
    const severity = v.severity.toUpperCase();
    lines.push(
      `**[${severity}]** ${v.rule} - \`${v.filePath}:${v.lineStart}\``
    );
    lines.push(`${v.message}`);
    if (v.suggestion) {
      lines.push(`_Suggestion:_ ${v.suggestion}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function registerReviewCommand(program: Command): void {
  program
    .command('review')
    .description('Review code changes for architectural violations')
    .option('--diff <ref>', 'Review diff against a git ref (e.g., main, HEAD~1)')
    .option('--commit <sha>', 'Review a specific commit')
    .option(
      '--format <format>',
      'Output format: terminal, github, bitbucket, or json',
      'terminal'
    )
    .option('--ci', 'CI mode: exit with code 1 if errors are found')
    .option('--path <dir>', 'Project directory', '.')
    .option('--output <file>', 'Write review report to file')
    .action(
      async (options: {
        diff?: string;
        commit?: string;
        format: string;
        ci?: boolean;
        path: string;
        output?: string;
      }) => {
        const projectDir = path.resolve(options.path);
        const config = loadConfig(projectDir);

        // Validate API key upfront
        try {
          requireApiKey(config);
        } catch (error) {
          if (error instanceof LlmAuthError) {
            console.error(chalk.red(error.message));
            process.exit(1);
          }
          throw error;
        }

        if (!options.diff && !options.commit) {
          console.log(
            chalk.yellow(
              '\n  Please specify --diff <ref> or --commit <sha> to review.\n'
            )
          );
          console.log(
            chalk.gray(
              '  Examples:\n' +
                '    snoutguard review --diff main\n' +
                '    snoutguard review --commit HEAD~1\n' +
                '    snoutguard review --diff HEAD~3 --format github\n'
            )
          );
          return;
        }

        const model = getModelForOperation(config, 'review');
        console.log(
          chalk.bold('\n  SnoutGuard Architectural Review')
        );
        console.log(chalk.gray(`  Model: ${model}\n`));

        const spinner = ora('Analyzing code changes...').start();

        try {
          const git = createGitClient(projectDir);

          // Get the diff
          spinner.text = 'Fetching diff...';
          let fileDiffs;
          if (options.commit) {
            fileDiffs = await getCommitDiff(git, options.commit);
          } else if (options.diff) {
            fileDiffs = await getDiff(git, options.diff);
          }

          if (!fileDiffs || fileDiffs.length === 0) {
            spinner.warn('No changes found to review');
            console.log('');
            return;
          }

          spinner.text = `Reviewing ${fileDiffs.length} changed file(s)...`;

          // Run the review
          const { reviewChanges } = await import('@snoutguard/reviewer');
          const diffRef = options.commit ?? options.diff!;
          const result = await reviewChanges(projectDir, config, diffRef, {});

          spinner.succeed(
            `Review complete: ${result.totalViolations} violation(s) found`
          );

          // Format output
          let output: string;
          switch (options.format) {
            case 'json':
              output = JSON.stringify(result, null, 2);
              break;
            case 'github':
              output = formatGitHub(result);
              break;
            case 'bitbucket':
              output = formatBitbucket(result);
              break;
            case 'terminal':
            default:
              // Terminal format
              if (result.violations.length === 0) {
                console.log(
                  chalk.green('\n  No architectural violations found.\n')
                );
                return;
              }

              console.log('');
              console.log(
                chalk.bold(
                  `  ${chalk.red(String(result.errors))} error(s), ` +
                    `${chalk.yellow(String(result.warnings))} warning(s), ` +
                    `${chalk.blue(String(result.infos))} info(s)`
                )
              );
              console.log('');

              for (const violation of result.violations) {
                console.log(formatViolation(violation));
                console.log('');
              }

              if (options.ci && result.errors > 0) {
                process.exit(1);
              }
              return;
          }

          // For non-terminal formats, write or print
          if (options.output) {
            const outputPath = path.resolve(options.output);
            fs.writeFileSync(outputPath, output, 'utf-8');
            console.log(
              chalk.green(`\n  Review report written to ${chalk.bold(outputPath)}\n`)
            );
          } else {
            console.log('\n' + output);
          }

          // CI mode exit code
          if (options.ci && result.errors > 0) {
            process.exit(1);
          }

          console.log('');
        } catch (error: unknown) {
          spinner.fail('Review failed');
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`\n  ${message}\n`));
          process.exit(1);
        }
      }
    );
}
