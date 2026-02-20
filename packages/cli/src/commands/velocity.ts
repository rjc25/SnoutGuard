/**
 * `archguard velocity` command.
 * Shows engineering velocity metrics for teams and individual developers.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'node:path';
import {
  loadConfig,
  findProjectRoot,
  type VelocityScore,
  type TeamVelocity,
  type VelocityPeriod,
} from '@archguard/core';

/** Format a velocity score for terminal display */
function formatVelocityScore(score: VelocityScore): string {
  const trendIcon =
    score.trend === 'accelerating'
      ? chalk.green('UP')
      : score.trend === 'decelerating'
        ? chalk.red('DOWN')
        : chalk.gray('STABLE');

  const lines = [
    `  ${chalk.bold(score.developerId)}`,
    `    Velocity Score: ${chalk.cyan(String(score.velocityScore.toFixed(1)))}  Trend: ${trendIcon}`,
    `    Commits: ${score.commits}  PRs Opened: ${score.prsOpened}  PRs Merged: ${score.prsMerged}`,
    `    Lines: ${chalk.green(`+${score.linesAdded}`)} ${chalk.red(`-${score.linesRemoved}`)}`,
    `    Arch Impact: ${formatPercent(score.architecturalImpact)}  Refactoring: ${formatPercent(score.refactoringRatio)}`,
  ];

  if (score.blockers.length > 0) {
    lines.push(
      `    Blockers: ${chalk.red(String(score.blockers.length))}`
    );
    for (const blocker of score.blockers.slice(0, 3)) {
      lines.push(
        `      ${chalk.yellow(`[${blocker.severity}]`)} ${blocker.description}`
      );
    }
  }

  return lines.join('\n');
}

/** Format a team velocity summary */
function formatTeamVelocity(team: TeamVelocity): string {
  const lines = [
    chalk.bold(`\n  Team Velocity: ${team.teamId}`),
    chalk.gray(`  Period: ${team.periodStart} to ${team.periodEnd}`),
    '',
    `  Team Score:        ${chalk.cyan(String(team.teamVelocityScore.toFixed(1)))}`,
    `  Arch Health:       ${formatHealthScore(team.architecturalHealth)}`,
    `  Members:           ${team.members.length}`,
  ];

  if (team.highlights.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Highlights:'));
    for (const highlight of team.highlights) {
      lines.push(`    - ${highlight}`);
    }
  }

  if (team.topBlockers.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Top Blockers:'));
    for (const blocker of team.topBlockers) {
      lines.push(
        `    ${chalk.yellow(`[${blocker.severity}]`)} ${blocker.description}`
      );
    }
  }

  lines.push('');
  lines.push(chalk.bold('  Individual Scores:'));
  lines.push('');

  for (const member of team.members) {
    lines.push(formatVelocityScore(member));
    lines.push('');
  }

  return lines.join('\n');
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatHealthScore(score: number): string {
  const percent = Math.round(score * 100);
  if (percent >= 80) return chalk.green(`${percent}%`);
  if (percent >= 50) return chalk.yellow(`${percent}%`);
  return chalk.red(`${percent}%`);
}

export function registerVelocityCommand(program: Command): void {
  program
    .command('velocity')
    .description('Show engineering velocity metrics')
    .option('--team', 'Show team velocity (aggregate)')
    .option('--dev <name>', 'Show velocity for a specific developer')
    .option(
      '--period <period>',
      'Time period: daily, weekly, or monthly',
      'weekly'
    )
    .option('--json', 'Output as JSON')
    .option('--path <dir>', 'Project directory', '.')
    .action(
      async (options: {
        team?: boolean;
        dev?: string;
        period: string;
        json?: boolean;
        path: string;
      }) => {
        const projectDir = path.resolve(options.path);
        const config = loadConfig(projectDir);
        const period = options.period as VelocityPeriod;

        if (!config.velocity.enabled) {
          console.log(
            chalk.yellow(
              '\n  Velocity tracking is disabled in .archguard.yml.\n' +
                '  Set velocity.enabled to true to enable it.\n'
            )
          );
          return;
        }

        const spinner = ora('Calculating velocity metrics...').start();

        try {
          const { calculateVelocity } = await import(
            '@archguard/velocity'
          );

          // Calculate period dates
          const nowDate = new Date();
          const periodEnd = nowDate.toISOString().slice(0, 10);
          let periodStart: string;
          switch (period) {
            case 'daily':
              periodStart = new Date(nowDate.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
              break;
            case 'monthly':
              periodStart = new Date(nowDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
              break;
            case 'weekly':
            default:
              periodStart = new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
              break;
          }

          spinner.text = options.dev
            ? `Calculating velocity for ${options.dev}...`
            : 'Calculating velocity metrics...';

          const result = await calculateVelocity({
            projectDir,
            teamId: 'default',
            period,
            periodStart,
            periodEnd,
            config,
          });

          spinner.stop();

          if (options.team) {
            if (options.json) {
              console.log(JSON.stringify(result.teamVelocity, null, 2));
            } else {
              console.log(formatTeamVelocity(result.teamVelocity));
            }
          } else {
            const scores = options.dev
              ? result.scores.filter((s) => s.developerId === options.dev)
              : result.scores;

            if (options.json) {
              console.log(JSON.stringify(scores, null, 2));
              return;
            }

            if (scores.length === 0) {
              console.log(
                chalk.yellow(
                  '\n  No velocity data found for the specified criteria.\n'
                )
              );
              return;
            }

            console.log(
              chalk.bold(
                `\n  Velocity Report (${period})\n`
              )
            );

            for (const score of scores) {
              console.log(formatVelocityScore(score));
              console.log('');
            }
          }
        } catch (error: unknown) {
          spinner.fail('Failed to calculate velocity');
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`\n  ${message}\n`));
          process.exit(1);
        }
      }
    );
}
