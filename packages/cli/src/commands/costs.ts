/**
 * `snoutguard costs` command.
 *
 * Displays LLM usage cost history: total spend, spend per analysis,
 * spend per review, and model-level breakdowns.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'node:path';
import {
  loadConfig,
  getModelForOperation,
} from '@snoutguard/core';

/** Model pricing per million tokens */
const MODEL_PRICING: Record<string, { input: number; output: number; label: string }> = {
  'claude-opus-4-6': { input: 15.0, output: 75.0, label: 'Opus 4.6' },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0, label: 'Sonnet 4.6' },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.0, label: 'Haiku 4.5' },
};

export function registerCostsCommand(program: Command): void {
  program
    .command('costs')
    .description('Show LLM cost estimates and current model configuration')
    .option('--path <dir>', 'Project directory', '.')
    .action(
      async (options: { path: string }) => {
        const projectDir = path.resolve(options.path);
        const config = loadConfig(projectDir);

        console.log(chalk.bold('\n  SnoutGuard LLM Cost Configuration\n'));

        // Show current model assignments
        console.log(chalk.bold('  Model Assignments:'));
        const operations = ['analyze', 'review', 'mcp', 'summary'] as const;
        for (const op of operations) {
          const model = getModelForOperation(config, op);
          const pricing = MODEL_PRICING[model];
          const label = pricing?.label ?? model;
          console.log(
            `    ${chalk.cyan(op.padEnd(10))} ${chalk.white(label.padEnd(15))} ` +
            chalk.gray(`($${pricing?.input ?? '?'}/M input, $${pricing?.output ?? '?'}/M output)`)
          );
        }

        // Show cost estimates for typical operations
        console.log(chalk.bold('\n  Estimated Costs (typical usage):'));

        const analyzeModel = getModelForOperation(config, 'analyze');
        const reviewModel = getModelForOperation(config, 'review');
        const summaryModel = getModelForOperation(config, 'summary');
        const syncModel = getModelForOperation(config, 'sync');

        const analyzePricing = MODEL_PRICING[analyzeModel] ?? { input: 3, output: 15 };
        const reviewPricing = MODEL_PRICING[reviewModel] ?? { input: 3, output: 15 };
        const summaryPricing = MODEL_PRICING[summaryModel] ?? { input: 3, output: 15 };
        const syncPricing = MODEL_PRICING[syncModel] ?? { input: 3, output: 15 };

        // Typical analysis: ~50k input tokens, ~4k output tokens
        const analyzeCost = (50_000 / 1_000_000) * analyzePricing.input + (4_000 / 1_000_000) * analyzePricing.output;
        // Typical review: ~20k input, ~2k output
        const reviewCost = (20_000 / 1_000_000) * reviewPricing.input + (2_000 / 1_000_000) * reviewPricing.output;
        // Typical summary: ~10k input, ~1k output
        const summaryCost = (10_000 / 1_000_000) * summaryPricing.input + (1_000 / 1_000_000) * summaryPricing.output;
        // Typical sync: ~30k input (all decisions), ~8k output (compressed context)
        const syncCost = (30_000 / 1_000_000) * syncPricing.input + (8_000 / 1_000_000) * syncPricing.output;

        console.log(
          `    ${chalk.cyan('analyze'.padEnd(10))} ~$${analyzeCost.toFixed(4)} per run ` +
          chalk.gray('(~50k input + ~4k output tokens)')
        );
        console.log(
          `    ${chalk.cyan('review'.padEnd(10))} ~$${reviewCost.toFixed(4)} per run ` +
          chalk.gray('(~20k input + ~2k output tokens)')
        );
        console.log(
          `    ${chalk.cyan('summary'.padEnd(10))} ~$${summaryCost.toFixed(4)} per run ` +
          chalk.gray('(~10k input + ~1k output tokens)')
        );
        console.log(
          `    ${chalk.cyan('sync'.padEnd(10))} ~$${syncCost.toFixed(4)} per run ` +
          chalk.gray(`(~30k input + ~8k output, ${syncModel})`)
        );

        // Monthly estimate
        const monthlyEstimate =
          analyzeCost * 20 +  // 20 full analyses per month
          reviewCost * 100 +  // 100 PR reviews per month
          summaryCost * 30;   // daily summaries

        console.log(chalk.bold('\n  Monthly Estimate (active team):'));
        console.log(
          `    ~$${monthlyEstimate.toFixed(2)}/month ` +
          chalk.gray('(20 analyses + 100 reviews + 30 summaries)')
        );

        // Cost limit
        if (config.llm.maxCostPerRun > 0) {
          console.log(chalk.bold('\n  Cost Limit:'));
          console.log(
            `    $${config.llm.maxCostPerRun.toFixed(2)} per run ` +
            chalk.gray('(set llm.max_cost_per_run in .snoutguard.yml)')
          );
        }

        // Tips
        console.log(chalk.bold('\n  Cost Optimization Tips:'));
        console.log(chalk.gray('    • Use Haiku for cost-sensitive environments:'));
        console.log(chalk.gray('      Set all models to claude-haiku-4-5-20251001 in .snoutguard.yml'));
        console.log(chalk.gray('    • Caching reduces repeated calls (TTL: ' + config.llm.cacheTtlHours + 'h)'));
        console.log(chalk.gray('    • Set max_cost_per_run to prevent surprise bills'));
        console.log('');
      }
    );
}
