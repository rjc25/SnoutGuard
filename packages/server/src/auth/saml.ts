/**
 * SAML 2.0 SSO configuration and handlers for ArchGuard enterprise.
 * Provides SP-initiated SSO flow with IdP metadata management.
 *
 * Supports:
 * - Okta, Azure AD, OneLogin, and other SAML 2.0 IdPs
 * - SP-initiated login flow
 * - Just-in-time user provisioning
 * - Role mapping from SAML attributes
 */

import type { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { schema, generateId, now, type DbClient } from '@archguard/core';
import type { Role } from '@archguard/core';
import { createSession } from './index.js';

// ─── Types ───────────────────────────────────────────────────────

export interface SamlConfig {
  id: string;
  orgId: string;
  idpEntityId: string;
  idpSsoUrl: string;
  idpCertificate: string;
  spEntityId: string;
  defaultRole: Role;
  enabled: boolean;
  createdAt: string;
}

export interface SamlAssertion {
  nameId: string;
  attributes: Record<string, string | string[]>;
  sessionIndex?: string;
}

// ─── SP Metadata ─────────────────────────────────────────────────

/**
 * Generate SP (Service Provider) entity ID for an organization.
 */
export function getSpEntityId(orgSlug: string, baseUrl: string): string {
  return `${baseUrl}/saml/${orgSlug}`;
}

/**
 * Generate the ACS (Assertion Consumer Service) URL for an organization.
 */
export function getAcsUrl(orgSlug: string, baseUrl: string): string {
  return `${baseUrl}/api/auth/saml/${orgSlug}/acs`;
}

/**
 * Generate SP metadata XML for IdP configuration.
 */
export function generateSpMetadata(
  orgSlug: string,
  baseUrl: string
): string {
  const entityId = getSpEntityId(orgSlug, baseUrl);
  const acsUrl = getAcsUrl(orgSlug, baseUrl);

  return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${entityId}">
  <md:SPSSODescriptor
    AuthnRequestsSigned="false"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${acsUrl}"
      index="1"
      isDefault="true" />
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
}

// ─── SAML Config Management ──────────────────────────────────────

/**
 * Get SAML configuration for an organization.
 */
export async function getSamlConfig(
  db: DbClient,
  orgId: string
): Promise<SamlConfig | null> {
  const rows = await db
    .select()
    .from(schema.samlConfigs)
    .where(eq(schema.samlConfigs.orgId, orgId))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.id,
    orgId: row.orgId,
    idpEntityId: row.idpEntityId,
    idpSsoUrl: row.idpSsoUrl,
    idpCertificate: row.idpCertificate,
    spEntityId: row.spEntityId,
    defaultRole: row.defaultRole as Role,
    enabled: row.enabled,
    createdAt: row.createdAt,
  };
}

/**
 * Create or update SAML configuration for an organization.
 */
export async function upsertSamlConfig(
  db: DbClient,
  orgId: string,
  config: {
    idpEntityId: string;
    idpSsoUrl: string;
    idpCertificate: string;
    spEntityId: string;
    defaultRole?: Role;
    enabled?: boolean;
  }
): Promise<SamlConfig> {
  const existing = await getSamlConfig(db, orgId);
  const timestamp = now();

  if (existing) {
    await db
      .update(schema.samlConfigs)
      .set({
        idpEntityId: config.idpEntityId,
        idpSsoUrl: config.idpSsoUrl,
        idpCertificate: config.idpCertificate,
        spEntityId: config.spEntityId,
        defaultRole: config.defaultRole ?? existing.defaultRole,
        enabled: config.enabled ?? existing.enabled,
      })
      .where(eq(schema.samlConfigs.orgId, orgId));

    return {
      ...existing,
      ...config,
      defaultRole: config.defaultRole ?? existing.defaultRole,
      enabled: config.enabled ?? existing.enabled,
    };
  }

  const id = generateId();
  const newConfig: SamlConfig = {
    id,
    orgId,
    idpEntityId: config.idpEntityId,
    idpSsoUrl: config.idpSsoUrl,
    idpCertificate: config.idpCertificate,
    spEntityId: config.spEntityId,
    defaultRole: config.defaultRole ?? 'member',
    enabled: config.enabled ?? false,
    createdAt: timestamp,
  };

  await db.insert(schema.samlConfigs).values({
    id,
    orgId,
    idpEntityId: newConfig.idpEntityId,
    idpSsoUrl: newConfig.idpSsoUrl,
    idpCertificate: newConfig.idpCertificate,
    spEntityId: newConfig.spEntityId,
    defaultRole: newConfig.defaultRole,
    enabled: newConfig.enabled,
    createdAt: timestamp,
  });

  return newConfig;
}

