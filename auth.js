// ═══════════════════════════════════════════════════════════
// EHS Manager – Auth & Permissions Module v3
// Oak Engineering · auth.js
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://evlneudkwqhfowyvnknp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2bG5ldWRrd3FoZm93eXZua25wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNzY4NjgsImV4cCI6MjA5MDg1Mjg2OH0.ARqhc_HiERFnqhZsq75vWNdVDJmj16cldYX7pORwcsY';
const ORGANISATION_ID = 'oak-engineering';

const MODULE_LABELS = {
  datenbank:  { label: 'Datenbank',  icon: '🗄' },
  schulungen: { label: 'Schulungen', icon: '📚' },
  gbu:        { label: 'GBU & BA',   icon: '📋' },
  dashboard:  { label: 'Dashboard',  icon: '📊' },
};
const MODULES = Object.keys(MODULE_LABELS);
const PERM_OPTIONS = [
  { value: 'write', label: 'Lesen + Schreiben' },
  { value: 'read',  label: 'Nur lesen' },
  { value: '',      label: 'Kein Zugriff' },
];

// ── Supabase Client ───────────────────────────────────────
let _sb = null;
function getSB() {
  if (!_sb) _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _sb;
}

// ── Profil-Cache ──────────────────────────────────────────
let _currentProfile = null;
function clearProfileCache() { _currentProfile = null; }

async function getCurrentUser() {
  const { data: { user } } = await getSB().auth.getUser();
  return user;
}

async function getCurrentProfile() {
  if (_currentProfile) return _currentProfile;
  const user = await getCurrentUser();
  if (!user) return null;
  const { data } = await getSB().from('profiles').select('*').eq('id', user.id).single();
  _currentProfile = data;
  return data;
}

// ── Berechtigungen ────────────────────────────────────────
function isAdmin(profile) {
  return (profile || _currentProfile)?.rolle === 'admin';
}
function canRead(modul, profile) {
  profile = profile || _currentProfile;
  if (!profile) return false;
  if (isAdmin(profile)) return true;
  const p = profile.berechtigungen?.[modul];
  return p === 'read' || p === 'write';
}
function canWrite(modul, profile) {
  profile = profile || _currentProfile;
  if (!profile) return false;
  if (isAdmin(profile)) return true;
  return profile.berechtigungen?.[modul] === 'write';
}
function getPerm(modul, profile) {
  profile = profile || _currentProfile;
  if (isAdmin(profile)) return 'write';
  return profile?.berechtigungen?.[modul] || '';
}

// ── Auth Guard ────────────────────────────────────────────
async function requireAuth(onReady) {
  const sb = getSB();
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await _loadProfileAndStart(session.user, onReady);
  } else {
    _showLoginScreen(onReady);
  }
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      clearProfileCache();
      await _loadProfileAndStart(session.user, onReady);
    } else if (event === 'SIGNED_OUT') {
      clearProfileCache();
      _showLoginScreen(onReady);
    }
  });
}

async function _loadProfileAndStart(user, onReady) {
  const { data: profile } = await getSB()
    .from('profiles').select('*').eq('id', user.id).single();
  _currentProfile = profile;
  _hideLoginScreen();
  _hideAccessDenied();
  onReady(user, profile);
}

// ── Login-Screen ──────────────────────────────────────────
let _onReadyRef = null;

