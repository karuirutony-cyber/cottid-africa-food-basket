/**
 * Authentication: Google and e-mail/password, profiles via the ensureProfile function, roles from the
 * custom claim, and TOTP two-step for staff. Firebase loads lazily, only when auth is first needed
 * (or straight away when a previous session exists).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MultiFactorResolver, TotpSecret, User } from 'firebase/auth';
import { hasRole, requiresTwoStep, type Role } from '@afb/schema';
import { getFirebase } from './firebase';
import { call } from './call';

export interface Profile {
  name: string;
  email: string;
  role: Exclude<Role, 'visitor'>;
  org: string | null;
  language: string;
}

interface AuthState {
  ready: boolean;
  user: User | null;
  role: Role;
  twoStep: boolean;
  /** settings/security.requireTwoStep: staff need a second factor (true unless switched off). */
  twoStepRequired: boolean;
  profile: Profile | null;
}

interface AuthApi extends AuthState {
  signInGoogle(): Promise<void>;
  signInEmail(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  resendVerification(): Promise<void>;
  signOut(): Promise<void>;
  updateProfile(p: Partial<Pick<Profile, 'name' | 'org' | 'language'>>): Promise<void>;
  /** Set when sign-in needs a second factor; finish with completeTwoStep. */
  pendingTwoStep: MultiFactorResolver | null;
  completeTwoStep(code: string): Promise<void>;
  startTotpEnrolment(): Promise<{ secret: TotpSecret; uri: string; key: string }>;
  finishTotpEnrolment(secret: TotpSecret, code: string): Promise<void>;
  can(min: Role): boolean;
  /** Staff role but no second factor yet: privileged actions are refused until enrolled. */
  needsTwoStep: boolean;
}


/**
 * Makes sure users/{uid} exists. The ensureProfile function does it (and creates settings/platform);
 * if the function is not deployed or not reachable, the client creates the member profile itself,
 * which the security rules allow (own profile, role member, own e-mail, server timestamps).
 */
async function ensureProfileDoc(user: User, extra: { name?: string; language?: string }): Promise<Profile | null> {
  const { db } = await getFirebase();
  try {
    return (await call<{ profile: Profile }>('ensureProfile', extra)).profile;
  } catch (e) {
    console.info('ensureProfile function unavailable; creating the profile from the client', (e as { code?: string }).code ?? e);
  }
  try {
    const fs = await import('firebase/firestore');
    const ref = fs.doc(db, 'users', user.uid);
    const snap = await fs.getDoc(ref);
    if (!snap.exists()) {
      await fs.setDoc(ref, {
        name: extra.name ?? user.displayName ?? '',
        email: user.email ?? '',
        role: 'member',
        org: null,
        language: extra.language ?? 'en',
        createdAt: fs.serverTimestamp(),
        lastSeen: fs.serverTimestamp(),
      });
    } else {
      const fill = extra.name && !snap.get('name') ? { name: extra.name } : {};
      await fs.updateDoc(ref, { lastSeen: fs.serverTimestamp(), ...fill });
    }
    const d = (await fs.getDoc(ref)).data();
    return d ? ({ name: d.name, email: d.email, role: d.role, org: d.org ?? null, language: d.language } as Profile) : null;
  } catch (e) {
    console.warn('Could not create the profile in Firestore', e);
    return null;
  }
}

/** The profile as stored (role included), or null if it cannot be read. */
async function readProfile(uid: string): Promise<Profile | null> {
  try {
    const { db } = await getFirebase();
    const fs = await import('firebase/firestore');
    const d = (await fs.getDoc(fs.doc(db, 'users', uid))).data();
    return d ? ({ name: d.name, email: d.email, role: d.role, org: d.org ?? null, language: d.language } as Profile) : null;
  } catch {
    return null;
  }
}

/** settings/security.requireTwoStep (public); a missing document or a failed read means required. */
async function readTwoStepRequired(): Promise<boolean> {
  try {
    const { db } = await getFirebase();
    const fs = await import('firebase/firestore');
    return (await fs.getDoc(fs.doc(db, 'settings/security'))).get('requireTwoStep') !== false;
  } catch {
    return true;
  }
}

const Ctx = createContext<AuthApi | null>(null);
const HINT = 'afb-had-session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ready: false, user: null, role: 'visitor', twoStep: false, twoStepRequired: true, profile: null });
  const [pendingTwoStep, setPending] = useState<MultiFactorResolver | null>(null);
  const [started, setStarted] = useState(() => {
    try {
      return localStorage.getItem(HINT) === '1';
    } catch {
      return false;
    }
  });

  // Start Firebase only when there may be a session, or when someone opens a sign-in page.
  useEffect(() => {
    if (!started) {
      setState((s) => ({ ...s, ready: true }));
      return;
    }
    let off = () => {};
    void (async () => {
      const { auth } = await getFirebase();
      const { onIdTokenChanged } = await import('firebase/auth');
      let ensuredFor: string | null = null;
      off = onIdTokenChanged(auth, async (user) => {
        if (!user) {
          try {
            localStorage.removeItem(HINT);
          } catch {
            /* ignore */
          }
          setState((s) => ({ ready: true, user: null, role: 'visitor', twoStep: false, twoStepRequired: s.twoStepRequired, profile: null }));
          return;
        }
        try {
          localStorage.setItem(HINT, '1');
        } catch {
          /* ignore */
        }
        let profile: Profile | null = null;
        if (ensuredFor !== user.uid) {
          ensuredFor = user.uid;
          profile = await ensureProfileDoc(user, { language: document.documentElement.lang || 'en' });
          // A new profile gets its role claim from syncRoleClaim; refresh once to pick it up.
          await user.getIdToken(true).catch(() => undefined);
        }
        const tok = await user.getIdTokenResult();
        // The profile role is the source of truth (the rules read it too); the claim mirrors it.
        const known = profile?.role ?? ((await readProfile(user.uid))?.role as Role | undefined);
        const role = (known ?? (tok.claims.role as Role | undefined) ?? 'member') as Role;
        const twoStepRequired = await readTwoStepRequired();
        // VITE_TEST_NO_MFA is set only in the emulator build (.env.emulators), where no authenticator exists.
        const twoStep =
          !!(tok.claims.firebase as { sign_in_second_factor?: string } | undefined)?.sign_in_second_factor ||
          import.meta.env.VITE_TEST_NO_MFA === 'true';
        setState((s) => ({ ready: true, user, role, twoStep, twoStepRequired, profile: profile ?? s.profile }));
      });
    })();
    return () => off();
  }, [started]);

