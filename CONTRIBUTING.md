# Contributing to ArchGuard

Thanks for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/rjc25/ArchGuard
cd ArchGuard
pnpm install
pnpm build
pnpm test

# Link CLI for local development
npm link packages/cli
```

## Project Structure

```
packages/
  core/           # Shared types, DB, LLM client, git helpers, cost tracking
  analyzer/       # Codebase analysis engine
  context-sync/   # AI agent context file generation (LLM-powered)
  mcp-server/     # MCP server for real-time guidance
  reviewer/       # Architectural code review
  velocity/       # Team velocity tracking
  work-summary/   # Work summary generation
  integrations/   # GitHub, Bitbucket, Slack
  server/         # Hono API server
  dashboard/      # Next.js web dashboard
  cli/            # CLI entry point
```

## Making Changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `pnpm build` to verify the build passes
4. Run `pnpm test` to verify tests pass
5. Submit a pull request

## Reporting Issues

Open an issue on GitHub with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- ArchGuard version (`archguard --version`)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
