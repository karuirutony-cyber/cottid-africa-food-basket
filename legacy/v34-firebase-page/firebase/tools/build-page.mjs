// Builds public/index.html from the platform page in base/: adds the account button, dialogs and the Firebase
// connection. The page keeps working on its own data if Firebase cannot be reached.
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, readPage, pagePath } from './page.mjs';

let s = readPage();
if (!existsSync(join(ROOT, 'public', 'fire.js'))) throw new Error('Run npm run build:fire first.');

const CSS = `<style id="afb-css">
.acct{font:600 13px var(--body,system-ui);border:1px solid var(--line,#ddd);background:var(--surface,#fff);color:var(--fg,#222);padding:7px 14px;border-radius:99px;cursor:pointer;flex:none;white-space:nowrap}
.acct.in{background:color-mix(in srgb,var(--paprika,#b4441c) 10%,#fff);border-color:color-mix(in srgb,var(--paprika,#b4441c) 35%,#ddd);color:var(--paprika,#b4441c)}
.acct:focus-visible,.afb-dlg :is(button,input,textarea):focus-visible{outline:3px solid color-mix(in srgb,var(--paprika,#b4441c) 45%,transparent);outline-offset:2px}
.afb-dlg{border:0;padding:0;border-radius:18px;max-width:min(460px,calc(100vw - 24px));width:100%;background:var(--surface,#fff);color:var(--fg,#222);box-shadow:0 24px 60px rgba(58,36,22,.28)}
.afb-dlg::backdrop{background:rgba(43,26,15,.45)}
.afb-dlg:has(.afb-wide){max-width:min(760px,calc(100vw - 24px))}
.afb-box{position:relative;padding:34px 24px 22px;display:grid;gap:12px;background:var(--kiondo,none) 0 0/auto 10px repeat-x}
.afb-box h2{margin:0;font:700 24px/1.15 var(--display,Georgia,serif)}
.afb-box h3{margin:8px 0 0;font:700 15px var(--body,system-ui)}
.afb-sub{margin:0;color:var(--muted,#666);font-size:14px}
.afb-x{position:absolute;top:18px;right:14px;border:0;background:none;font-size:24px;line-height:1;cursor:pointer;color:var(--muted,#666)}
[dir="rtl"] .afb-x{right:auto;left:14px}
.afb-f{display:grid;gap:4px;font-size:13px;font-weight:600}
.afb-f input,.afb-f textarea,.afb-in{font:15px var(--body,system-ui);padding:10px 12px;border:1px solid var(--line,#ddd);border-radius:10px;background:#fff;color:var(--fg,#222);flex:1;min-width:0}
.afb-google{display:flex;align-items:center;justify-content:center;gap:10px;padding:11px 14px;border-radius:12px;margin:0}
.afb-or{display:flex;align-items:center;gap:10px;margin:2px 0;color:var(--muted,#666);font-size:12.5px}
.afb-or::before,.afb-or::after{content:"";flex:1;border-top:1px solid var(--line,#ddd)}
.afb-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.afb-row .btn{margin:0}.afb-end{justify-content:flex-end}
.afb-msg{margin:0;min-height:1.2em;font-size:13.5px;color:#2e6b2f}.afb-msg.bad{color:#a1261a}
.afb-list{list-style:none;margin:0;padding:0;display:grid;gap:6px;max-height:40vh;overflow:auto}
.afb-list li{display:flex;gap:10px;align-items:baseline;justify-content:space-between;padding:8px 10px;border:1px solid var(--line,#ddd);border-radius:10px;background:var(--tint2,#faf6f1)}
.afb-list li.afb-item{display:grid;gap:8px}.afb-list li.afb-item p{margin:4px 0}
.afb-empty{color:var(--muted,#666);font-size:13.5px;justify-content:flex-start!important}
.afb-meta{color:var(--muted,#666);font-size:12px}.afb-meta.st-approved{color:#2e6b2f}.afb-meta.st-rejected{color:#a1261a}
.afb-del{border:0;background:none;color:var(--muted,#666);cursor:pointer;font-size:12px;text-decoration:underline}
.foot-suggest{margin-top:10px;font:600 13px var(--body,system-ui);border:1px solid var(--line,#ddd);background:#fff;color:var(--fg,#222);padding:7px 14px;border-radius:99px;cursor:pointer}
@media (max-width:720px){.acct{padding:6px 10px}}
@media print{.acct,.foot-suggest{display:none!important}}
</style>`;

// Reference page globals only if the page defines them.
const has = (n) => new RegExp(`(const|let|var|function)\\s+${n}\\b`).test(s);
const names = ['$', 'esc', 'show', 'store', 'I18N', 'CALLS', 'EVENTS', 'REG', 'CALLUI', 'EVUI'];
const pageObj = names.map((n) => `${JSON.stringify(n)}: ${has(n.replace('$', '\\$')) ? n : 'undefined'}`).join(', ');

const GLUE = `
<script src="fire.js" defer></script>
<script>
window.addEventListener('load', () => {
  try {
    if (!window.CottidFireLib) return;
    const page = { ${pageObj} };
    const fire = window.AFB_FIRE = CottidFireLib.start(page);
    if (!fire) return;
    CottidFireLib.overlay(fire, page);
    const foot = document.querySelector('#foot') || document.querySelector('footer');
    if (foot && !document.querySelector('.foot-suggest')) { const b = document.createElement('button'); b.type = 'button'; b.className = 'foot-suggest'; b.textContent = 'Suggest a correction'; b.addEventListener('click', () => fire.openSuggest()); foot.appendChild(b); }
    // Any form with data-afb-signup becomes a launch-list sign-up (fields: email, org, role).
    document.querySelectorAll('form[data-afb-signup]').forEach((f) => f.addEventListener('submit', async (e) => {
      e.preventDefault(); const v = (n) => (f.elements[n] || {}).value || '';
      try { await CottidFireLib.signup(fire, { email: v('email'), org: v('org'), role: v('role') }); f.innerHTML = '<p class="afb-msg">Thank you. You are on the list.</p>'; }
      catch (err) { alert('Could not sign you up. Please try again.'); }
    }));
  } catch (e) { console.warn('Firebase layer not started', e); }
});
</script>
`;

// The roots used by the language layer should include dialogs, so they translate too.
s = s.replace("'.panel:not([hidden])']", "'.panel:not([hidden])', 'dialog[open]', 'footer']");
s = s.replace('</head>', CSS + '\n</head>');
const k = s.lastIndexOf('</body>');
s = s.slice(0, k) + GLUE + s.slice(k);
writeFileSync(join(ROOT, 'public', 'index.html'), s);
console.log(`public/index.html built from ${pagePath()} (${(s.length / 1024 / 1024).toFixed(1)} MB)`);
