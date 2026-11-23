// Africa Food Basket Platform: Firebase connection.
// Sign-in (Google, email), profiles with roles, saved views, corrections, review queue, live directory.
// Bundled by `npm run build:fire` into public/fire.js and loaded after the page. If Firebase cannot be
// reached, the public page still runs from its embedded data.
// Collections are created automatically on first write: users (on first sign-in), users/{uid}/saved,
// submissions, auditLog. Public collections (published_*, meta) are filled by `npm run seed`.
import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification,
  updateProfile, signOut,
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, addDoc, updateDoc,
  deleteDoc, collection, getDocs, query, where, orderBy, limit, serverTimestamp,
} from 'firebase/firestore';

// Web app configuration. These values identify the project; they are not secrets.
// Access is controlled by firebase/firestore.rules and the sign-in methods enabled in the console.
export const firebaseConfig = {
  apiKey: 'AIzaSyDcr9GjSDlrUWL_chpsxBvDQKBTKxeaTRE',
  authDomain: 'cottid-72d51.firebaseapp.com',
  projectId: 'cottid-72d51',
  storageBucket: 'cottid-72d51.firebasestorage.app',
  messagingSenderId: '237588065418',
  appId: '1:237588065418:web:f983f4077f2c2682cc1173',
  measurementId: 'G-MQ08CVE5EF',
};

const RANK = { visitor: 0, member: 1, contributor: 2, verifier: 3, content_editor: 4, data_steward: 5, platform_admin: 6, super_admin: 7 };
const ROLE_NAME = { member: 'Member', contributor: 'Contributor', verifier: 'Verifier', content_editor: 'Content editor', data_steward: 'Data steward', platform_admin: 'Platform admin', super_admin: 'Super admin' };

const ERR = {
  'auth/invalid-credential': 'Email or password is not right.', 'auth/wrong-password': 'Email or password is not right.',
  'auth/user-not-found': 'No account uses that email.', 'auth/email-already-in-use': 'An account already uses that email. Sign in instead.',
  'auth/weak-password': 'Use at least 8 characters for the password.', 'auth/invalid-email': 'Enter a valid email address.',
  'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.', 'auth/network-request-failed': 'No connection. Try again when you are online.',
  'auth/unauthorized-domain': 'This web address is not authorised for sign-in. Add it under Authentication > Settings > Authorised domains.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
};

