/**
 * Hono context variable type augmentation.
 * Declares the custom variables set by auth and org-context middleware
 * so that c.get('user'), c.get('orgId'), and c.get('org') are properly typed.
 */

import type { AuthUser } from './auth/rbac.js';
import type { OrgContext } from './middleware/org-context.js';

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
    orgId: string;
    org: OrgContext;
  }
}
