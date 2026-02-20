/**
 * `snoutguard decisions` subcommand.
 * Manage architectural decisions: list, add, confirm, deprecate, remove, export.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import {
  loadConfig,
  initializeDatabase,
  generateId,
  now,
  findProjectRoot,
  eq,
  type ArchDecision,
  type ArchCategory,
  type DecisionStatus,
} from '@snoutguard/core';

/** Prompt the user for a line of input */
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Format a decision row for table display */
function formatDecisionRow(decision: {
  id: string;
  title: string;
  category: string;
  status: string;
  confidence: number;
}): string {
  const statusColor =
    decision.status === 'confirmed'
      ? chalk.green
      : decision.status === 'deprecated'
        ? chalk.red
        : decision.status === 'custom'
          ? chalk.blue
          : chalk.yellow;

  const id = chalk.gray(decision.id.slice(0, 8));
  const status = statusColor(`[${decision.status}]`.padEnd(14));
  const confidence = chalk.cyan(`${Math.round(decision.confidence * 100)}%`.padStart(4));
  const category = chalk.gray(decision.category.padEnd(12));
  const title = decision.title;

  return `  ${id}  ${status}  ${confidence}  ${category}  ${title}`;
}

export function registerDecisionsCommand(program: Command): void {
  const decisions = program
    .command('decisions')
    .description('Manage architectural decisions');

  // ── list ───────────────────────────────────────────────────────────
  decisions
    .command('list')
    .description('List all architectural decisions')
    .option('--json', 'Output as JSON')
    .option('--category <category>', 'Filter by category')
    .option('--status <status>', 'Filter by status (detected, confirmed, deprecated, custom)')
    .action(
      async (options: {
        json?: boolean;
        category?: string;
        status?: string;
      }) => {
        const projectDir = findProjectRoot(process.cwd());
        const config = loadConfig(projectDir);
        const spinner = ora('Loading decisions...').start();

        try {
          const db = initializeDatabase();
          const { schema } = await import('@snoutguard/core');
          const rows = await db.select().from(schema.decisions);

          let filtered = rows;
          if (options.category) {
            filtered = filtered.filter((r) => r.category === options.category);
          }
          if (options.status) {
            filtered = filtered.filter((r) => r.status === options.status);
          }

          spinner.stop();

          if (options.json) {
            console.log(JSON.stringify(filtered, null, 2));
            return;
          }

          if (filtered.length === 0) {
            console.log(chalk.yellow('\n  No decisions found.'));
            console.log(
              chalk.gray('  Run `snoutguard analyze` to detect decisions, or `snoutguard decisions add` to add one manually.\n')
            );
            return;
          }

          console.log(chalk.bold('\n  Architectural Decisions\n'));
          console.log(
            chalk.gray(
              `  ${'ID'.padEnd(10)}${'Status'.padEnd(14)}  ${'Conf'.padStart(4)}  ${'Category'.padEnd(12)}  Title`
            )
          );
          console.log(chalk.gray('  ' + '-'.repeat(80)));

          for (const row of filtered) {
            console.log(
              formatDecisionRow({
                id: row.id,
                title: row.title,
                category: row.category,
                status: row.status,
                confidence: row.confidence,
              })
            );
          }

          console.log(
            chalk.gray(`\n  Total: ${filtered.length} decision(s)\n`)
          );
        } catch (error: unknown) {
          spinner.fail('Failed to load decisions');
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`\n  ${message}\n`));
          process.exit(1);
        }
      }
    );

  // ── add ────────────────────────────────────────────────────────────
  decisions
    .command('add')
    .description('Add a custom architectural decision interactively')
    .action(async () => {
      const projectDir = findProjectRoot(process.cwd());

      console.log(chalk.bold('\n  Add Architectural Decision\n'));

      const title = await prompt(chalk.cyan('  Title: '));
      if (!title) {
        console.log(chalk.red('  Title is required.\n'));
        return;
      }

      const description = await prompt(chalk.cyan('  Description: '));

      console.log(
        chalk.gray(
          '  Categories: structural, behavioral, deployment, data, api, testing, security'
        )
      );
      const category = (await prompt(
        chalk.cyan('  Category [structural]: ')
      )) || 'structural';

      const tagsInput = await prompt(
        chalk.cyan('  Tags (comma-separated): ')
      );
      const tags = tagsInput
        ? tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
        : [];

      const constraintsInput = await prompt(
        chalk.cyan('  Constraints (comma-separated): ')
      );
      const constraints = constraintsInput
        ? constraintsInput.split(',').map((c) => c.trim()).filter(Boolean)
        : [];

      const spinner = ora('Saving decision...').start();

      try {
        const db = initializeDatabase();
        const { schema } = await import('@snoutguard/core');
        const id = generateId();
        const timestamp = now();

        await db.insert(schema.decisions).values({
          id,
          repoId: 'local',
          title,
          description: description || title,
          category: category as ArchCategory,
          status: 'custom' as DecisionStatus,
          confidence: 1.0,
          constraints: JSON.stringify(constraints),
          relatedDecisions: '[]',
          tags: JSON.stringify(tags),
          detectedAt: timestamp,
          updatedAt: timestamp,
        });

        spinner.succeed(`Decision added: ${chalk.bold(title)} (${chalk.gray(id.slice(0, 8))})`);
        console.log('');
      } catch (error: unknown) {
        spinner.fail('Failed to add decision');
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`\n  ${message}\n`));
        process.exit(1);
      }
    });

  // ── confirm <id> ──────────────────────────────────────────────────
  decisions
    .command('confirm <id>')
    .description('Confirm a detected architectural decision')
    .action(async (id: string) => {
      const spinner = ora('Confirming decision...').start();

      try {
        const db = initializeDatabase();
        const { schema } = await import('@snoutguard/core');
        // eq is imported from @snoutguard/core at the top of this file

        const rows = await db
          .select()
          .from(schema.decisions)
          .where(eq(schema.decisions.id, id));

        if (rows.length === 0) {
          // Try prefix match
          const allRows = await db.select().from(schema.decisions);
          const matched = allRows.filter((r) => r.id.startsWith(id));
          if (matched.length === 0) {
            spinner.fail(`Decision not found: ${id}`);
            return;
          }
          if (matched.length > 1) {
            spinner.fail(`Ambiguous ID prefix: ${id} matches ${matched.length} decisions`);
            return;
          }
          id = matched[0].id;
        }

        await db
          .update(schema.decisions)
          .set({ status: 'confirmed', updatedAt: now() })
          .where(eq(schema.decisions.id, id));

        spinner.succeed(`Decision ${chalk.bold(id.slice(0, 8))} confirmed`);
        console.log('');
      } catch (error: unknown) {
        spinner.fail('Failed to confirm decision');
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`\n  ${message}\n`));
        process.exit(1);
      }
    });

  // ── deprecate <id> ────────────────────────────────────────────────
  decisions
    .command('deprecate <id>')
    .description('Mark an architectural decision as deprecated')
    .action(async (id: string) => {
      const spinner = ora('Deprecating decision...').start();

      try {
        const db = initializeDatabase();
        const { schema } = await import('@snoutguard/core');
        // eq is imported from @snoutguard/core at the top of this file

        const rows = await db
          .select()
          .from(schema.decisions)
          .where(eq(schema.decisions.id, id));

        if (rows.length === 0) {
          const allRows = await db.select().from(schema.decisions);
          const matched = allRows.filter((r) => r.id.startsWith(id));
          if (matched.length === 0) {
            spinner.fail(`Decision not found: ${id}`);
            return;
          }
          if (matched.length > 1) {
            spinner.fail(`Ambiguous ID prefix: ${id} matches ${matched.length} decisions`);
            return;
          }
          id = matched[0].id;
        }

        await db
          .update(schema.decisions)
          .set({ status: 'deprecated', updatedAt: now() })
          .where(eq(schema.decisions.id, id));

        spinner.succeed(`Decision ${chalk.bold(id.slice(0, 8))} deprecated`);
        console.log('');
      } catch (error: unknown) {
        spinner.fail('Failed to deprecate decision');
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`\n  ${message}\n`));
        process.exit(1);
      }
    });

  // ── remove <id> ───────────────────────────────────────────────────
  decisions
    .command('remove <id>')
    .description('Remove an architectural decision')
    .action(async (id: string) => {
      const spinner = ora('Removing decision...').start();

      try {
        const db = initializeDatabase();
        const { schema } = await import('@snoutguard/core');
        // eq is imported from @snoutguard/core at the top of this file

        const rows = await db
          .select()
          .from(schema.decisions)
          .where(eq(schema.decisions.id, id));

        if (rows.length === 0) {
          const allRows = await db.select().from(schema.decisions);
          const matched = allRows.filter((r) => r.id.startsWith(id));
          if (matched.length === 0) {
            spinner.fail(`Decision not found: ${id}`);
            return;
          }
          if (matched.length > 1) {
            spinner.fail(`Ambiguous ID prefix: ${id} matches ${matched.length} decisions`);
            return;
          }
          id = matched[0].id;
        }

        // Delete associated evidence first
        await db
          .delete(schema.evidence)
          .where(eq(schema.evidence.decisionId, id));

        await db
          .delete(schema.decisions)
          .where(eq(schema.decisions.id, id));

        spinner.succeed(`Decision ${chalk.bold(id.slice(0, 8))} removed`);
        console.log('');
      } catch (error: unknown) {
        spinner.fail('Failed to remove decision');
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`\n  ${message}\n`));
        process.exit(1);
      }
    });

  // ── export ────────────────────────────────────────────────────────
  decisions
    .command('export')
    .description('Export all decisions as JSON or markdown')
    .option('--format <format>', 'Export format: json or markdown', 'json')
    .option('--output <file>', 'Output file path')
    .action(
      async (options: { format: string; output?: string }) => {
        const spinner = ora('Exporting decisions...').start();

        try {
          const db = initializeDatabase();
          const { schema } = await import('@snoutguard/core');

          const rows = await db.select().from(schema.decisions);
          const allEvidence = await db.select().from(schema.evidence);

          // Group evidence by decision
          const evidenceMap = new Map<string, typeof allEvidence>();
          for (const ev of allEvidence) {
            const list = evidenceMap.get(ev.decisionId) ?? [];
            list.push(ev);
            evidenceMap.set(ev.decisionId, list);
          }

          let output: string;

          if (options.format === 'markdown') {
            const lines: string[] = [
              '# Architectural Decisions',
              '',
              `Exported on ${new Date().toISOString()}`,
              '',
            ];

            for (const row of rows) {
              lines.push(`## ${row.title}`);
              lines.push('');
              lines.push(`- **ID:** ${row.id}`);
              lines.push(`- **Category:** ${row.category}`);
              lines.push(`- **Status:** ${row.status}`);
              lines.push(`- **Confidence:** ${Math.round(row.confidence * 100)}%`);
              lines.push(`- **Detected:** ${row.detectedAt}`);
              lines.push('');
              lines.push(row.description);
              lines.push('');

              const evidence = evidenceMap.get(row.id) ?? [];
              if (evidence.length > 0) {
                lines.push('### Evidence');
                lines.push('');
                for (const ev of evidence) {
                  lines.push(
                    `- \`${ev.filePath}:${ev.lineStart}-${ev.lineEnd}\`: ${ev.explanation}`
                  );
                }
                lines.push('');
              }

              lines.push('---');
              lines.push('');
            }

            output = lines.join('\n');
          } else {
            // JSON format
            const decisions = rows.map((row) => ({
              ...row,
              constraints: JSON.parse(row.constraints ?? '[]'),
              relatedDecisions: JSON.parse(row.relatedDecisions ?? '[]'),
              tags: JSON.parse(row.tags ?? '[]'),
              evidence: (evidenceMap.get(row.id) ?? []).map((ev) => ({
                filePath: ev.filePath,
                lineRange: [ev.lineStart, ev.lineEnd],
                snippet: ev.snippet,
                explanation: ev.explanation,
              })),
            }));
            output = JSON.stringify(decisions, null, 2);
          }

          spinner.stop();

          if (options.output) {
            const outputPath = path.resolve(options.output);
            fs.writeFileSync(outputPath, output, 'utf-8');
            console.log(
              chalk.green(
                `\n  Decisions exported to ${chalk.bold(outputPath)}\n`
              )
            );
          } else {
            console.log(output);
          }
        } catch (error: unknown) {
          spinner.fail('Failed to export decisions');
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`\n  ${message}\n`));
          process.exit(1);
        }
      }
    );
}