function _showLoginScreen(onReady) {
  _onReadyRef = onReady;
  document.getElementById('app-content')?.style.setProperty('display', 'none');
  let overlay = document.getElementById('auth-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:#f5f5f3;z-index:9999;display:flex;align-items:center;justify-content:center;font-family:\'DM Sans\',sans-serif;';
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  _renderLoginForm(overlay);
  setTimeout(() => document.getElementById('auth-email')?.focus(), 100);
}

function _renderLoginForm(overlay) {
  overlay.innerHTML = `
    <div style="background:#fff;border:1px solid #d8d7d2;border-radius:12px;padding:36px;width:100%;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,.1)">
      <div style="text-align:center;margin-bottom:28px">
        <img src="logo.png" alt="Oak Engineering" style="height:36px;margin-bottom:12px;filter:brightness(0)" onerror="this.style.display='none'">
        <div style="font-family:'Barlow',sans-serif;font-size:22px;font-weight:700;color:#1a1a1a">EHS Manager</div>
        <div style="font-size:13px;color:#999;margin-top:4px">Oak Engineering</div>
      </div>
      <div id="auth-error" style="display:none;padding:10px 14px;background:rgba(192,57,43,.08);border:1px solid rgba(192,57,43,.25);border-radius:7px;font-size:13px;color:#c0392b;margin-bottom:14px"></div>
      <div id="auth-success" style="display:none;padding:10px 14px;background:rgba(45,106,45,.08);border:1px solid rgba(45,106,45,.25);border-radius:7px;font-size:13px;color:#2d6a2d;margin-bottom:14px"></div>
      <div id="auth-form-login">
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:12px;font-weight:500;color:#555;margin-bottom:5px">E-Mail</label>
          <input id="auth-email" type="email" placeholder="name@firma.de" style="width:100%;padding:11px 13px;background:#f0efec;border:1px solid #d8d7d2;border-radius:8px;font-size:14px;outline:none;font-family:'DM Sans',sans-serif" onkeydown="if(event.key==='Enter')document.getElementById('auth-pw').focus()">
        </div>
        <div style="margin-bottom:20px">
          <label style="display:block;font-size:12px;font-weight:500;color:#555;margin-bottom:5px">Passwort</label>
          <input id="auth-pw" type="password" placeholder="••••••••" style="width:100%;padding:11px 13px;background:#f0efec;border:1px solid #d8d7d2;border-radius:8px;font-size:14px;outline:none;font-family:'DM Sans',sans-serif" onkeydown="if(event.key==='Enter')authLogin()">
        </div>
        <button onclick="authLogin()" id="auth-btn" style="width:100%;padding:12px;background:#1a1a1a;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif">Anmelden</button>
        <div style="text-align:center;margin-top:16px">
          <button onclick="_showRegisterForm()" style="background:none;border:none;color:#555;font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;text-decoration:underline">Noch kein Konto? Registrieren →</button>
        </div>
      </div>
    </div>`;
}

function _showRegisterForm() {
  const overlay = document.getElementById('auth-overlay');
  overlay.innerHTML = `
    <div style="background:#fff;border:1px solid #d8d7d2;border-radius:12px;padding:36px;width:100%;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,.1)">
      <div style="text-align:center;margin-bottom:24px">
        <img src="logo.png" alt="Oak Engineering" style="height:30px;margin-bottom:10px;filter:brightness(0)" onerror="this.style.display='none'">
        <div style="font-family:'Barlow',sans-serif;font-size:20px;font-weight:700;color:#1a1a1a">Konto erstellen</div>
        <div style="font-size:12px;color:#999;margin-top:4px">Zugriff muss von einem Admin freigegeben werden</div>
      </div>
      <div id="auth-error" style="display:none;padding:10px 14px;background:rgba(192,57,43,.08);border:1px solid rgba(192,57,43,.25);border-radius:7px;font-size:13px;color:#c0392b;margin-bottom:14px"></div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px">
        <div>
          <label style="display:block;font-size:12px;font-weight:500;color:#555;margin-bottom:5px">Name *</label>
          <input id="reg-name" placeholder="Max Mustermann" style="width:100%;padding:10px 12px;background:#f0efec;border:1px solid #d8d7d2;border-radius:8px;font-size:14px;outline:none;font-family:'DM Sans',sans-serif">
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:500;color:#555;margin-bottom:5px">E-Mail *</label>
          <input id="reg-email" type="email" placeholder="max@firma.de" style="width:100%;padding:10px 12px;background:#f0efec;border:1px solid #d8d7d2;border-radius:8px;font-size:14px;outline:none;font-family:'DM Sans',sans-serif">
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:500;color:#555;margin-bottom:5px">Passwort * (min. 8 Zeichen)</label>
          <input id="reg-pw" type="password" placeholder="••••••••" style="width:100%;padding:10px 12px;background:#f0efec;border:1px solid #d8d7d2;border-radius:8px;font-size:14px;outline:none;font-family:'DM Sans',sans-serif">
        </div>
        <div style="padding:10px 14px;background:rgba(183,134,10,.06);border:1px solid rgba(183,134,10,.2);border-radius:7px;font-size:12px;color:#b7860a">
          ℹ Nach der Registrierung erhalten Sie zunächst nur Lesezugriff. Ein Administrator muss Ihnen erweiterte Rechte vergeben.
        </div>
      </div>
      <button onclick="authRegister()" style="width:100%;padding:12px;background:#1a1a1a;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif" id="reg-btn">Konto erstellen</button>
      <div style="text-align:center;margin-top:14px">
        <button onclick="_renderLoginForm(document.getElementById('auth-overlay'))" style="background:none;border:none;color:#555;font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;text-decoration:underline">← Zurück zum Login</button>
      </div>
    </div>`;
  setTimeout(() => document.getElementById('reg-name')?.focus(), 100);
}

async function authRegister() {
  const name = document.getElementById('reg-name')?.value.trim();
  const email = document.getElementById('reg-email')?.value.trim();
  const pw = document.getElementById('reg-pw')?.value;
  const err = document.getElementById('auth-error');
  const btn = document.getElementById('reg-btn');
  if (!name || !email || !pw) { err.textContent = 'Bitte alle Felder ausfüllen.'; err.style.display = 'block'; return; }
  if (pw.length < 8) { err.textContent = 'Passwort muss mindestens 8 Zeichen haben.'; err.style.display = 'block'; return; }
  btn.textContent = 'Registrieren…'; btn.disabled = true; err.style.display = 'none';
  const kuerzel = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
  try {
    const { error } = await getSB().auth.signUp({
      email, password: pw,
      options: { data: { name, kuerzel, rolle: 'mitarbeiter' } }
    });
    if (error) throw error;
    // Overlay mit Erfolgsmeldung
    const overlay = document.getElementById('auth-overlay');
    overlay.innerHTML = `
      <div style="background:#fff;border:1px solid #d8d7d2;border-radius:12px;padding:36px;width:100%;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,.1);text-align:center">
        <div style="font-size:48px;margin-bottom:16px">✅</div>
        <div style="font-family:'Barlow',sans-serif;font-size:20px;font-weight:700;margin-bottom:8px">Konto erstellt!</div>
        <p style="color:#555;font-size:14px;line-height:1.6;margin-bottom:24px">
          Willkommen, ${name}!<br>Ihr Konto wurde angelegt. Ein Administrator wird Ihnen die nötigen Zugriffsrechte vergeben.<br><br>
          <strong>Bitte prüfen Sie Ihre E-Mails</strong> und bestätigen Sie Ihre Adresse.
        </p>
        <button onclick="_renderLoginForm(document.getElementById('auth-overlay'))" style="padding:11px 24px;background:#1a1a1a;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif">Zum Login →</button>
      </div>`;
  } catch(e) {
    err.textContent = e.message?.includes('already registered') ? 'Diese E-Mail ist bereits registriert.' : 'Fehler: ' + e.message;
    err.style.display = 'block'; btn.textContent = 'Konto erstellen'; btn.disabled = false;
  }
}

async function authLogin() {
  const email = document.getElementById('auth-email')?.value.trim();
  const pw = document.getElementById('auth-pw')?.value;
  const btn = document.getElementById('auth-btn');
  const err = document.getElementById('auth-error');
  if (!email || !pw) { err.textContent = 'Bitte E-Mail und Passwort eingeben.'; err.style.display = 'block'; return; }
  btn.textContent = 'Anmelden…'; btn.disabled = true; err.style.display = 'none';
  try {
    const { error } = await getSB().auth.signInWithPassword({ email, password: pw });
    if (error) throw error;
  } catch(e) {
    err.textContent = e.message?.includes('Invalid login') ? 'E-Mail oder Passwort falsch.' : 'Fehler: ' + e.message;
    err.style.display = 'block'; btn.textContent = 'Anmelden'; btn.disabled = false;
  }
}

async function signIn(email, password) {
  const { data, error } = await getSB().auth.signInWithPassword({ email, password });
  if (error) throw error;
  clearProfileCache(); return data;
}

async function signOut() {
  clearProfileCache();
  await getSB().auth.signOut();
}

function _hideLoginScreen() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.style.display = 'none';
  const ac = document.getElementById('app-content');
  if (ac) { ac.style.removeProperty('display'); ac.style.display = 'flex'; }
}

