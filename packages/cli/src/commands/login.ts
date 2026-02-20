/**
 * `snoutguard login` command.
 * Authenticates the CLI with an SnoutGuard server instance.
 * Stores credentials securely for subsequent commands.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { loadConfig, findProjectRoot } from '@snoutguard/core';

/** Path to the credentials file */
function getCredentialsPath(): string {
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '/tmp';
  return path.join(homeDir, '.snoutguard', 'credentials.json');
}

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

/** Prompt for a password (input not echoed) */
function promptSecret(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    // Attempt to hide input on supported terminals
    if (process.stdin.isTTY) {
      process.stdout.write(question);
      const stdin = process.stdin;
      const wasRaw = stdin.isRaw;
      stdin.setRawMode(true);
      stdin.resume();

      let input = '';
      const onData = (char: Buffer) => {
        const c = char.toString('utf-8');
        if (c === '\n' || c === '\r') {
          stdin.setRawMode(wasRaw ?? false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          rl.close();
          resolve(input);
        } else if (c === '\u0003') {
          // Ctrl+C
          process.exit(0);
        } else if (c === '\u007F' || c === '\b') {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
          }
        } else {
          input += c;
          process.stdout.write('*');
        }
      };

      stdin.on('data', onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

/** Store credentials */
function saveCredentials(serverUrl: string, token: string): void {
  const credPath = getCredentialsPath();
  const dir = path.dirname(credPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const credentials = {
    serverUrl,
    token,
    savedAt: new Date().toISOString(),
  };

  fs.writeFileSync(credPath, JSON.stringify(credentials, null, 2), {
    mode: 0o600,
    encoding: 'utf-8',
  });
}

/** Load stored credentials */
function loadCredentials(): {
  serverUrl: string;
  token: string;
  savedAt: string;
} | null {
  const credPath = getCredentialsPath();
  if (!fs.existsSync(credPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(credPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Authenticate with an SnoutGuard server')
    .option('--server <url>', 'Server URL')
    .option('--token <token>', 'API token (alternative to interactive login)')
    .option('--status', 'Show current authentication status')
    .option('--logout', 'Remove stored credentials')
    .action(
      async (options: {
        server?: string;
        token?: string;
        status?: boolean;
        logout?: boolean;
      }) => {
        // ── Status check ──────────────────────────────────────────────
        if (options.status) {
          const creds = loadCredentials();
          if (creds) {
            console.log(chalk.bold('\n  Authentication Status\n'));
            console.log(`  Server:     ${chalk.cyan(creds.serverUrl)}`);
            console.log(`  Logged in:  ${chalk.green('Yes')}`);
            console.log(`  Since:      ${chalk.gray(creds.savedAt)}`);
            console.log('');
          } else {
            console.log(
              chalk.yellow('\n  Not logged in. Run `snoutguard login` to authenticate.\n')
            );
          }
          return;
        }

        // ── Logout ────────────────────────────────────────────────────
        if (options.logout) {
          const credPath = getCredentialsPath();
          if (fs.existsSync(credPath)) {
            fs.unlinkSync(credPath);
            console.log(chalk.green('\n  Logged out successfully.\n'));
          } else {
            console.log(chalk.gray('\n  No credentials found.\n'));
          }
          return;
        }

        // ── Login flow ─────────────────────────────────────────────────
        console.log(chalk.bold('\n  SnoutGuard Login\n'));

        // Get server URL
        let serverUrl = options.server;
        if (!serverUrl) {
          const projectDir = findProjectRoot(process.cwd());
          const config = loadConfig(projectDir);
          serverUrl =
            config.server?.url ??
            (await prompt(chalk.cyan('  Server URL: ')));
        }

        if (!serverUrl) {
          console.error(chalk.red('  Server URL is required.\n'));
          process.exit(1);
        }

        // Ensure URL has protocol
        if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
          serverUrl = `https://${serverUrl}`;
        }

        // Get token
        let token = options.token;
        if (!token) {
          token = await promptSecret(chalk.cyan('  API Token: '));
        }

        if (!token) {
          console.error(chalk.red('  API token is required.\n'));
          process.exit(1);
        }

        const spinner = ora('Authenticating...').start();

        try {
          // Verify the token by making a test request
          const response = await fetch(`${serverUrl}/api/v1/auth/verify`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            saveCredentials(serverUrl, token);
            spinner.succeed('Authenticated successfully');
            console.log(
              chalk.gray(`  Credentials saved to ${getCredentialsPath()}\n`)
            );
          } else if (response.status === 401) {
            spinner.fail('Authentication failed: invalid token');
            console.log('');
            process.exit(1);
          } else {
            // Server might not have verify endpoint, save anyway with warning
            saveCredentials(serverUrl, token);
            spinner.warn(
              `Server returned ${response.status}. Credentials saved but could not verify.`
            );
            console.log('');
          }
        } catch (error: unknown) {
          // Network error - could be the server is not reachable
          // Save credentials anyway for offline use
          saveCredentials(serverUrl, token);
          spinner.warn(
            'Could not reach server. Credentials saved for later use.'
          );
          const message = error instanceof Error ? error.message : String(error);
          console.log(chalk.gray(`  ${message}\n`));
        }
      }
    );
}
