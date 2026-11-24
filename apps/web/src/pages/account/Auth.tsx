import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { hasRole, LANGS, type Lang, type Role } from '@afb/schema';
import type { TotpSecret } from 'firebase/auth';
import { authMessage, useAuth } from '@/lib/auth';
import { setLanguage } from '@/lib/i18n';
import { Card, Page, Pill } from '@/components/ui';

function Field({ label, type = 'text', value, onChange, autoComplete, required = true, minLength, inputMode }: {
  label: string; type?: string; value: string; onChange: (v: string) => void; autoComplete?: string; required?: boolean; minLength?: number; inputMode?: 'numeric' | 'email';
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="grid gap-1 text-[13px] font-semibold text-muted">
      {label}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        inputMode={inputMode}
        className="min-h-[44px] rounded-lg border border-line bg-surface px-3 text-[15px] text-ink"
      />
    </label>
  );
}

function Alert({ kind, children }: { kind: 'error' | 'ok'; children: ReactNode }) {
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={`m-0 rounded-lg px-3 py-2 text-[14px] ${kind === 'error' ? 'bg-[#fde8dc] text-[#8f1f0d]' : 'bg-[#e3f1e7] text-[#1d5e36]'}`}>
      {children}
    </p>
  );
}

const nextOf = (p: URLSearchParams) => {
  const n = p.get('next') ?? '/account';
  return n.startsWith('/') && !n.startsWith('//') ? n : '/account';
};

function TwoStepPrompt() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await auth.completeTwoStep(code.trim());
    } catch (x) {
      setErr(authMessage(x));
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-3" aria-labelledby="mfa-h">
      <h2 id="mfa-h" className="m-0 font-body text-[17px] font-bold">{t('auth.twoStepTitle')}</h2>
      <p className="m-0 text-muted">{t('auth.twoStepPrompt')}</p>
      <Field label={t('auth.code')} value={code} onChange={setCode} autoComplete="one-time-code" inputMode="numeric" />
      {err && <Alert kind="error">{err}</Alert>}
      <button className="btn btn-primary justify-center">{t('auth.verify')}</button>
    </form>
  );
}

function GoogleButton({ onError }: { onError: (m: string) => void }) {
  const { t } = useTranslation();
  const auth = useAuth();
  return (
    <button
      type="button"
      className="btn justify-center"
      onClick={() => auth.signInGoogle().catch((e) => onError(authMessage(e)))}
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.2 5.6c4.2-3.9 7.1-9.6 7.1-16.9z" />
        <path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.8-6.1z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.7 2.3-8.7 2.3-6.3 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z" />
      </svg>
      {t('auth.google')}
    </button>
  );
}