// ── Kein-Zugriff-Banner ───────────────────────────────────
function showAccessDenied(modul) {
  const label = MODULE_LABELS[modul]?.label || modul;
  let el = document.getElementById('access-denied-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'access-denied-banner';
    document.body.appendChild(el);
  }
  el.style.cssText = 'position:fixed;inset:0;background:rgba(245,245,243,.97);z-index:500;display:flex;align-items:center;justify-content:center;font-family:\'DM Sans\',sans-serif;';
  el.innerHTML = `
    <div style="text-align:center;padding:40px;max-width:440px">
      <div style="font-size:56px;margin-bottom:16px">🔒</div>
      <div style="font-family:'Barlow',sans-serif;font-size:22px;font-weight:700;margin-bottom:8px">Kein Zugriff</div>
      <p style="color:#555;font-size:14px;line-height:1.6;margin-bottom:24px">
        Sie haben keinen Zugriff auf das Modul <strong>${label}</strong>.<br>
        Bitte wenden Sie sich an Ihren EHS-Administrator.
      </p>
      <a href="index.html" style="display:inline-block;padding:10px 20px;background:#1a1a1a;color:#fff;border-radius:7px;text-decoration:none;font-size:13px;font-weight:500">← Zurück</a>
    </div>`;
}

function _hideAccessDenied() {
  const el = document.getElementById('access-denied-banner');
  if (el) el.remove();
}

