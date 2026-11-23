import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { call, callMessage } from '@/lib/call';
import { Card, Page, Pill, Select } from '@/components/ui';

interface OrgInfo {
  org: { id: string; name: string; plan: string };
  myRole: 'org_member' | 'org_analyst' | 'org_admin';
  members: { uid: string; role: string; email: string; name: string }[];
  invites: { id: string; email: string; role: string }[];
}
interface Invite {
  id: string;
  orgId: string;
  orgName: string;
  role: string;
}

function useOrg() {
  const auth = useAuth();
  const orgId = auth.profile?.org ?? null;
  const [info, setInfo] = useState<OrgInfo | null>(null);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => {
    if (!auth.user) return;
    if (orgId) call<OrgInfo>('orgInfo', { orgId }).then(setInfo, (e) => setErr(callMessage(e)));
    else setInfo(null);
    call<{ items: Invite[] }>('myInvites').then((r) => setInvites(r.items), () => setInvites([]));
  }, [auth.user, orgId]);
  useEffect(load, [load]);
  return { auth, orgId, info, invites, err, setErr, load };
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="grid min-w-[220px] flex-1 gap-1 text-[13px] font-semibold text-muted">
      {label}
      <input id={id} type={type} required value={value} onChange={(e) => onChange(e.target.value)} className="min-h-[44px] rounded-lg border border-line bg-surface px-3 text-[15px] text-ink" />
    </label>
  );
}

const roleTone = (r: string) => (r === 'org_admin' ? 'go' : r === 'org_analyst' ? 'neutral' : 'watch');

