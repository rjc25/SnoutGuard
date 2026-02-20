/**
 * Slack Bolt app setup for ArchGuard.
 * Creates and configures a Slack Bolt application with slash commands
 * and event handlers for architectural review notifications.
 */

import { App, type AppOptions } from '@slack/bolt';
import {
  createArchGuardCommandHandler,
  type SlackCommandDataProvider,
} from './commands.js';

// ─── Types ────────────────────────────────────────────────────────

/** Configuration for creating the Slack app */
export interface SlackAppConfig {
  /** Slack Bot token (xoxb-...) */
  botToken: string;
  /** Slack signing secret for verifying requests */
  signingSecret: string;
  /** Slack App token for Socket Mode (xapp-...), optional */
  appToken?: string;
  /** Whether to use Socket Mode (default: false, uses HTTP) */
  socketMode?: boolean;
  /** Port for the HTTP server (default: 3000) */
  port?: number;
  /** Custom Bolt app options to merge */
  customOptions?: Partial<AppOptions>;
}

/** Event handlers that consumers can register */
export interface SlackAppEventHandlers {
  /** Called when a message mentions the bot */
  onMention?: (event: MentionEvent) => Promise<void>;
  /** Called when a reaction is added to a message */
  onReaction?: (event: ReactionEvent) => Promise<void>;
  /** Called when the app home tab is opened */
  onAppHomeOpened?: (event: AppHomeEvent) => Promise<void>;
}

/** Simplified mention event */
export interface MentionEvent {
  user: string;
  text: string;
  channel: string;
  ts: string;
}

/** Simplified reaction event */
export interface ReactionEvent {
  user: string;
  reaction: string;
  itemUser: string;
  channel: string;
  ts: string;
}

/** Simplified app home event */
export interface AppHomeEvent {
  user: string;
  tab: string;
}

// ─── App Creation ─────────────────────────────────────────────────

/**
 * Create and configure a Slack Bolt app for ArchGuard.
 *
 * The app includes:
 * - `/archguard` slash command with subcommands (status, decisions, review, summary, blockers)
 * - Optional event handlers for mentions, reactions, and app home
 * - Error handling and logging
 *
 * @param config - Slack app credentials and settings
 * @param dataProvider - Data provider for slash command data
 * @param eventHandlers - Optional custom event handlers
 * @returns Configured Slack Bolt App instance
 */
export function createSlackApp(
  config: SlackAppConfig,
  dataProvider: SlackCommandDataProvider,
  eventHandlers: SlackAppEventHandlers = {}
): App {
  const app = new App({
    token: config.botToken,
    signingSecret: config.signingSecret,
    socketMode: config.socketMode ?? false,
    appToken: config.appToken,
    port: config.port ?? 3000,
    ...config.customOptions,
  });

  // ── Register Slash Command ──────────────────────────────────────
  const commandHandler = createArchGuardCommandHandler(dataProvider);
  app.command('/archguard', commandHandler);

  // ── Register Event Handlers ─────────────────────────────────────

  // Handle app_mention events (when someone @mentions the bot)
  if (eventHandlers.onMention) {
    const mentionHandler = eventHandlers.onMention;
    app.event('app_mention', async ({ event, say }) => {
      try {
        await mentionHandler({
          user: event.user,
          text: event.text,
          channel: event.channel,
          ts: event.ts,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[ArchGuard Slack] Error handling mention: ${message}`);
        await say({
          text: `:x: An error occurred while processing your request: ${message}`,
          thread_ts: event.ts,
        });
      }
    });
  } else {
    // Default mention handler
    app.event('app_mention', async ({ event, say }) => {
      await say({
        text: `Hi <@${event.user}>! Use \`/archguard help\` to see available commands.`,
        thread_ts: event.ts,
      });
    });
  }

  // Handle reaction_added events
  if (eventHandlers.onReaction) {
    const reactionHandler = eventHandlers.onReaction;
    app.event('reaction_added', async ({ event }) => {
      try {
        await reactionHandler({
          user: event.user,
          reaction: event.reaction,
          itemUser: event.item_user ?? '',
          channel: 'item' in event && event.item && typeof event.item === 'object' && 'channel' in event.item
            ? (event.item as Record<string, string>).channel
            : '',
          ts: 'item' in event && event.item && typeof event.item === 'object' && 'ts' in event.item
            ? (event.item as Record<string, string>).ts
            : '',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[ArchGuard Slack] Error handling reaction: ${message}`);
      }
    });
  }

  // Handle app_home_opened events
  if (eventHandlers.onAppHomeOpened) {
    const appHomeHandler = eventHandlers.onAppHomeOpened;
    app.event('app_home_opened', async ({ event }) => {
      try {
        await appHomeHandler({
          user: event.user,
          tab: event.tab,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[ArchGuard Slack] Error handling app home opened: ${message}`);
      }
    });
  }

  // ── Register Action Handlers ────────────────────────────────────

  // Handle button clicks from ArchGuard messages
  app.action('view_pr', async ({ ack }) => {
    // URL buttons are handled by Slack natively, just acknowledge
    await ack();
  });

  app.action('view_details', async ({ ack, respond }) => {
    await ack();
    // Placeholder: in a full implementation, this would fetch and display details
    if (respond) {
      await respond({
        text: 'Fetching details...',
        response_type: 'ephemeral',
      });
    }
  });

  // ── Global Error Handler ────────────────────────────────────────
  app.error(async (error) => {
    console.error(`[ArchGuard Slack] Unhandled error: ${error.message}`);
  });

  return app;
}

/**
 * Start the Slack app and begin listening for events.
 *
 * @param app - The Slack Bolt app instance
 * @param port - Port to listen on (default: 3000)
 */
export async function startSlackApp(
  app: App,
  port?: number
): Promise<void> {
  const listenPort = port ?? 3000;

  await app.start(listenPort);
  console.log(`[ArchGuard Slack] App is running on port ${listenPort}`);
}

/**
 * Stop the Slack app gracefully.
 *
 * @param app - The Slack Bolt app instance
 */
export async function stopSlackApp(app: App): Promise<void> {
  await app.stop();
  console.log('[ArchGuard Slack] App stopped');
}