// ═══════════════════════════════════════════════════════════
// NUTZER-VERWALTUNGS-MODAL (global, in jedem Modul verfügbar)
// ═══════════════════════════════════════════════════════════
function _injectNutzerStyles() {
  if (document.getElementById('auth-nm-style')) return;
  const s = document.createElement('style');
  s.id = 'auth-nm-style';
  s.textContent = `
    #auth-nm-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);z-index:8000;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto}
    #auth-nm-overlay.on{display:flex}
    .nm-box{background:#fff;border:1px solid #d8d7d2;border-radius:10px;width:100%;max-width:740px;margin:auto;box-shadow:0 8px 32px rgba(0,0,0,.12)}
    .nm-hd{padding:20px 24px 16px;border-bottom:1px solid #d8d7d2;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .nm-body{padding:20px 24px;max-height:75vh;overflow-y:auto}
    .nm-card{border:1px solid #d8d7d2;border-radius:8px;margin-bottom:10px;overflow:hidden}
    .nm-card-hd{padding:12px 16px;background:#f0efec;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
    .nm-perms{padding:12px 16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:8px}
    .nm-perm-lbl{font-size:11px;color:#555550;font-weight:500;margin-bottom:3px}
    .nm-perm-sel{width:100%;padding:6px 8px;border:1px solid #d8d7d2;border-radius:6px;font-size:12px;background:#f0efec;font-family:'DM Sans',sans-serif;cursor:pointer;outline:none}
    .nm-perm-sel:focus{border-color:#1a1a1a}
    .nm-badge{padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600;letter-spacing:.04em}
    .nm-admin{background:rgba(183,134,10,.2);color:#b7860a;border:1px solid rgba(183,134,10,.3)}
    .nm-ma{background:rgba(45,106,45,.15);color:#2d6a2d;border:1px solid rgba(45,106,45,.25)}
    .nm-av{width:34px;height:34px;border-radius:50%;background:#1a1a1a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}
    #auth-inv-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);z-index:9000;align-items:center;justify-content:center;padding:16px}
    #auth-inv-overlay.on{display:flex}
  `;
  document.head.appendChild(s);
}

