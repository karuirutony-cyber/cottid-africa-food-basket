import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { firebaseConfig, useEmulators } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { Maintenance } from '@/pages/SystemPage';

/**
 * Maintenance mode (settings/platform.maintenance, set at /admin/settings). Read with one small REST
 * call, so the Firebase SDK is not loaded on every first visit. Staff, sign-in and admin pages stay
 * reachable so the switch can be turned off again.
 */
/** Checked once per browser session (sessionStorage), not on every page. */
async function maintenanceOn(): Promise<boolean> {
  try {
    const cached = sessionStorage.getItem('afb-maintenance');
    if (cached !== null) return cached === '1';
  } catch {
    /* storage blocked */
  }
  const on = await readMaintenance();
  try {
    sessionStorage.setItem('afb-maintenance', on ? '1' : '0');
  } catch {
    /* storage blocked */
  }
  return on;
}

async function readMaintenance(): Promise<boolean> {
  const base = useEmulators ? 'http://127.0.0.1:8080' : 'https://firestore.googleapis.com';
  const url = `${base}/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/settings/platform?mask.fieldPaths=maintenance`;
  try {
    const r = await fetch(url);
    if (!r.ok) return false;
    const j = (await r.json()) as { fields?: { maintenance?: { booleanValue?: boolean } } };
    return j.fields?.maintenance?.booleanValue === true;
  } catch {
    return false;
  }
}

const OPEN = /^\/(admin|signin|signup|reset|account|maintenance)(\/|$)/;

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false);
  const { pathname } = useLocation();
  const auth = useAuth();
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => void maintenanceOn().then((v) => live && setOn(v)), 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, []);
  if (!on) return <>{children}</>;
  if (auth.can('verifier') || OPEN.test(pathname)) {
    return (
      <>
        <p role="status" className="m-0 bg-[#fff3dc] px-4 py-2 text-center text-sm font-semibold text-[#7a4b00]">
          Maintenance mode is on: the public site shows the maintenance page. Turn it off at /admin/settings.
        </p>
        {children}
      </>
    );
  }
  return <Maintenance />;
}