export function SignIn() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (auth.user) nav(nextOf(params), { replace: true });
  }, [auth.user, nav, params]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await auth.signInEmail(email.trim(), password);
    } catch (x) {
      setErr(authMessage(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page kicker={t('section.account')} title={t('page.signin')} lead={t('auth.signinLead')}>
      <Card className="max-w-md">
        {auth.pendingTwoStep ? (
          <TwoStepPrompt />
        ) : (
          <div className="grid gap-3">
            <GoogleButton onError={setErr} />
            <p className="m-0 text-center text-[13px] text-muted">{t('auth.or')}</p>
            <form onSubmit={submit} className="grid gap-3">
              <Field label={t('auth.email')} type="email" value={email} onChange={setEmail} autoComplete="email" inputMode="email" />
              <Field label={t('auth.password')} type="password" value={password} onChange={setPassword} autoComplete="current-password" />
              {err && <Alert kind="error">{err}</Alert>}
              <button className="btn btn-primary justify-center" disabled={busy}>
                {t('auth.signinButton')}
              </button>
            </form>
            <p className="m-0 text-[14px]">
              <Link to="/reset">{t('auth.forgot')}</Link> · <Link to={`/signup?next=${encodeURIComponent(nextOf(params))}`}>{t('page.signup')}</Link>
            </p>
          </div>
        )}
      </Card>
    </Page>
  );
}

export function SignUp() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    if (password.length < 8) return setErr(t('auth.passwordRule'));
    setBusy(true);
    try {
      await auth.signUp(name.trim(), email.trim(), password);
      setDone(true);
    } catch (x) {
      setErr(authMessage(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page kicker={t('section.account')} title={t('page.signup')} lead={t('auth.signupLead')}>
      <Card className="max-w-md">
        {done ? (
          <div className="grid gap-3">
            <Alert kind="ok">{t('auth.verifySent', { email })}</Alert>
            <Link to="/account" className="btn btn-primary justify-center no-underline">
              {t('page.account')}
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            <GoogleButton onError={setErr} />
            <p className="m-0 text-center text-[13px] text-muted">{t('auth.or')}</p>
            <form onSubmit={submit} className="grid gap-3">
              <Field label={t('auth.name')} value={name} onChange={setName} autoComplete="name" />
              <Field label={t('auth.email')} type="email" value={email} onChange={setEmail} autoComplete="email" inputMode="email" />
              <Field label={t('auth.password')} type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
              <p className="m-0 text-[12.5px] text-muted">{t('auth.passwordRule')}</p>
              {err && <Alert kind="error">{err}</Alert>}
              <button className="btn btn-primary justify-center" disabled={busy}>
                {t('auth.signupButton')}
              </button>
              <p className="m-0 text-[12.5px] text-muted">
                {t('auth.termsNote')} <Link to="/about/terms">{t('page.terms')}</Link>
              </p>
            </form>
            <p className="m-0 text-[14px]">
              <Link to="/signin">{t('auth.haveAccount')}</Link>
            </p>
          </div>
        )}
      </Card>
    </Page>
  );
}

export function Reset() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await auth.resetPassword(email.trim());
      setSent(true);
    } catch (x) {
      // Do not reveal whether an account exists.
      if ((x as { code?: string }).code === 'auth/user-not-found') setSent(true);
      else setErr(authMessage(x));
    }
  };
  return (
    <Page kicker={t('section.account')} title={t('page.reset')} lead={t('auth.resetLead')}>
      <Card className="max-w-md">
        {sent ? (
          <Alert kind="ok">{t('auth.resetSent', { email })}</Alert>
        ) : (
          <form onSubmit={submit} className="grid gap-3">
            <Field label={t('auth.email')} type="email" value={email} onChange={setEmail} autoComplete="email" inputMode="email" />
            {err && <Alert kind="error">{err}</Alert>}
            <button className="btn btn-primary justify-center">{t('auth.resetButton')}</button>
          </form>
        )}
        <p className="m-0 mt-3 text-[14px]">
          <Link to="/signin">{t('page.signin')}</Link>
        </p>
      </Card>
    </Page>
  );
}

function TotpEnrol() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [secret, setSecret] = useState<{ secret: TotpSecret; uri: string; key: string } | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  if (ok || auth.twoStep) return <Alert kind="ok">{t('auth.twoStepOn')}</Alert>;
  return (
    <div className="grid gap-3">
      {!secret ? (
        <button
          type="button"
          className="btn btn-primary justify-self-start"
          onClick={() =>
            auth
              .startTotpEnrolment()
              .then(setSecret)
              .catch((e) => setErr((e as { code?: string }).code === 'auth/requires-recent-login' ? t('auth.recentLogin') : authMessage(e)))
          }
        >
          {t('auth.twoStepStart')}
        </button>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setErr('');
            auth.finishTotpEnrolment(secret.secret, code.trim()).then(() => setOk(true), (x) => setErr(authMessage(x)));
          }}
        >
          <ol className="m-0 grid gap-1 ps-5 text-[14px]">
            <li>{t('auth.twoStep1')}</li>
            <li>
              {t('auth.twoStep2')}{' '}
              <code data-no-tr className="break-all rounded bg-[#f3e9dc] px-1.5 py-0.5 text-[14px]">{secret.key}</code>{' '}
              <a href={secret.uri}>{t('auth.twoStepOpen')}</a>
            </li>
            <li>{t('auth.twoStep3')}</li>
          </ol>
          <Field label={t('auth.code')} value={code} onChange={setCode} autoComplete="one-time-code" inputMode="numeric" />
          <button className="btn btn-primary justify-self-start">{t('auth.verify')}</button>
        </form>
      )}
      {err && <Alert kind="error">{err}</Alert>}
    </div>
  );
}