function _ensureNutzerModal() {
  _injectNutzerStyles();
  if (document.getElementById('auth-nm-overlay')) return;
  const el = document.createElement('div');
  el.id = 'auth-nm-overlay';
  el.onclick = e => { if (e.target === el) closeNutzerModal(); };
  el.innerHTML = `
    <div class="nm-box">
      <div class="nm-hd">
        <div>
          <div style="font-family:'Barlow',sans-serif;font-size:18px;font-weight:700">👥 Nutzerverwaltung</div>
          <div style="font-size:12px;color:#999990;margin-top:2px">Zugriffsrechte pro Modul vergeben</div>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="openInviteModal()" style="padding:7px 13px;border-radius:6px;background:#1a1a1a;color:#fff;border:none;cursor:pointer;font-size:12px;font-family:'DM Sans',sans-serif">+ Einladen</button>
          <button onclick="closeNutzerModal()" style="padding:7px 11px;border-radius:6px;border:1px solid #d8d7d2;background:transparent;cursor:pointer;font-size:13px">✕</button>
        </div>
      </div>
      <div class="nm-body" id="nm-body">
        <div style="text-align:center;padding:30px;color:#999">Wird geladen…</div>
      </div>
    </div>`;
  document.body.appendChild(el);
}

function _ensureInviteModal() {
  _injectNutzerStyles();
  if (document.getElementById('auth-inv-overlay')) return;
  const el = document.createElement('div');
  el.id = 'auth-inv-overlay';
  el.onclick = e => { if (e.target === el) el.classList.remove('on'); };
  el.innerHTML = `
    <div style="background:#fff;border-radius:10px;padding:24px;width:100%;max-width:440px;box-shadow:0 8px 32px rgba(0,0,0,.12)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
        <div style="font-family:'Barlow',sans-serif;font-size:18px;font-weight:700">Nutzer einladen</div>
        <button onclick="document.getElementById('auth-inv-overlay').classList.remove('on')" style="padding:6px 10px;border-radius:6px;border:1px solid #d8d7d2;background:transparent;cursor:pointer;font-size:13px">✕</button>
      </div>
      <div id="inv-err" style="display:none;padding:9px 12px;background:rgba(192,57,43,.08);border:1px solid rgba(192,57,43,.25);border-radius:7px;font-size:13px;color:#c0392b;margin-bottom:12px"></div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:18px">
        <div>
          <label style="display:block;font-size:12px;font-weight:500;color:#555;margin-bottom:4px">Name *</label>
          <input id="inv-name" placeholder="Max Mustermann" style="width:100%;padding:10px 12px;background:#f0efec;border:1px solid #d8d7d2;border-radius:7px;font-size:14px;outline:none;font-family:'DM Sans',sans-serif">
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:500;color:#555;margin-bottom:4px">E-Mail *</label>
          <input id="inv-email" type="email" placeholder="max@firma.de" style="width:100%;padding:10px 12px;background:#f0efec;border:1px solid #d8d7d2;border-radius:7px;font-size:14px;outline:none;font-family:'DM Sans',sans-serif">
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:500;color:#555;margin-bottom:4px">Initiale Rolle</label>
          <select id="inv-rolle" style="width:100%;padding:10px 12px;background:#f0efec;border:1px solid #d8d7d2;border-radius:7px;font-size:14px;font-family:'DM Sans',sans-serif;outline:none">
            <option value="mitarbeiter">Mitarbeiter (Lesezugriff)</option>
            <option value="admin">Administrator (Vollzugriff)</option>
          </select>
        </div>
        <div style="padding:9px 12px;background:rgba(183,134,10,.06);border:1px solid rgba(183,134,10,.2);border-radius:7px;font-size:12px;color:#b7860a">
          ℹ Der Nutzer erhält eine E-Mail mit einem Einladungslink zum Passwort setzen.
        </div>
      </div>
      <button onclick="submitInvite()" id="inv-btn" style="width:100%;padding:11px;background:#1a1a1a;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif">Einladen & E-Mail senden</button>
    </div>`;
  document.body.appendChild(el);
}