export function start(page) {
  const $ = page.$ || ((q) => document.querySelector(q));
  const esc = page.esc || ((s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const show = page.show || (() => {});
  const I18N = page.I18N;
  const storeGet = (k) => { try { return (page.store && page.store.get(k)) || localStorage.getItem(k) || ''; } catch (e) { return ''; } };

  let app, auth, db;
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
    isSupported().then((ok) => ok && getAnalytics(app)).catch(() => {});
  } catch (e) { console.warn('Firebase unavailable', e); return null; }

  let user = null, prof = null;
  const tr = () => { try { I18N && I18N.apply(); } catch (e) { /* optional */ } };
  const atLeast = (r) => prof && RANK[prof.role] >= RANK[r];
  const tabNow = () => document.body.dataset.tab || location.hash.slice(1) || 'home';
  const say = (el, msg, bad) => { el.textContent = msg; el.classList.toggle('bad', !!bad); };
  const authError = (e) => ERR[e && e.code] || 'Something went wrong. Try again.';

  // ---------- Top-bar button ----------
  const btn = document.createElement('button');
  btn.id = 'acct'; btn.className = 'acct'; btn.type = 'button'; btn.textContent = 'Sign in';
  const langsel = document.querySelector('.langsel');
  const host = (langsel && langsel.parentNode) || document.querySelector('.toprow') || document.querySelector('nav') || document.body;
  host.insertBefore(btn, langsel || host.firstChild);

  const dlg = (id, html) => { const d = document.createElement('dialog'); d.id = id; d.className = 'afb-dlg'; d.innerHTML = html; document.body.appendChild(d); d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); }); return d; };
  const open = (d) => { d.showModal(); tr(); };

  const GOOGLE = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

  const dSign = dlg('afb-sign', `<form method="dialog" class="afb-box" novalidate>
    <button type="button" class="afb-x" data-close aria-label="Close">×</button>
    <h2>Sign in to Africa Food Basket</h2>
    <p class="afb-sub">Save your views, suggest corrections and, for reviewers, open the review queue. Reading the platform needs no account.</p>
    <button type="button" class="btn afb-google" id="afb-google">${GOOGLE}<span>Continue with Google</span></button>
    <p class="afb-or"><span>or with email</span></p>
    <label class="afb-f" id="afb-name-row" hidden><span>Full name</span><input id="afb-name" autocomplete="name"></label>
    <label class="afb-f"><span>Email</span><input id="afb-email" type="email" autocomplete="email" required></label>
    <label class="afb-f"><span>Password</span><input id="afb-pass" type="password" autocomplete="current-password" minlength="8" required></label>
    <p class="afb-msg" id="afb-msg" role="status" aria-live="polite"></p>
    <div class="afb-row"><button type="submit" class="btn primary" id="afb-go">Sign in</button>
    <button type="button" class="linkbtn" id="afb-mode">Create an account</button>
    <button type="button" class="linkbtn" id="afb-reset">Forgot password</button></div>
  </form>`);

  const dAcct = dlg('afb-acct', `<div class="afb-box">
    <button type="button" class="afb-x" data-close aria-label="Close">×</button>
    <h2 id="afb-who">Your account</h2><p class="afb-sub" id="afb-role"></p>
    <p class="afb-msg" id="afb-verify" hidden></p>
    <div class="afb-row"><button type="button" class="btn primary" id="afb-save">Save this view</button>
    <button type="button" class="btn" id="afb-suggest-open">Suggest a correction</button>
    <button type="button" class="btn" id="afb-review-open" hidden>Review queue</button></div>
    <div class="afb-row" id="afb-save-row" hidden><input id="afb-save-name" class="afb-in" maxlength="80" aria-label="Name for this view"><button type="button" class="btn primary" id="afb-save-go">Save</button></div>
    <h3>Saved views</h3><ul class="afb-list" id="afb-saved"><li class="afb-empty">Nothing saved yet.</li></ul>
    <h3>Your suggestions</h3><ul class="afb-list" id="afb-mine"><li class="afb-empty">No suggestions yet.</li></ul>
    <p class="afb-msg" id="afb-acct-msg" role="status" aria-live="polite"></p>
    <div class="afb-row afb-end"><button type="button" class="linkbtn" id="afb-out">Sign out</button></div>
  </div>`);

  const dSug = dlg('afb-sug', `<form method="dialog" class="afb-box" novalidate>
    <button type="button" class="afb-x" data-close aria-label="Close">×</button>
    <h2>Suggest a correction</h2>
    <p class="afb-sub">Tell us what is wrong or missing on this page. A reviewer checks it against the source before anything changes.</p>
    <label class="afb-f"><span>Page</span><input id="afb-s-page" readonly></label>
    <label class="afb-f"><span>What should change</span><textarea id="afb-s-text" rows="5" maxlength="4000" required></textarea></label>
    <label class="afb-f"><span>Source link</span><input id="afb-s-src" type="url" placeholder="https://"></label>
    <p class="afb-msg" id="afb-s-msg" role="status" aria-live="polite"></p>
    <div class="afb-row"><button type="submit" class="btn primary">Send for review</button></div>
  </form>`);

  const dRev = dlg('afb-rev', `<div class="afb-box afb-wide">
    <button type="button" class="afb-x" data-close aria-label="Close">×</button>
    <h2>Review queue</h2><p class="afb-sub">Pending suggestions, newest first. Add a note, then approve or reject.</p>
    <ul class="afb-list" id="afb-queue"><li class="afb-empty">Loading…</li></ul>
  </div>`);

  // ---------- Sign in ----------
  let mode = 'in';
  const setMode = (m) => { mode = m; $('#afb-name-row').hidden = m !== 'up'; $('#afb-go').textContent = m === 'up' ? 'Create account' : 'Sign in'; $('#afb-mode').textContent = m === 'up' ? 'I already have an account' : 'Create an account'; $('#afb-pass').autocomplete = m === 'up' ? 'new-password' : 'current-password'; say($('#afb-msg'), ''); tr(); };
  $('#afb-mode').addEventListener('click', () => setMode(mode === 'up' ? 'in' : 'up'));
  getRedirectResult(auth).catch(() => {});
  $('#afb-google').addEventListener('click', async () => {
    const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
    try { await signInWithPopup(auth, p); dSign.close(); }
    catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
        try { await signInWithRedirect(auth, p); } catch (e2) { say($('#afb-msg'), authError(e2), true); }
      } else say($('#afb-msg'), authError(e), true);
    }
  });
  dSign.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const em = $('#afb-email').value.trim(), pw = $('#afb-pass').value, nm = $('#afb-name').value.trim();
    if (!em || pw.length < 8) { say($('#afb-msg'), 'Enter your email and a password of at least 8 characters.', true); return; }
    say($('#afb-msg'), mode === 'up' ? 'Creating your account…' : 'Signing in…');
    try {
      if (mode === 'up') {
        const c = await createUserWithEmailAndPassword(auth, em, pw);
        if (nm) await updateProfile(c.user, { displayName: nm });
        await sendEmailVerification(c.user).catch(() => {});
        await ensureProfile(c.user, nm);
      } else await signInWithEmailAndPassword(auth, em, pw);
      dSign.close();
    } catch (err) { say($('#afb-msg'), authError(err), true); }
  });
  $('#afb-reset').addEventListener('click', async () => {
    const em = $('#afb-email').value.trim();
    if (!em) { say($('#afb-msg'), 'Enter your email above, then choose Forgot password.', true); return; }
    try { await sendPasswordResetEmail(auth, em); say($('#afb-msg'), 'Check your email for a link to reset your password.'); }
    catch (err) { say($('#afb-msg'), authError(err), true); }
  });

  btn.addEventListener('click', () => { if (user) { refreshAcct(); open(dAcct); } else { setMode('in'); open(dSign); } });
  $('#afb-out').addEventListener('click', async () => { await signOut(auth); dAcct.close(); });

  // ---------- Profile: users/{uid} is created on first sign-in ----------
  async function ensureProfile(u, nameHint) {
    const ref = doc(db, 'users', u.uid);
    const lang = (I18N && I18N.lang) || document.documentElement.lang || 'en';
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { name: nameHint || u.displayName || '', email: u.email || '', role: 'member', lang, provider: (u.providerData[0] || {}).providerId || 'password', createdAt: serverTimestamp(), lastSeen: serverTimestamp() });
        return (await getDoc(ref)).data();
      }
      updateDoc(ref, { lastSeen: serverTimestamp(), lang }).catch(() => {});
      return snap.data();
    } catch (e) { console.warn('Profile not available', e); return { role: 'member', name: u.displayName || '', email: u.email }; }
  }

  onAuthStateChanged(auth, async (u) => {
    user = u; prof = null;
    if (!u) { btn.textContent = 'Sign in'; btn.classList.remove('in'); btn.title = ''; tr(); return; }
    prof = await ensureProfile(u);
    const nm = (prof && prof.name) || u.displayName || u.email || 'Account';
    btn.textContent = nm.split(' ')[0].slice(0, 18); btn.classList.add('in'); btn.title = u.email || '';
    tr();
  });

  function refreshAcct() {
    $('#afb-who').textContent = (prof && prof.name) || user.displayName || user.email;
    $('#afb-role').textContent = `${user.email || ''} · ${ROLE_NAME[prof && prof.role] || 'Member'}`;
    const v = $('#afb-verify');
    v.hidden = user.emailVerified || (user.providerData[0] || {}).providerId !== 'password';
    v.textContent = 'Please confirm your email address: we sent you a link.';
    $('#afb-review-open').hidden = !atLeast('verifier');
    $('#afb-save-row').hidden = true; say($('#afb-acct-msg'), '');
    listSaved(); listMine();
  }

  // ---------- Saved views: the page's own settings, reopened exactly ----------
  const snapshot = () => { const o = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^(cottid-|afb-lang)/.test(k)) o[k] = localStorage.getItem(k); } } catch (e) { /* blocked */ } return o; };
  $('#afb-save').addEventListener('click', () => {
    const tab = tabNow(), title = ((document.querySelector(`#p-${tab} h2`) || {}).textContent || tab).trim();
    $('#afb-save-name').value = title.slice(0, 80); $('#afb-save-row').hidden = false; $('#afb-save-name').focus();
  });
  $('#afb-save-go').addEventListener('click', async () => {
    const tab = tabNow(), name = $('#afb-save-name').value.trim() || tab;
    try { await addDoc(collection(db, 'users', user.uid, 'saved'), { name, tab, settings: snapshot(), createdAt: serverTimestamp() }); $('#afb-save-row').hidden = true; say($('#afb-acct-msg'), 'View saved.'); listSaved(); }
    catch (e) { say($('#afb-acct-msg'), 'The view could not be saved. Check your connection and try again.', true); }
  });
  async function listSaved() {
    const ul = $('#afb-saved');
    try {
      const qs = await getDocs(query(collection(db, 'users', user.uid, 'saved'), orderBy('createdAt', 'desc'), limit(50)));
      if (qs.empty) { ul.innerHTML = '<li class="afb-empty">Nothing saved yet.</li>'; tr(); return; }
      ul.innerHTML = qs.docs.map((d) => `<li><button type="button" class="linkbtn" data-open="${d.id}">${esc(d.data().name)}</button><span class="afb-meta">${esc(d.data().tab)}</span><button type="button" class="afb-del" data-del="${d.id}">Delete</button></li>`).join('');
      ul.onclick = async (e) => {
        const o = e.target.closest('[data-open]'), x = e.target.closest('[data-del]');
        if (o) { const d = qs.docs.find((z) => z.id === o.dataset.open).data(); try { Object.entries(d.settings || {}).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('afb-open-tab', d.tab); } catch (err) { /* ignore */ } location.reload(); }
        if (x) { await deleteDoc(doc(db, 'users', user.uid, 'saved', x.dataset.del)); listSaved(); }
      };
    } catch (e) { ul.innerHTML = '<li class="afb-empty">Saved views are not available offline.</li>'; }
    tr();
  }
  try { const t = sessionStorage.getItem('afb-open-tab'); if (t) { sessionStorage.removeItem('afb-open-tab'); setTimeout(() => show(t, true), 0); } } catch (e) { /* ignore */ }

  // ---------- Suggest a correction ----------
  $('#afb-suggest-open').addEventListener('click', () => { dAcct.close(); openSuggest(); });
  function openSuggest() {
    if (!user) { setMode('in'); open(dSign); return; }
    $('#afb-s-page').value = tabNow(); $('#afb-s-text').value = ''; $('#afb-s-src').value = ''; say($('#afb-s-msg'), ''); open(dSug);
  }
  dSug.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#afb-s-text').value.trim(), src = $('#afb-s-src').value.trim();
    if (text.length < 10) { say($('#afb-s-msg'), 'Describe the change in a sentence or two.', true); return; }
    if (src && !/^https?:\/\//.test(src)) { say($('#afb-s-msg'), 'The source link should start with https://', true); return; }
    try {
      await addDoc(collection(db, 'submissions'), { uid: user.uid, email: user.email || '', page: $('#afb-s-page').value, market: storeGet('cottid-an-mid'), food: storeGet('cottid-staple'), text, source: src, status: 'pending', createdAt: serverTimestamp() });
      say($('#afb-s-msg'), 'Thank you. Your suggestion is in the review queue.'); setTimeout(() => dSug.close(), 1400);
    } catch (err) { say($('#afb-s-msg'), 'It could not be sent. Check your connection and try again.', true); }
  });
  async function listMine() {
    const ul = $('#afb-mine');
    try {
      const qs = await getDocs(query(collection(db, 'submissions'), where('uid', '==', user.uid), limit(20)));
      ul.innerHTML = qs.empty ? '<li class="afb-empty">No suggestions yet.</li>' : qs.docs.map((d) => `<li><span>${esc(d.data().text.slice(0, 90))}</span><span class="afb-meta st-${esc(d.data().status)}">${esc(d.data().status)}</span></li>`).join('');
    } catch (e) { ul.innerHTML = '<li class="afb-empty">Not available offline.</li>'; }
    tr();
  }

  // ---------- Review queue (verifiers and above) ----------
  $('#afb-review-open').addEventListener('click', () => { dAcct.close(); open(dRev); loadQueue(); });
  async function loadQueue() {
    const ul = $('#afb-queue');
    try {
      const qs = await getDocs(query(collection(db, 'submissions'), where('status', '==', 'pending'), orderBy('createdAt', 'desc'), limit(100)));
      ul.innerHTML = qs.empty ? '<li class="afb-empty">Nothing waiting for review.</li>' : qs.docs.map((d) => {
        const s = d.data();
        return `<li class="afb-item"><div><b>${esc(s.page)}</b> <span class="afb-meta">${esc([s.market, s.food].filter(Boolean).join(' · '))} · ${esc(s.email)}</span><p>${esc(s.text)}</p>${s.source ? `<a href="${esc(s.source)}" target="_blank" rel="noopener">${esc(s.source)}</a>` : ''}</div><input class="afb-in" data-note="${d.id}" placeholder="Note for the record" maxlength="500"><div class="afb-row"><button type="button" class="btn primary" data-ok="${d.id}">Approve</button><button type="button" class="btn" data-no="${d.id}">Reject</button></div></li>`;
      }).join('');
      ul.onclick = async (e) => {
        const b = e.target.closest('[data-ok],[data-no]'); if (!b) return;
        const id = b.dataset.ok || b.dataset.no, status = b.dataset.ok ? 'approved' : 'rejected';
        const note = (ul.querySelector(`[data-note="${id}"]`) || {}).value || '';
        try {
          await updateDoc(doc(db, 'submissions', id), { status, reviewer: user.uid, reviewedAt: serverTimestamp(), note });
          await addDoc(collection(db, 'auditLog'), { actor: user.uid, action: `submission.${status}`, target: `submissions/${id}`, note, at: serverTimestamp() });
          loadQueue();
        } catch (err) { b.closest('li').insertAdjacentHTML('beforeend', '<p class="afb-msg bad">Not saved. You may not have reviewer access.</p>'); }
      };
    } catch (e) { ul.innerHTML = `<li class="afb-empty">The queue could not be loaded (${esc(e.code || 'offline')}).</li>`; }
    tr();
  }

  return { app, auth, db, openSuggest, get user() { return user; }, get profile() { return prof; } };
}

