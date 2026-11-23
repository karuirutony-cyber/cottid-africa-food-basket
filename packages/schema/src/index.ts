import { z } from 'zod';

/** Platform languages. Arabic is laid out right to left. */
export const LANGS = ['en', 'fr', 'pt', 'ar', 'sw'] as const;
export type Lang = (typeof LANGS)[number];
export const RTL_LANGS: readonly Lang[] = ['ar'];
export const LangSchema = z.enum(LANGS);

/** Platform roles, lowest to highest. `visitor` means not signed in and is never stored. */
export const ROLES = [
  'visitor',
  'member',
  'contributor',
  'verifier',
  'content_editor',
  'data_steward',
  'platform_admin',
  'super_admin',
] as const;
export type Role = (typeof ROLES)[number];
export const RoleSchema = z.enum(ROLES);

export const ORG_ROLES = ['org_member', 'org_analyst', 'org_admin'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** True when `role` is at least `min` in the platform hierarchy. */
export function hasRole(role: Role | undefined | null, min: Role): boolean {
  return ROLES.indexOf(role ?? 'visitor') >= ROLES.indexOf(min);
}

/** Roles that must use two-step verification (TOTP). */
export function requiresTwoStep(role: Role | undefined | null): boolean {
  return hasRole(role, 'verifier');
}

export const UserProfileSchema = z.object({
  name: z.string().max(200),
  email: z.string().email(),
  role: RoleSchema.exclude(['visitor']),
  org: z.string().max(120).nullable(),
  language: LangSchema,
});
export type UserProfile = z.infer<typeof UserProfileSchema>;