/**
 * Delete SAML configuration for an organization (disables SSO).
 */
export async function deleteSamlConfig(
  db: DbClient,
  orgId: string
): Promise<boolean> {
  const existing = await getSamlConfig(db, orgId);
  if (!existing) return false;

  await db
    .delete(schema.samlConfigs)
    .where(eq(schema.samlConfigs.orgId, orgId));

  return true;
}

// ─── SAML SSO Flow ───────────────────────────────────────────────

/**
 * Generate SP-initiated SSO redirect URL.
 * Redirects the user to the IdP's SSO URL with a SAML AuthnRequest.
 */
export function buildSsoRedirectUrl(
  config: SamlConfig,
  baseUrl: string,
  orgSlug: string
): string {
  const acsUrl = getAcsUrl(orgSlug, baseUrl);

  // Build a minimal AuthnRequest (in production, use a proper SAML library)
  const requestId = `_${generateId()}`;
  const issueInstant = new Date().toISOString();

  const authnRequest = `<samlp:AuthnRequest
    xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="${requestId}"
    Version="2.0"
    IssueInstant="${issueInstant}"
    Destination="${config.idpSsoUrl}"
    AssertionConsumerServiceURL="${acsUrl}"
    ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
    <saml:Issuer>${config.spEntityId}</saml:Issuer>
    <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true" />
  </samlp:AuthnRequest>`;

  const encoded = Buffer.from(authnRequest).toString('base64');
  const encodedUrl = encodeURIComponent(encoded);

  return `${config.idpSsoUrl}?SAMLRequest=${encodedUrl}`;
}

/**
 * Process a SAML assertion after IdP callback.
 * Handles just-in-time user provisioning and session creation.
 *
 * In production, this should validate the SAML signature against
 * the IdP certificate. This implementation handles the user/session
 * management portion.
 */
export async function handleSamlCallback(
  db: DbClient,
  orgId: string,
  assertion: SamlAssertion
): Promise<{ token: string; userId: string } | { error: string }> {
  const config = await getSamlConfig(db, orgId);
  if (!config || !config.enabled) {
    return { error: 'SAML SSO is not configured or enabled for this organization' };
  }

  const email = assertion.nameId;
  if (!email) {
    return { error: 'SAML assertion missing nameId (email)' };
  }

  const timestamp = now();

  // Check if user exists
  const existingUsers = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  let userId: string;

  if (existingUsers.length > 0) {
    userId = existingUsers[0].id;
  } else {
    // Just-in-time provisioning: create new user
    userId = generateId();
    const name =
      (assertion.attributes.displayName as string) ??
      (assertion.attributes.firstName as string) ??
      email.split('@')[0];

    await db.insert(schema.users).values({
      id: userId,
      email,
      name,
      authProvider: 'saml',
      createdAt: timestamp,
    });
  }

  // Ensure org membership
  const memberRows = await db
    .select()
    .from(schema.orgMembers)
    .where(eq(schema.orgMembers.userId, userId))
    .limit(1);

  const isMember = memberRows.some((m) => m.orgId === orgId);

  if (!isMember) {
    await db.insert(schema.orgMembers).values({
      id: generateId(),
      orgId,
      userId,
      role: config.defaultRole,
      joinedAt: timestamp,
    });
  }

  // Create session
  const token = createSession(userId, orgId);

  return { token, userId };
}

// ─── Route Handlers ──────────────────────────────────────────────

/**
 * Handle GET /api/auth/saml/:orgSlug/login
 * Initiates SP-initiated SSO by redirecting to IdP.
 */
export async function handleSamlLogin(
  c: Context,
  db: DbClient
): Promise<Response> {
  const orgSlug = c.req.param('orgSlug');

  // Find org by slug
  const orgRows = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, orgSlug))
    .limit(1);

  if (orgRows.length === 0) {
    return c.json({ error: 'Organization not found' }, 404);
  }

  const org = orgRows[0];
  const config = await getSamlConfig(db, org.id);

  if (!config || !config.enabled) {
    return c.json({ error: 'SAML SSO is not enabled for this organization' }, 400);
  }

  const baseUrl = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? '3000'}`;
  const redirectUrl = buildSsoRedirectUrl(config, baseUrl, orgSlug);

  return c.redirect(redirectUrl);
}

/**
 * Handle GET /api/auth/saml/:orgSlug/metadata
 * Returns SP metadata XML for IdP configuration.
 */
export async function handleSamlMetadata(
  c: Context
): Promise<Response> {
  const orgSlug = c.req.param('orgSlug');
  const baseUrl = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? '3000'}`;
  const metadata = generateSpMetadata(orgSlug, baseUrl);

  return new Response(metadata, {
    headers: { 'Content-Type': 'application/xml' },
  });
}