// ---------- Sign-up capture for the launch list (public, no account needed) ----------
export async function signup(fire, { email, org = '', role = '' }) {
  if (!fire || !email) return false;
  const lang = document.documentElement.lang || 'en';
  await addDoc(collection(fire.db, 'signups'), { email: String(email).slice(0, 200), org: String(org).slice(0, 200), role: String(role).slice(0, 80), lang, createdAt: serverTimestamp() });
  return true;
}

// ---------- Live directory: records published in Firestore replace or extend the embedded lists ----------
export async function overlay(fire, page) {
  if (!fire) return 0;
  const { db } = fire; let n = 0;
  const merge = async (col, arr, key, after) => {
    if (!Array.isArray(arr)) return;
    try {
      const qs = await getDocs(collection(db, col));
      qs.forEach((d) => { const r = d.data(); if (r.hidden) return; const i = arr.findIndex((x) => x[key] === r[key]); if (i >= 0) arr[i] = { ...arr[i], ...r }; else arr.push(r); n++; });
      if (!qs.empty && after) after();
    } catch (e) { /* offline or not seeded: keep embedded list */ }
  };
  await Promise.all([
    merge('published_calls', page.CALLS, 'name', () => page.CALLUI && page.CALLUI.draw()),
    merge('published_events', page.EVENTS, 'name', () => page.EVUI && page.EVUI.draw()),
    merge('published_buyers', page.REG && page.REG.buyers, 'ref', () => { const s = document.querySelector('#p-buyers-c'); if (s) s.dispatchEvent(new Event('change')); }),
  ]);
  try { const m = await getDoc(doc(db, 'meta', 'dataset')); if (m.exists()) document.documentElement.dataset.dataset = m.data().version || ''; } catch (e) { /* ignore */ }
  return n;
}
