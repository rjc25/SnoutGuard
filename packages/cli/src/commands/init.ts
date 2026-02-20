/**
 * `archguard init` command.
 *
 * Interactive setup that detects languages, asks configuration preferences,
 * writes .archguard.yml, validates the Anthropic API key, and initializes
 * the local SQLite database.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import {
  writeDefaultConfig,
  initializeDatabase,
  detectLanguage,
  findProjectRoot,
  type SupportedLanguage,
  type SyncFormat,
} from '@archguard/core';

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

/** Detect languages present in the project by scanning source files */
function detectProjectLanguages(projectDir: string): SupportedLanguage[] {
  const languageSet = new Set<SupportedLanguage>();
  const extensions = new Map<string, SupportedLanguage>([
    ['.ts', 'typescript'],
    ['.tsx', 'typescript'],
    ['.js', 'javascript'],
    ['.jsx', 'javascript'],
    ['.py', 'python'],
    ['.go', 'go'],
    ['.rs', 'rust'],
    ['.java', 'java'],
  ]);

  function walkDir(dir: string, depth: number): void {
    if (depth > 5) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build' || entry.name === 'vendor' || entry.name === 'target') {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        const lang = extensions.get(ext);
        if (lang) {
          languageSet.add(lang);
        }
      }
    }
  }

  walkDir(projectDir, 0);
  return Array.from(languageSet);
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize ArchGuard in the current project')
    .option('--path <dir>', 'Project directory', '.')
    .option('--non-interactive', 'Use defaults without prompting')
    .action(async (options: { path: string; nonInteractive?: boolean }) => {
      const projectDir = path.resolve(options.path);

      console.log(chalk.bold('\n  ArchGuard Setup\n'));

      // Check if config already exists
      const configPath = path.join(projectDir, '.archguard.yml');
      if (fs.existsSync(configPath)) {
        const overwrite = options.nonInteractive
          ? 'n'
          : await prompt(
              chalk.yellow('  .archguard.yml already exists. Overwrite? (y/N): ')
            );
        if (overwrite.toLowerCase() !== 'y') {
          console.log(chalk.gray('  Keeping existing configuration.\n'));
          return;
        }
      }

      // Step 1: Validate API key
      console.log(chalk.bold('  Step 1: API Key\n'));
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey && apiKey.startsWith('sk-ant-')) {
        console.log(chalk.green('  ✓ ANTHROPIC_API_KEY is set\n'));
      } else {
        console.log(chalk.yellow('  ⚠ ANTHROPIC_API_KEY is not set or invalid.\n'));
        console.log(chalk.white('  ArchGuard requires an Anthropic API key to function.'));
        console.log(chalk.white('  Get one at: https://console.anthropic.com/settings/keys\n'));
        console.log(chalk.white('  Then set it:\n'));
        console.log(chalk.cyan('    export ANTHROPIC_API_KEY=sk-ant-...\n'));
        console.log(chalk.gray('  You can continue setup — the key is needed when running analyze/review/summary.\n'));
      }

      // Step 2: Detect languages
      console.log(chalk.bold('  Step 2: Languages\n'));
      const spinner = ora('Detecting project languages...').start();
      const detectedLanguages = detectProjectLanguages(projectDir);
      spinner.succeed(
        `Detected languages: ${detectedLanguages.length > 0 ? detectedLanguages.join(', ') : 'none'}`
      );

      let selectedLanguages = detectedLanguages;
      if (!options.nonInteractive && detectedLanguages.length > 0) {
        const languageInput = await prompt(
          chalk.cyan(
            `  Languages to analyze [${detectedLanguages.join(', ')}]: `
          )
        );
        if (languageInput) {
          selectedLanguages = languageInput
            .split(',')
            .map((l) => l.trim() as SupportedLanguage)
            .filter(Boolean);
        }
      }

      // Step 3: Ask context file formats
      console.log(chalk.bold('\n  Step 3: AI Agent Context Files\n'));
      const defaultFormats: SyncFormat[] = ['claude', 'cursorrules'];
      let selectedFormats = defaultFormats;
      if (!options.nonInteractive) {
        console.log(chalk.gray('  Available: cursorrules, claude, copilot, windsurf, kiro, agents'));
        const formatInput = await prompt(
          chalk.cyan(`  Formats to generate [${defaultFormats.join(', ')}]: `)
        );
        if (formatInput) {
          selectedFormats = formatInput
            .split(',')
            .map((f) => f.trim() as SyncFormat)
            .filter(Boolean);
        }
      }

      // Step 4: Write config
      console.log(chalk.bold('\n  Step 4: Configuration\n'));
      const writeSpinner = ora('Writing .archguard.yml...').start();
      const writtenPath = writeDefaultConfig(projectDir);

      // Patch the config with user selections
      if (selectedLanguages.length > 0 || selectedFormats !== defaultFormats) {
        let configContent = fs.readFileSync(writtenPath, 'utf-8');

        if (selectedLanguages.length > 0) {
          const languagesYaml = selectedLanguages
            .map((l) => `    - ${l}`)
            .join('\n');
          configContent = configContent.replace(
            /  languages:\n(?:    - \w+\n)+/,
            `  languages:\n${languagesYaml}\n`
          );
        }

        if (selectedFormats !== defaultFormats) {
          const formatsYaml = selectedFormats
            .map((f) => `    - ${f}`)
            .join('\n');
          configContent = configContent.replace(
            /  formats:\n(?:    - \w+\n)+/,
            `  formats:\n${formatsYaml}\n`
          );
        }

        fs.writeFileSync(writtenPath, configContent, 'utf-8');
      }

      writeSpinner.succeed(`Configuration written to ${chalk.bold('.archguard.yml')}`);

      // Step 5: Initialize database
      const dbSpinner = ora('Initializing local SQLite database...').start();
      try {
        initializeDatabase();
        dbSpinner.succeed('Local database initialized');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        dbSpinner.fail(`Database initialization failed: ${message}`);
      }

      console.log(
        chalk.green('\n  ArchGuard initialized successfully!')
      );
      console.log('');
      console.log(chalk.bold('  Model defaults:'));
      console.log(chalk.gray('    analyze:  claude-opus-4-6 (deep analysis)'));
      console.log(chalk.gray('    review:   claude-sonnet-4-6 (PR reviews)'));
      console.log(chalk.gray('    summary:  claude-sonnet-4-6 (work summaries)'));
      console.log(chalk.gray('    mcp:      claude-sonnet-4-6 (real-time queries)'));
      console.log(chalk.gray('  Customize in .archguard.yml under llm.models.*'));
      console.log('');
      console.log(chalk.white('  Next steps:'));
      console.log(chalk.cyan('    archguard analyze   ') + chalk.gray('# Scan your codebase'));
      console.log(chalk.cyan('    archguard sync      ') + chalk.gray('# Generate AI context files'));
      console.log(chalk.cyan('    archguard review    ') + chalk.gray('# Review code changes'));
      console.log('');
    });
}