async function openNutzerModal() {
  _ensureNutzerModal();
  document.getElementById('auth-nm-overlay').classList.add('on');
  await _renderNutzerBody();
}

function closeNutzerModal() {
  document.getElementById('auth-nm-overlay')?.classList.remove('on');
}

async function _renderNutzerBody() {
  const body = document.getElementById('nm-body');
  body.innerHTML = '<div style="text-align:center;padding:30px;color:#999">Wird geladen…</div>';
  try {
    const { data: nutzer } = await getSB().from('profiles').select('*').order('name');
    if (!nutzer?.length) { body.innerHTML = '<div style="text-align:center;padding:30px;color:#999">Keine Nutzer gefunden.</div>'; return; }
    body.innerHTML = nutzer.map(n => {
      const isMe = n.id === _currentProfile?.id;
      const admin = isAdmin(n);
      const perms = n.berechtigungen || {};
      const permGrid = admin
        ? `<div style="padding:10px 16px;font-size:12px;color:#999990;font-style:italic">Admins haben automatisch Vollzugriff auf alle Module.</div>`
        : `<div class="nm-perms">${MODULES.map(m => {
            const val = perms[m] || '';
            return `<div>
              <div class="nm-perm-lbl">${MODULE_LABELS[m].icon} ${MODULE_LABELS[m].label}</div>
              <select class="nm-perm-sel" ${isMe?'disabled':''} onchange="nmPermChange('${n.id}','${m}',this.value)">
                ${PERM_OPTIONS.map(o => `<option value="${o.value}" ${val===o.value?'selected':''}>${o.label}</option>`).join('')}
              </select>
            </div>`;
          }).join('')}</div>`;
      return `<div class="nm-card">
        <div class="nm-card-hd">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="nm-av">${(n.kuerzel||n.name?.slice(0,2)||'?').slice(0,3).toUpperCase()}</div>
            <div>
              <div style="font-weight:600;font-size:14px">${n.name||'–'}${isMe?' <span style="font-size:11px;color:#999990">(ich)</span>':''}</div>
              <div style="font-size:12px;color:#999990">${n.kuerzel||''}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="nm-badge ${admin?'nm-admin':'nm-ma'}">${admin?'Admin':'Mitarbeiter'}</span>
            ${!isMe?`<select style="padding:5px 8px;border-radius:6px;border:1px solid #d8d7d2;font-size:11px;background:#f0efec;font-family:'DM Sans',sans-serif;cursor:pointer" onchange="nmRolleChange('${n.id}',this.value)">
              <option value="mitarbeiter" ${!admin?'selected':''}>Mitarbeiter</option>
              <option value="admin" ${admin?'selected':''}>Admin</option>
            </select>`:''}
          </div>
        </div>
        ${permGrid}
      </div>`;
    }).join('');
  } catch(e) {
    body.innerHTML = `<div style="text-align:center;padding:30px;color:#c0392b">Fehler: ${e.message}</div>`;
  }
}

