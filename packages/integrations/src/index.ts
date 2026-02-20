/**
 * @archguard/integrations - External Service Integrations
 * GitHub App, Bitbucket, and Slack integrations for ArchGuard.
 * This package provides webhook handlers, PR bots, and notification
 * integrations for GitHub, Bitbucket, and Slack.
 */

// ─── GitHub ───────────────────────────────────────────────────────

export {
  createGitHubApp,
  type GitHubAppConfig,
  type GitHubAppHandlers,
  type PushEventContext,
  type PushCommit,
} from './github/app.js';

export {
  handlePREvent,
  type PREventContext,
  type PRBotOptions,
  type PRBotResult,
} from './github/pr-bot.js';

export {
  createArchGuardCheckRun,
  createInProgressCheckRun,
  type CheckRunContext,
  type CheckRunResult,
} from './github/check-run.js';

export {
  createGitHubClient,
  getDiff as getGitHubDiff,
  createComment as createGitHubComment,
  createReview as createGitHubReview,
  createCheckRun as createGitHubCheckRun,
  getFile as getGitHubFile,
  getPR as getGitHubPR,
  type GitHubClientOptions,
  type RepoRef,
  type PRRef,
  type GitHubFileDiff,
  type InlineCommentPosition,
  type ReviewComment,
  type CheckConclusion,
  type CheckRunOptions,
  type CheckAnnotation,
  type GitHubPR,
} from './github/api.js';

// ─── Bitbucket ────────────────────────────────────────────────────

export {
  createBitbucketWebhookHandler,
  verifyWebhookSignature,
  type BitbucketWebhookConfig,
  type BitbucketWebhookHandlers,
  type BitbucketWebhookEvent,
  type BitbucketPRWebhookPayload,
  type WebhookHandlerResult,
} from './bitbucket/webhook.js';

export {
  handleBitbucketPREvent,
  type BitbucketPREventContext,
  type BitbucketPRBotOptions,
  type BitbucketPRBotResult,
} from './bitbucket/pr-bot.js';

export {
  createBitbucketClient,
  getDiff as getBitbucketDiff,
  getRawDiff as getBitbucketRawDiff,
  createComment as createBitbucketComment,
  createBuildStatus as createBitbucketBuildStatus,
  getFile as getBitbucketFile,
  getPR as getBitbucketPR,
  type BitbucketClientOptions,
  type BitbucketClient,
  type BitbucketRepoRef,
  type BitbucketPRRef,
  type BitbucketFileDiff,
  type BitbucketInlinePosition,
  type BitbucketComment,
  type BitbucketBuildState,
  type BuildStatusOptions,
  type BitbucketPR,
} from './bitbucket/api.js';

// ─── Slack ────────────────────────────────────────────────────────

export {
  createSlackApp,
  startSlackApp,
  stopSlackApp,
  type SlackAppConfig,
  type SlackAppEventHandlers,
  type MentionEvent,
  type ReactionEvent,
  type AppHomeEvent,
} from './slack/app.js';

export {
  createArchGuardCommandHandler,
  type SlackCommandDataProvider,
} from './slack/commands.js';

export {
  sendViolationAlert,
  sendDriftAlert,
  sendVelocityDigest,
  sendSummary,
  sendBlockerAlert,
  sendThreadedReply,
  updateMessage,
  type NotificationResult,
  type SlackClient,
} from './slack/notifications.js';

export {
  buildViolationAlertBlocks,
  buildDriftAlertBlocks,
  buildVelocityDigestBlocks,
  buildWorkSummaryBlocks,
  buildBlockerAlertBlocks,
  buildDecisionListBlocks,
  buildStatusBlocks,
  type SlackBlock,
  type SlackTextField,
  type SlackElement,
  type SlackAttachment,
  type SlackMessage,
} from './slack/blocks.js';
