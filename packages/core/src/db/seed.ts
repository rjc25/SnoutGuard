/**
 * Database seed functions for development and testing.
 * Populates the database with sample data to aid local development.
 */

import { generateId, now, hash } from '../utils.js';
import type { DbClient } from './index.js';
import * as schema from './schema.js';

/**
 * Seed the database with a complete set of sample data.
 * Idempotent — checks for existing org before inserting.
 */
export async function seedDatabase(db: DbClient): Promise<void> {
  const timestamp = now();

  // Check if already seeded
  const existingOrgs = await db
    .select()
    .from(schema.organizations)
    .limit(1);

  if (existingOrgs.length > 0) {
    console.log('[seed] Database already contains data, skipping seed.');
    return;
  }

  // ─── Organization ──────────────────────────────────────────────
  const orgId = generateId();
  await db.insert(schema.organizations).values({
    id: orgId,
    name: 'Acme Engineering',
    slug: 'acme-engineering',
    plan: 'teams',
    settings: JSON.stringify({
      llmAnalysis: true,
      languages: ['typescript', 'python'],
      velocityEnabled: true,
      summariesEnabled: true,
      syncFormats: ['claude', 'cursorrules', 'copilot'],
    }),
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  // ─── Users ─────────────────────────────────────────────────────
  const adminId = generateId();
  const devId1 = generateId();
  const devId2 = generateId();

  await db.insert(schema.users).values([
    {
      id: adminId,
      email: 'admin@acme.dev',
      name: 'Alice Admin',
      authProvider: 'email',
      createdAt: timestamp,
    },
    {
      id: devId1,
      email: 'bob@acme.dev',
      name: 'Bob Builder',
      authProvider: 'email',
      createdAt: timestamp,
    },
    {
      id: devId2,
      email: 'carol@acme.dev',
      name: 'Carol Coder',
      authProvider: 'github',
      createdAt: timestamp,
    },
  ]);

  // ─── Org Members ───────────────────────────────────────────────
  await db.insert(schema.orgMembers).values([
    {
      id: generateId(),
      orgId,
      userId: adminId,
      role: 'owner',
      joinedAt: timestamp,
    },
    {
      id: generateId(),
      orgId,
      userId: devId1,
      role: 'member',
      joinedAt: timestamp,
    },
    {
      id: generateId(),
      orgId,
      userId: devId2,
      role: 'member',
      joinedAt: timestamp,
    },
  ]);

  // ─── Repository ────────────────────────────────────────────────
  const repoId = generateId();
  await db.insert(schema.repositories).values({
    id: repoId,
    orgId,
    provider: 'github',
    providerId: '123456',
    name: 'backend-api',
    fullName: 'acme/backend-api',
    defaultBranch: 'main',
    cloneUrl: 'https://github.com/acme/backend-api.git',
    webhookSecret: hash('seed-webhook-secret').slice(0, 40),
    config: '{}',
    createdAt: timestamp,
  });

  // ─── Developers ────────────────────────────────────────────────
  const developer1Id = generateId();
  const developer2Id = generateId();

  await db.insert(schema.developers).values([
    {
      id: developer1Id,
      orgId,
      userId: devId1,
      gitName: 'Bob Builder',
      gitEmail: 'bob@acme.dev',
      githubUsername: 'bob-builder',
      createdAt: timestamp,
    },
    {
      id: developer2Id,
      orgId,
      userId: devId2,
      gitName: 'Carol Coder',
      gitEmail: 'carol@acme.dev',
      githubUsername: 'carol-coder',
      createdAt: timestamp,
    },
  ]);

  // ─── Architectural Decisions ───────────────────────────────────
  const decision1Id = generateId();
  const decision2Id = generateId();
  const decision3Id = generateId();

  await db.insert(schema.decisions).values([
    {
      id: decision1Id,
      repoId,
      title: 'Layered Architecture (Controller → Service → Repository)',
      description:
        'The codebase follows a layered architecture with controllers handling HTTP, services containing business logic, and repositories managing data access.',
      category: 'structural',
      status: 'confirmed',
      confidence: 0.92,
      constraints: JSON.stringify([
        'Controllers must not import repositories directly',
        'Repositories must not contain business logic',
      ]),
      relatedDecisions: '[]',
      tags: JSON.stringify(['architecture', 'layers', 'separation-of-concerns']),
      detectedAt: timestamp,
      confirmedBy: adminId,
      updatedAt: timestamp,
    },
    {
      id: decision2Id,
      repoId,
      title: 'Dependency Injection via Decorators',
      description:
        'Services and repositories are injected using @Injectable and constructor-based DI.',
      category: 'behavioral',
      status: 'detected',
      confidence: 0.78,
      constraints: JSON.stringify([
        'All services must be decorated with @Injectable',
      ]),
      relatedDecisions: JSON.stringify([decision1Id]),
      tags: JSON.stringify(['di', 'decorators', 'ioc']),
      detectedAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: decision3Id,
      repoId,
      title: 'RESTful API with DTO Validation',
      description:
        'All API endpoints use Data Transfer Objects validated with class-validator.',
      category: 'api',
      status: 'confirmed',
      confidence: 0.85,
      constraints: JSON.stringify([
        'All request bodies must use DTOs',
        'DTOs must have validation decorators',
      ]),
      relatedDecisions: '[]',
      tags: JSON.stringify(['api', 'rest', 'validation', 'dto']),
      detectedAt: timestamp,
      confirmedBy: adminId,
      updatedAt: timestamp,
    },
  ]);

  // ─── Evidence ──────────────────────────────────────────────────
  await db.insert(schema.evidence).values([
    {
      id: generateId(),
      decisionId: decision1Id,
      filePath: 'src/controllers/user.controller.ts',
      lineStart: 1,
      lineEnd: 25,
      snippet: 'import { UserService } from "../services/user.service";',
      explanation:
        'Controller imports service layer, not repository directly — consistent with layered architecture.',
    },
    {
      id: generateId(),
      decisionId: decision2Id,
      filePath: 'src/services/user.service.ts',
      lineStart: 3,
      lineEnd: 8,
      snippet: '@Injectable()\nexport class UserService {',
      explanation: 'Service uses @Injectable decorator for dependency injection.',
    },
  ]);

  // ─── Arch Snapshot ─────────────────────────────────────────────
  const snapshotId = generateId();
  await db.insert(schema.archSnapshots).values({
    id: snapshotId,
    repoId,
    commitSha: 'abc123def456',
    driftScore: 0.12,
    decisionCount: 3,
    dependencyStats: JSON.stringify({
      totalModules: 42,
      circularDeps: 1,
      avgCoupling: 0.23,
    }),
    createdAt: timestamp,
  });

  // ─── Drift Event ───────────────────────────────────────────────
  await db.insert(schema.driftEvents).values({
    id: generateId(),
    repoId,
    snapshotId,
    type: 'circular_dep_introduced',
    description:
      'Circular dependency detected between user.service.ts and auth.service.ts',
    severity: 'medium',
    detectedAt: timestamp,
  });

  // ─── Velocity Score ────────────────────────────────────────────
  const periodStart = '2026-02-10';
  const periodEnd = '2026-02-17';

  await db.insert(schema.velocityScores).values([
    {
      id: generateId(),
      developerId: developer1Id,
      repoId,
      period: 'weekly',
      periodStart,
      periodEnd,
      commits: 18,
      prsOpened: 4,
      prsMerged: 3,
      linesAdded: 820,
      linesRemoved: 340,
      weightedEffort: 72,
      architecturalImpact: 45,
      refactoringRatio: 0.3,
      reviewContribution: 60,
      velocityScore: 68,
      trend: 'accelerating',
      blockers: '[]',
      calculatedAt: timestamp,
    },
    {
      id: generateId(),
      developerId: developer2Id,
      repoId,
      period: 'weekly',
      periodStart,
      periodEnd,
      commits: 12,
      prsOpened: 3,
      prsMerged: 2,
      linesAdded: 450,
      linesRemoved: 180,
      weightedEffort: 55,
      architecturalImpact: 30,
      refactoringRatio: 0.45,
      reviewContribution: 75,
      velocityScore: 58,
      trend: 'stable',
      blockers: JSON.stringify([
        {
          type: 'stalled_pr',
          description: 'PR #42 has no reviewer activity for 4 days',
          severity: 'medium',
          relatedEntity: 'https://github.com/acme/backend-api/pull/42',
          staleSince: '2026-02-13T00:00:00.000Z',
        },
      ]),
      calculatedAt: timestamp,
    },
  ]);

  // ─── Work Summary ──────────────────────────────────────────────
  await db.insert(schema.workSummaries).values({
    id: generateId(),
    developerId: developer1Id,
    orgId,
    type: 'sprint_review',
    periodStart,
    periodEnd,
    content:
      '## Sprint Review — Bob Builder\n\n### Key Deliverables\n- Implemented user authentication flow (PR #38)\n- Added rate limiting middleware (PR #39)\n- Refactored database connection pooling (PR #41)\n\n### Velocity\n- 18 commits, 3 PRs merged\n- Velocity score: 68 (accelerating)\n- 30% of changes were refactoring\n\n### Architectural Impact\n- Introduced middleware chain pattern for auth\n- Improved connection pool configuration in repository layer',
    dataPoints: JSON.stringify({
      commits: 18,
      prsOpened: 4,
      prsMerged: 3,
      reviewsGiven: 5,
      violationsIntroduced: 1,
      violationsResolved: 3,
      filesChanged: 22,
      keyPrs: [
        'https://github.com/acme/backend-api/pull/38',
        'https://github.com/acme/backend-api/pull/39',
        'https://github.com/acme/backend-api/pull/41',
      ],
    }),
    generatedAt: timestamp,
  });

  // ─── Sync History ──────────────────────────────────────────────
  await db.insert(schema.syncHistory).values([
    {
      id: generateId(),
      repoId,
      format: 'claude',
      outputPath: 'CLAUDE.md',
      decisionsCount: 3,
      syncedAt: timestamp,
    },
    {
      id: generateId(),
      repoId,
      format: 'cursorrules',
      outputPath: '.cursorrules',
      decisionsCount: 3,
      syncedAt: timestamp,
    },
  ]);

  console.log('[seed] Database seeded with sample data.');
  console.log(`  Organization: Acme Engineering (${orgId})`);
  console.log(`  Users: admin@acme.dev (owner), bob@acme.dev, carol@acme.dev`);
  console.log(`  Repository: acme/backend-api`);
  console.log(`  Decisions: 3, Snapshot: 1, Velocity: 2, Summary: 1`);
}

/**
 * Seed minimal test data for integration tests.
 * Creates a single org, user, and repo for test isolation.
 */
export async function seedTestData(db: DbClient): Promise<{
  orgId: string;
  userId: string;
  repoId: string;
}> {
  const timestamp = now();
  const orgId = generateId();
  const userId = generateId();
  const repoId = generateId();

  await db.insert(schema.organizations).values({
    id: orgId,
    name: 'Test Org',
    slug: 'test-org',
    plan: 'free',
    settings: '{}',
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await db.insert(schema.users).values({
    id: userId,
    email: 'test@example.com',
    name: 'Test User',
    authProvider: 'email',
    createdAt: timestamp,
  });

  await db.insert(schema.orgMembers).values({
    id: generateId(),
    orgId,
    userId,
    role: 'owner',
    joinedAt: timestamp,
  });

  await db.insert(schema.repositories).values({
    id: repoId,
    orgId,
    provider: 'github',
    providerId: 'test-repo-1',
    name: 'test-repo',
    fullName: 'test-org/test-repo',
    defaultBranch: 'main',
    cloneUrl: 'https://github.com/test-org/test-repo.git',
    config: '{}',
    createdAt: timestamp,
  });

  return { orgId, userId, repoId };
}