  const withAuth = useCallback(async () => {
    setStarted(true);
    const fb = await getFirebase();
    const mod = await import('firebase/auth');
    return { ...fb, mod };
  }, []);

  const catchMfa = useCallback(
    async (fn: () => Promise<unknown>) => {
      const { auth, mod } = await withAuth();
      try {
        await fn();
      } catch (e) {
        if ((e as { code?: string }).code === 'auth/multi-factor-auth-required') {
          setPending(mod.getMultiFactorResolver(auth, e as Parameters<typeof mod.getMultiFactorResolver>[1]));
          return;
        }
        throw e;
      }
    },
    [withAuth],
  );

  const api = useMemo<AuthApi>(
    () => ({
      ...state,
      pendingTwoStep,
      needsTwoStep: !!state.user && state.twoStepRequired && requiresTwoStep(state.role) && !state.twoStep,
      can: (min) => hasRole(state.role, min) && (!requiresTwoStep(min) || state.twoStep || !state.twoStepRequired),
      async signInGoogle() {
        const { auth, mod } = await withAuth();
        await catchMfa(() => mod.signInWithPopup(auth, new mod.GoogleAuthProvider()));
      },
      async signInEmail(email, password) {
        const { auth, mod } = await withAuth();
        await catchMfa(() => mod.signInWithEmailAndPassword(auth, email, password));
      },
      async signUp(name, email, password) {
        const { auth, mod } = await withAuth();
        const cred = await mod.createUserWithEmailAndPassword(auth, email, password);
        await mod.updateProfile(cred.user, { displayName: name });
        const profile = await ensureProfileDoc(cred.user, { name, language: document.documentElement.lang || 'en' });
        if (profile) setState((s) => ({ ...s, profile }));
        await mod.sendEmailVerification(cred.user, { url: `${location.origin}/account` });
      },
      async resetPassword(email) {
        const { auth, mod } = await withAuth();
        await mod.sendPasswordResetEmail(auth, email, { url: `${location.origin}/signin` });
      },
      async resendVerification() {
        const { auth, mod } = await withAuth();
        if (auth.currentUser) await mod.sendEmailVerification(auth.currentUser, { url: `${location.origin}/account` });
      },
      async signOut() {
        const { auth, mod } = await withAuth();
        await mod.signOut(auth);
      },
      async updateProfile(p) {
        if (!state.user) return;
        const { db } = await getFirebase();
        const { doc, updateDoc } = await import('firebase/firestore');
        await updateDoc(doc(db, `users/${state.user.uid}`), p);
        setState((s) => (s.profile ? { ...s, profile: { ...s.profile, ...p } } : s));
      },
      async completeTwoStep(code) {
        const { mod } = await withAuth();
        const r = pendingTwoStep;
        if (!r) return;
        const hint = r.hints.find((h) => h.factorId === mod.TotpMultiFactorGenerator.FACTOR_ID) ?? r.hints[0]!;
        await r.resolveSignIn(mod.TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code));
        setPending(null);
      },
      async startTotpEnrolment() {
        const { auth, mod } = await withAuth();
        const user = auth.currentUser;
        if (!user) throw new Error('Sign in first.');
        const session = await mod.multiFactor(user).getSession();
        const secret = await mod.TotpMultiFactorGenerator.generateSecret(session);
        return { secret, uri: secret.generateQrCodeUrl(user.email ?? 'account', 'Africa Food Basket'), key: secret.secretKey };
      },
      async finishTotpEnrolment(secret, code) {
        const { auth, mod } = await withAuth();
        const user = auth.currentUser;
        if (!user) throw new Error('Sign in first.');
        await mod.multiFactor(user).enroll(mod.TotpMultiFactorGenerator.assertionForEnrollment(secret, code), 'Authenticator app');
        await user.getIdToken(true);
      },
    }),
    [state, pendingTwoStep, withAuth, catchMfa],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/** Plain-language messages for Firebase auth error codes. */
export function authMessage(e: unknown): string {
  const code = (e as { code?: string }).code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'That e-mail and password do not match an account.',
    'auth/wrong-password': 'That e-mail and password do not match an account.',
    'auth/user-not-found': 'That e-mail and password do not match an account.',
    'auth/email-already-in-use': 'An account already uses that e-mail. Sign in instead, or reset your password.',
    'auth/weak-password': 'Choose a password of at least 8 characters.',
    'auth/invalid-email': 'Enter a valid e-mail address.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/popup-closed-by-user': 'The Google window was closed before signing in.',
    'auth/network-request-failed': 'No connection. Check your network and try again.',
    'auth/invalid-verification-code': 'That code is not right. Enter the current 6-digit code from your app.',
    'auth/unauthorized-domain': 'This address is not yet allowed to sign in. An administrator must add it in Firebase.',
    'auth/operation-not-allowed': 'This sign-in method is not turned on yet.',
  };
  return map[code] ?? (e as Error)?.message ?? 'Something went wrong. Try again.';
}
