import { describe, expect, it } from 'vitest';
import { hasRole, requiresTwoStep, ROLES } from './index';

describe('roles', () => {
  it('orders roles lowest to highest', () => {
    expect(ROLES[0]).toBe('visitor');
    expect(ROLES[ROLES.length - 1]).toBe('super_admin');
  });
  it('compares roles', () => {
    expect(hasRole('member', 'member')).toBe(true);
    expect(hasRole('member', 'verifier')).toBe(false);
    expect(hasRole('super_admin', 'platform_admin')).toBe(true);
    expect(hasRole(undefined, 'member')).toBe(false);
  });
  it('requires two-step from verifier up', () => {
    expect(requiresTwoStep('contributor')).toBe(false);
    expect(requiresTwoStep('verifier')).toBe(true);
    expect(requiresTwoStep('super_admin')).toBe(true);
  });
});