async function nmPermChange(userId, modul, value) {
  try {
    const { data } = await getSB().from('profiles').select('berechtigungen').eq('id', userId).single();
    const current = { ...(data?.berechtigungen || {}) };
    if (value) current[modul] = value; else delete current[modul];
    await getSB().from('profiles').update({ berechtigungen: current }).eq('id', userId);
    if (typeof toast === 'function') toast('Berechtigung gespeichert ✓', 'ok');
  } catch(e) { if (typeof toast === 'function') toast('Fehler: ' + e.message, 'err'); }
}

async function nmRolleChange(userId, rolle) {
  try {
    const updates = { rolle };
    if (rolle === 'admin') {
      const full = {}; MODULES.forEach(m => full[m] = 'write');
      updates.berechtigungen = full;
    }
    await getSB().from('profiles').update(updates).eq('id', userId);
    if (typeof toast === 'function') toast('Rolle aktualisiert ✓', 'ok');
    await _renderNutzerBody();
  } catch(e) { if (typeof toast === 'function') toast('Fehler: ' + e.message, 'err'); }
}

function openInviteModal() {
  _ensureInviteModal();
  document.getElementById('auth-inv-overlay').classList.add('on');
  document.getElementById('inv-err').style.display = 'none';
  ['inv-name','inv-email'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  setTimeout(() => document.getElementById('inv-name')?.focus(), 120);
}

async function submitInvite() {
  const name = document.getElementById('inv-name')?.value.trim();
  const email = document.getElementById('inv-email')?.value.trim();
  const rolle = document.getElementById('inv-rolle')?.value || 'mitarbeiter';
  const err = document.getElementById('inv-err');
  const btn = document.getElementById('inv-btn');
  if (!name || !email) { err.textContent = 'Name und E-Mail erforderlich.'; err.style.display = 'block'; return; }
  btn.textContent = 'Wird gesendet…'; btn.disabled = true; err.style.display = 'none';
  const kuerzel = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
  const berechtigungen = {};
  if (rolle === 'admin') { MODULES.forEach(m => berechtigungen[m] = 'write'); }
  else { MODULES.forEach(m => berechtigungen[m] = 'read'); }
  try {
    const { error } = await getSB().auth.signUp({
      email,
      password: Math.random().toString(36).slice(2,10) + 'Aa1!',
      options: { data: { name, kuerzel, rolle, berechtigungen }, emailRedirectTo: window.location.origin + '/schulungen.html' }
    });
    if (error) throw error;
    document.getElementById('auth-inv-overlay').classList.remove('on');
    if (typeof toast === 'function') toast('Einladung gesendet ✓', 'ok');
    await _renderNutzerBody();
  } catch(e) {
    err.textContent = 'Fehler: ' + e.message; err.style.display = 'block';
    btn.textContent = 'Einladen & E-Mail senden'; btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════
// SUPABASE DATEN-HELFER
// ═══════════════════════════════════════════════════════════

// Datenbank (key/value JSONB)
async function dbGet(key) {
  const { data } = await getSB().from('datenbank').select('data').eq('key', key).single();
  return data?.data ?? null;
}
async function dbSet(key, value) {
  const { error } = await getSB().from('datenbank').upsert(
    { key, data: value, updated_at: new Date().toISOString() }, { onConflict: 'key' }
  );
  if (error) throw error;
}

// Schulungen
async function schulungenGetAll() {
  const { data } = await getSB().from('schulungen').select('id,data,updated_at').order('created_at', { ascending: false });
  return (data||[]).map(r => ({ ...r.data, id: r.id }));
}
async function schulungSave(s) {
  const { id, ...data } = s;
  const { error } = await getSB().from('schulungen').upsert(
    { id: s.id, data: { ...data, id: s.id }, updated_at: new Date().toISOString() }, { onConflict: 'id' }
  );
  if (error) throw error;
}
async function schulungDelete(id) {
  const { error } = await getSB().from('schulungen').delete().eq('id', id);
  if (error) throw error;
}

// Protokolle
async function protokolleGetAll(schulungId = null) {
  let q = getSB().from('protokolle').select('*').order('datum', { ascending: false });
  if (schulungId) q = q.eq('schulung_id', schulungId);
  const { data } = await q;
  return data || [];
}
async function protokollSave(p) {
  const { error } = await getSB().from('protokolle').insert({
    id: p.id, schulung_id: p.schulungId,
    user_id: (await getCurrentUser())?.id || null,
    user_name: p.userName, user_kz: p.userKz,
    score: p.score, bestanden: p.bestanden, antworten: p.antworten,
    datum: new Date().toISOString()
  });
  if (error) throw error;
}

// Präsenzschulungen
async function praesenzGetAll() {
  const { data } = await getSB().from('praesenzschulungen').select('id,data').order('created_at', { ascending: false });
  return (data||[]).map(r => ({ ...r.data, id: r.id }));
}
async function praesenzSave(s) {
  const { id, ...data } = s;
  const { error } = await getSB().from('praesenzschulungen').upsert(
    { id: s.id, data: { ...data, id: s.id }, updated_at: new Date().toISOString() }, { onConflict: 'id' }
  );
  if (error) throw error;
}
async function praesenzDelete(id) {
  const { error } = await getSB().from('praesenzschulungen').delete().eq('id', id);
  if (error) throw error;
}
async function anmeldungenGet(schulungId) {
  const { data } = await getSB().from('anmeldungen').select('*').eq('schulung_id', schulungId).order('angemeldet_am');
  return data || [];
}
async function anmeldungSave(a) {
  const { error } = await getSB().from('anmeldungen').insert(
    { id: a.id, schulung_id: a.schulungId, name: a.name, email: a.email, status: a.status || 'angemeldet' }
  );
  if (error) throw error;
}
async function anmeldungUpdateStatus(id, status) {
  const { error } = await getSB().from('anmeldungen').update({ status }).eq('id', id);
  if (error) throw error;
}

// Profile
async function profilesGetAll() {
  const { data } = await getSB().from('profiles').select('*').order('name');
  return data || [];
}
async function profileUpdate(id, updates) {
  const { error } = await getSB().from('profiles').update(updates).eq('id', id);
  if (error) throw error;
}

// Besucher
async function besucherGetAll() {
  const { data } = await getSB().from('besucher').select('*').order('created_at', { ascending: false });
  return data || [];
}
async function besucherSave(b) {
  const { error } = b.created_at
    ? await getSB().from('besucher').update(b).eq('id', b.id)
    : await getSB().from('besucher').insert(b);
  if (error) throw error;
}
async function besucherDelete(id) {
  const { error } = await getSB().from('besucher').delete().eq('id', id);
  if (error) throw error;
}

// PSA
async function psaGetAll() {
  const { data } = await getSB().from('psa').select('id,data').order('created_at', { ascending: false });
  return (data||[]).map(r => ({ ...r.data, id: r.id }));
}
async function psaSave(item) {
  const { id, ...data } = item;
  const { error } = await getSB().from('psa').upsert(
    { id: item.id, data: { ...data, id: item.id }, updated_at: new Date().toISOString() }, { onConflict: 'id' }
  );
  if (error) throw error;
}
async function psaDelete(id) {
  const { error } = await getSB().from('psa').delete().eq('id', id);
  if (error) throw error;
}

// Rechtskataster
async function rechtskatasterGetAll() {
  const { data } = await getSB().from('rechtskataster').select('id,data').order('created_at', { ascending: false });
  return (data||[]).map(r => ({ ...r.data, id: r.id }));
}
async function rechtskatasterSave(item) {
  const { id, ...data } = item;
  const { error } = await getSB().from('rechtskataster').upsert(
    { id: item.id, data: { ...data, id: item.id }, updated_at: new Date().toISOString() }, { onConflict: 'id' }
  );
  if (error) throw error;
}
async function rechtskatasterDelete(id) {
  const { error } = await getSB().from('rechtskataster').delete().eq('id', id);
  if (error) throw error;
}