/** Your organisation, or create one; open invitations. */
export function OrgHome() {
  const { t } = useTranslation();
  const { auth, info, invites, err, setErr, load } = useOrg();
  const [name, setName] = useState('');
  if (!auth.ready) return null;
  if (!auth.user) return <Navigate to="/signin?next=/org" replace />;
  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await call('createOrg', { name: name.trim() });
      window.location.reload(); // the profile now carries the organisation
    } catch (x) {
      setErr(callMessage(x));
    }
  };
  const accept = async (i: Invite) => {
    try {
      await call('acceptInvite', { orgId: i.orgId, inviteId: i.id });
      window.location.reload();
    } catch (x) {
      setErr(callMessage(x));
    }
  };
  return (
    <Page kicker={t('section.org')} title={info ? info.org.name : t('page.org')} lead={t('org.lead')}>
      {err && (
        <p role="alert" className="m-0 rounded-lg bg-[#fde8dc] px-3 py-2 text-[#8f1f0d]">
          {err}
        </p>
      )}
      {invites && invites.length > 0 && (
        <Card title={t('org.invitations')}>
          <ul className="m-0 grid list-none gap-2 p-0">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <b data-no-tr>{i.orgName}</b> · {t(`org.role.${i.role}`)}
                </span>
                <button type="button" className="btn btn-primary" onClick={() => void accept(i)}>
                  {t('org.accept')}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {info ? (
        <Card>
          <p className="m-0">
            {t('org.yourRole')}: <Pill tone={roleTone(info.myRole)}>{t(`org.role.${info.myRole}`)}</Pill> · {t('org.members', { n: info.members.length })} · {t('org.plan')}: {info.org.plan}
          </p>
          <p className="m-0 mt-3 flex flex-wrap gap-3">
            <Link to="/org/members">{t('page.members')}</Link>
            {info.myRole === 'org_admin' && <Link to="/org/settings">{t('page.settings')}</Link>}
            <button type="button" className="text-sec-ink underline" onClick={load}>
              {t('system.retry')}
            </button>
          </p>
        </Card>
      ) : (
        <Card title={t('org.create')}>
          <form onSubmit={create} className="flex flex-wrap items-end gap-2">
            <Field label={t('org.name')} value={name} onChange={setName} />
            <button className="btn btn-primary">{t('org.createButton')}</button>
          </form>
        </Card>
      )}
    </Page>
  );
}

export function OrgMembers() {
  const { t } = useTranslation();
  const { auth, info, err, setErr, load } = useOrg();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('org_member');
  const [msg, setMsg] = useState('');
  if (!auth.ready) return null;
  if (!auth.user) return <Navigate to="/signin?next=/org/members" replace />;
  if (!auth.profile?.org) return <Navigate to="/org" replace />;
  const admin = info?.myRole === 'org_admin';
  const run = async (name: string, data: unknown, ok: string) => {
    setErr('');
    try {
      await call(name, data);
      setMsg(ok);
      load();
    } catch (x) {
      setErr(callMessage(x));
    }
  };
  return (
    <Page kicker={t('section.org')} title={t('page.members')} lead={info?.org.name}>
      {err && (
        <p role="alert" className="m-0 rounded-lg bg-[#fde8dc] px-3 py-2 text-[#8f1f0d]">
          {err}
        </p>
      )}
      {msg && (
        <p role="status" className="m-0 rounded-lg bg-[#e3f1e7] px-3 py-2 text-[#1d5e36]">
          {msg}
        </p>
      )}
      {admin && (
        <Card title={t('org.invite')}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run('inviteMember', { orgId: info!.org.id, email: email.trim(), role }, t('org.invited', { email }));
              setEmail('');
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <Field label={t('auth.email')} type="email" value={email} onChange={setEmail} />
            <Select label={t('org.roleLabel')} value={role} onChange={setRole} className="min-w-[180px]">
              {['org_member', 'org_analyst', 'org_admin'].map((r) => (
                <option key={r} value={r}>
                  {t(`org.role.${r}`)}
                </option>
              ))}
            </Select>
            <button className="btn btn-primary">{t('org.inviteButton')}</button>
          </form>
        </Card>
      )}
      <Card>
        {!info ? (
          <p className="m-0 text-muted">{t('status.loading')}</p>
        ) : (
          <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('auth.name')}</th>
                  <th>{t('auth.email')}</th>
                  <th>{t('org.roleLabel')}</th>
                  {admin && <th />}
                </tr>
              </thead>
              <tbody>
                {info.members.map((m) => (
                  <tr key={m.uid}>
                    <td data-no-tr>{m.name || '–'}</td>
                    <td data-no-tr>{m.email}</td>
                    <td>
                      {admin && m.uid !== auth.user!.uid ? (
                        <select aria-label={`${t('org.roleLabel')}: ${m.email}`} value={m.role} onChange={(e) => void run('setMemberRole', { orgId: info.org.id, uid: m.uid, role: e.target.value }, t('auth.saved'))} className="min-h-[36px] rounded-lg border border-line bg-surface px-2">
                          {['org_member', 'org_analyst', 'org_admin'].map((r) => (
                            <option key={r} value={r}>
                              {t(`org.role.${r}`)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Pill tone={roleTone(m.role)}>{t(`org.role.${m.role}`)}</Pill>
                      )}
                    </td>
                    {admin && (
                      <td>
                        {m.uid !== auth.user!.uid && (
                          <button type="button" className="btn min-h-[34px] py-1 text-[13px]" onClick={() => void run('removeMember', { orgId: info.org.id, uid: m.uid }, t('auth.saved'))}>
                            {t('contribute.remove')}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {info.invites.map((i) => (
                  <tr key={i.id} className="text-muted">
                    <td>–</td>
                    <td data-no-tr>{i.email}</td>
                    <td>
                      <Pill tone="watch">{t('org.pending')}</Pill> {t(`org.role.${i.role}`)}
                    </td>
                    {admin && <td />}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Page>
  );
}

export function OrgSettings() {
  const { t } = useTranslation();
  const { auth, info, err, setErr, load } = useOrg();
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (info) setName(info.org.name);
  }, [info]);
  if (!auth.ready) return null;
  if (!auth.user) return <Navigate to="/signin?next=/org/settings" replace />;
  if (!auth.profile?.org) return <Navigate to="/org" replace />;
  return (
    <Page kicker={t('section.org')} title={t('page.settings')} lead={info?.org.name}>
      <Card>
        {info && info.myRole !== 'org_admin' ? (
          <p className="m-0">{t('org.adminsOnly')}</p>
        ) : (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setErr('');
              call('updateOrg', { orgId: info!.org.id, name: name.trim() }).then(
                () => {
                  setMsg(t('auth.saved'));
                  load();
                },
                (x) => setErr(callMessage(x)),
              );
            }}
          >
            <Field label={t('org.name')} value={name} onChange={setName} />
            <button className="btn btn-primary">{t('auth.save')}</button>
          </form>
        )}
        {msg && <p role="status" className="m-0 mt-2 text-[#1d5e36]">{msg}</p>}
        {err && <p role="alert" className="m-0 mt-2 text-[#8f1f0d]">{err}</p>}
      </Card>
    </Page>
  );
}