export function Account() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    setName(auth.profile?.name ?? auth.user?.displayName ?? '');
    setOrg(auth.profile?.org ?? '');
  }, [auth.profile, auth.user]);
  if (!auth.ready) return null;
  if (!auth.user) return <Navigate to="/signin?next=/account" replace />;
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await auth.updateProfile({ name: name.trim(), org: org.trim() || null });
      setMsg(t('auth.saved'));
    } catch (x) {
      setMsg(authMessage(x));
    }
  };
  return (
    <Page kicker={t('section.account')} title={t('page.account')} actions={<button type="button" className="btn" onClick={() => void auth.signOut()}>{t('auth.signOut')}</button>}>
      {!auth.user.emailVerified && auth.user.providerData.some((p) => p.providerId === 'password') && (
        <Card>
          <p className="m-0">
            {t('auth.unverified', { email: auth.user.email })}{' '}
            <button type="button" className="font-semibold text-sec-ink underline" onClick={() => auth.resendVerification().then(() => setMsg(t('auth.verifySent', { email: auth.user?.email })))}>
              {t('auth.resend')}
            </button>
          </p>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('auth.profile')}>
          <form onSubmit={save} className="grid gap-3">
            <p className="m-0 text-[14px]">
              <span data-no-tr>{auth.user.email}</span> · <Pill tone="neutral">{t(`auth.role.${auth.role}`)}</Pill>
            </p>
            <Field label={t('auth.name')} value={name} onChange={setName} autoComplete="name" />
            <Field label={t('auth.org')} value={org} onChange={setOrg} autoComplete="organization" required={false} />
            <label className="grid gap-1 text-[13px] font-semibold text-muted">
              {t('a11y.language')}
              <select
                className="min-h-[44px] rounded-lg border border-line bg-surface px-2 text-[15px] text-ink"
                value={auth.profile?.language ?? 'en'}
                onChange={(e) => {
                  const l = e.target.value as Lang;
                  void setLanguage(l);
                  void auth.updateProfile({ language: l });
                }}
              >
                {LANGS.map((l) => (
                  <option key={l} value={l}>
                    {{ en: 'English', fr: 'Français', pt: 'Português', ar: 'العربية', sw: 'Kiswahili' }[l]}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-primary justify-self-start">{t('auth.save')}</button>
            {msg && <Alert kind="ok">{msg}</Alert>}
          </form>
        </Card>
        <Card title={t('auth.twoStepTitle')}>
          <p className="m-0 mb-3 text-muted">{auth.needsTwoStep ? t('auth.twoStepRequired') : t('auth.twoStepWhy')}</p>
          <TotpEnrol />
        </Card>
      </div>
      <Card>
        <p className="m-0 flex flex-wrap gap-3">
          <Link to="/account/saved">{t('page.saved')}</Link>
          <Link to="/account/alerts">{t('page.alerts')}</Link>
          <Link to="/account/api-keys">{t('page.apiKeys')}</Link>
          {auth.can('verifier') && <Link to="/admin">{t('page.adminHome')}</Link>}
        </p>
      </Card>
    </Page>
  );
}

/** Wraps a page that needs a role. Staff roles also need two-step verification. */
export function RequireRole({ min, children }: { min: Role; children: ReactNode }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const loc = useLocation();
  if (!auth.ready) return null;
  if (!auth.user) return <Navigate to={`/signin?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  // Role is enough to open staff pages; two-step is enforced by the rules and functions on every protected
  // change, and the admin console shows a banner until it is on.
  if (!hasRole(auth.role, min)) {
    const missingFactor = auth.needsTwoStep && auth.role !== 'member';
    return (
      <Page kicker={t('section.admin')} title={t('auth.noAccessTitle')} lead={missingFactor ? t('auth.twoStepRequired') : t('auth.noAccess')}>
        <Card>
          <Link to="/account" className="btn btn-primary no-underline">
            {t('page.account')}
          </Link>
        </Card>
      </Page>
    );
  }
  return <>{children}</>;
}
