// ═══════════════════════════════════════════════════════════
// EHS Manager – auth.js v4
// Supabase Auth + Permissions + DB-Helfer (Einzelobjekt-Tabellen)
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://evlneudkwqhfowyvnknp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2bG5ldWRrd3FoZm93eXZua25wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNzY4NjgsImV4cCI6MjA5MDg1Mjg2OH0.ARqhc_HiERFnqhZsq75vWNdVDJmj16cldYX7pORwcsY';
const STORAGE_BUCKET = 'ehs-dokumente';
const DEFAULT_ORG = 'oak-engineering';

const MODULE_LABELS = {
  datenbank:    { label: 'Datenbank',         icon: '◫' },
  unterweisungen:{ label: 'Unterweisungen',   icon: '◈' },
  gbu:          { label: 'GBU & BA',           icon: '◉' },
  unfaelle:     { label: 'Unfälle',            icon: '◬' },
  sifa:         { label: 'Sicherheitsfachkraft', icon: '◎' },
  dashboard:    { label: 'Dashboard',          icon: '◻' },
};
const MODULES = Object.keys(MODULE_LABELS);

// ── Supabase Client ───────────────────────────────────────
let _sb = null;
function getSB() {
  if (!_sb) _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _sb;
}

// ── Profil & Session ──────────────────────────────────────
let _profile = null;
let _settings = null;

function clearCache() { _profile = null; _settings = null; }

async function getCurrentUser() {
  const { data: { user } } = await getSB().auth.getUser();
  return user;
}

async function getCurrentProfile() {
  if (_profile) return _profile;
  const user = await getCurrentUser();
  if (!user) return null;
  const { data } = await getSB().from('profiles').select('*').eq('id', user.id).single();
  _profile = data;
  return data;
}

async function getOrgSettings() {
  if (_settings) return _settings;
  if (!_profile) await getCurrentProfile();
  const orgId = _profile?.organisation_id || DEFAULT_ORG;
  const { data } = await getSB().from('einstellungen').select('data').eq('organisation_id', orgId).single();
  _settings = data?.data || {};
  return _settings;
}

async function saveOrgSettings(updates) {
  if (!_profile) await getCurrentProfile();
  const orgId = _profile?.organisation_id || DEFAULT_ORG;
  const current = await getOrgSettings();
  const merged = { ...current, ...updates };
  const { error } = await getSB().from('einstellungen').upsert(
    { organisation_id: orgId, data: merged, updated_at: new Date().toISOString() },
    { onConflict: 'organisation_id' }
  );
  if (error) throw error;
  _settings = merged;
  return merged;
}

// ── Berechtigungen ────────────────────────────────────────
function isAdmin(profile) { return (profile || _profile)?.rolle === 'admin'; }

function canRead(modul, profile) {
  profile = profile || _profile;
  if (!profile) return false;
  if (isAdmin(profile)) return true;
  const p = profile.berechtigungen?.[modul];
  return p === 'read' || p === 'write';
}

function canWrite(modul, profile) {
  profile = profile || _profile;
  if (!profile) return false;
  if (isAdmin(profile)) return true;
  return profile.berechtigungen?.[modul] === 'write';
}

// ── Auth Guard ────────────────────────────────────────────
async function requireAuth(onReady) {
  const sb = getSB();
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await _loadAndStart(session.user, onReady);
  } else {
    _showLogin(onReady);
  }
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      clearCache();
      await _loadAndStart(session.user, onReady);
    } else if (event === 'SIGNED_OUT') {
      clearCache();
      _showLogin(onReady);
    }
  });
}

async function _loadAndStart(user, onReady) {
  const { data: profile } = await getSB().from('profiles').select('*').eq('id', user.id).single();
  // Neue Kunden: eigene organisation_id vergeben wenn noch auf Default
  if (profile && (!profile.organisation_id || profile.organisation_id === 'oak-engineering')) {
    // Prüfe ob es sich um den Oak-Admin handelt
    const isOakAdmin = profile.id === 'b490aa4e-36d6-4dff-b4ac-26a4b38e65bc';
    if (!isOakAdmin && !profile.organisation_id) {
      // Neue Organisation anlegen
      const newOrgId = 'org-' + user.id.slice(0, 8);
      await getSB().from('profiles').update({ organisation_id: newOrgId }).eq('id', user.id);
      profile.organisation_id = newOrgId;
      // Einstellungen initialisieren
      await getSB().from('einstellungen').upsert(
        { organisation_id: newOrgId, data: { firmenname: '', betreuungsgruppe: '1' } },
        { onConflict: 'organisation_id' }
      );
    }
  }
  _profile = profile;
  _hideLogin();
  onReady(user, profile);
}

// ── Login Screen ──────────────────────────────────────────
function _showLogin(onReady) {
  document.getElementById('app-root')?.style.setProperty('display', 'none');
  let el = document.getElementById('auth-screen');
  if (!el) {
    el = document.createElement('div');
    el.id = 'auth-screen';
    el.style.cssText = 'position:fixed;inset:0;background:#f4f4f2;z-index:9999;display:flex;align-items:center;justify-content:center;font-family:Inter,-apple-system,sans-serif';
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
  _renderLoginForm(el);
  setTimeout(() => document.getElementById('auth-email')?.focus(), 100);
}

function _renderLoginForm(el) {
  el.innerHTML = `
    <div style="background:#fff;border:0.5px solid #e0dfd8;border-radius:12px;padding:40px;width:100%;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,.06)">
      <div style="margin-bottom:28px">
        <div style="width:36px;height:36px;background:#1a1a1a;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:16px">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        </div>
        <div style="font-size:18px;font-weight:500;color:#1a1a1a;letter-spacing:-.01em">EHS Manager</div>
        <div style="font-size:13px;color:#999;margin-top:3px">Oak Engineering</div>
      </div>
      <div id="auth-err" style="display:none;padding:10px 13px;background:#fef2f2;border:0.5px solid #fecaca;border-radius:7px;font-size:13px;color:#dc2626;margin-bottom:14px"></div>
      <div id="auth-ok" style="display:none;padding:10px 13px;background:#f0fdf4;border:0.5px solid #bbf7d0;border-radius:7px;font-size:13px;color:#16a34a;margin-bottom:14px"></div>
      <div id="auth-form-login">
        <div style="margin-bottom:12px">
          <label style="display:block;font-size:12px;color:#666;margin-bottom:5px;font-weight:500">E-Mail</label>
          <input id="auth-email" type="email" placeholder="name@firma.de" autocomplete="email"
            style="width:100%;padding:10px 12px;border:0.5px solid #e0dfd8;border-radius:7px;font-size:14px;outline:none;font-family:Inter,sans-serif;background:#fafaf8"
            onkeydown="if(event.key==='Enter')document.getElementById('auth-pw').focus()">
        </div>
        <div style="margin-bottom:20px">
          <label style="display:block;font-size:12px;color:#666;margin-bottom:5px;font-weight:500">Passwort</label>
          <input id="auth-pw" type="password" placeholder="••••••••" autocomplete="current-password"
            style="width:100%;padding:10px 12px;border:0.5px solid #e0dfd8;border-radius:7px;font-size:14px;outline:none;font-family:Inter,sans-serif;background:#fafaf8"
            onkeydown="if(event.key==='Enter')authLogin()">
        </div>
        <button onclick="authLogin()" id="auth-btn"
          style="width:100%;padding:11px;background:#1a1a1a;color:#fff;border:none;border-radius:7px;font-size:14px;font-weight:500;cursor:pointer;font-family:Inter,sans-serif;letter-spacing:-.01em">
          Anmelden
        </button>
        <div style="text-align:center;margin-top:14px">
          <button onclick="_showRegister()" style="background:none;border:none;color:#888;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">
            Noch kein Konto? Registrieren →
          </button>
        </div>
      </div>
    </div>`;
}

function _showRegister() {
  const el = document.getElementById('auth-screen');
  el.innerHTML = `
    <div style="background:#fff;border:0.5px solid #e0dfd8;border-radius:12px;padding:40px;width:100%;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,.06)">
      <div style="font-size:17px;font-weight:500;color:#1a1a1a;margin-bottom:6px">Konto erstellen</div>
      <div style="font-size:12px;color:#999;margin-bottom:24px">Zugriff muss von einem Admin freigegeben werden</div>
      <div id="auth-err" style="display:none;padding:10px 13px;background:#fef2f2;border:0.5px solid #fecaca;border-radius:7px;font-size:13px;color:#dc2626;margin-bottom:14px"></div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px">
        <div>
          <label style="display:block;font-size:12px;color:#666;margin-bottom:5px;font-weight:500">Name *</label>
          <input id="reg-name" placeholder="Max Mustermann" autocomplete="name"
            style="width:100%;padding:10px 12px;border:0.5px solid #e0dfd8;border-radius:7px;font-size:14px;outline:none;font-family:Inter,sans-serif;background:#fafaf8">
        </div>
        <div>
          <label style="display:block;font-size:12px;color:#666;margin-bottom:5px;font-weight:500">E-Mail *</label>
          <input id="reg-email" type="email" placeholder="max@firma.de" autocomplete="email"
            style="width:100%;padding:10px 12px;border:0.5px solid #e0dfd8;border-radius:7px;font-size:14px;outline:none;font-family:Inter,sans-serif;background:#fafaf8">
        </div>
        <div>
          <label style="display:block;font-size:12px;color:#666;margin-bottom:5px;font-weight:500">Passwort * (min. 8 Zeichen)</label>
          <input id="reg-pw" type="password" placeholder="••••••••"
            style="width:100%;padding:10px 12px;border:0.5px solid #e0dfd8;border-radius:7px;font-size:14px;outline:none;font-family:Inter,sans-serif;background:#fafaf8">
        </div>
        <div style="padding:10px 12px;background:#fffbeb;border:0.5px solid #fde68a;border-radius:7px;font-size:12px;color:#92400e">
          Nach der Registrierung erhalten Sie zunächst Lesezugriff. Ein Administrator vergibt erweiterte Rechte.
        </div>
      </div>
      <button onclick="authRegister()" style="width:100%;padding:11px;background:#1a1a1a;color:#fff;border:none;border-radius:7px;font-size:14px;font-weight:500;cursor:pointer;font-family:Inter,sans-serif" id="reg-btn">Konto erstellen</button>
      <div style="text-align:center;margin-top:14px">
        <button onclick="_renderLoginForm(document.getElementById('auth-screen'))" style="background:none;border:none;color:#888;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">← Zurück zum Login</button>
      </div>
    </div>`;
  setTimeout(() => document.getElementById('reg-name')?.focus(), 100);
}

async function authRegister() {
  const name = document.getElementById('reg-name')?.value.trim();
  const email = document.getElementById('reg-email')?.value.trim();
  const pw = document.getElementById('reg-pw')?.value;
  const err = document.getElementById('auth-err');
  const btn = document.getElementById('reg-btn');
  if (!name || !email || !pw) { _authErr('Bitte alle Felder ausfüllen.'); return; }
  if (pw.length < 8) { _authErr('Passwort muss mind. 8 Zeichen haben.'); return; }
  btn.textContent = 'Wird erstellt…'; btn.disabled = true;
  const kuerzel = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
  try {
    const { error } = await getSB().auth.signUp({ email, password: pw,
      options: { data: { name, kuerzel, rolle: 'mitarbeiter' } } });
    if (error) throw error;
    const el = document.getElementById('auth-screen');
    el.innerHTML = `<div style="background:#fff;border:0.5px solid #e0dfd8;border-radius:12px;padding:40px;max-width:400px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.06)">
      <div style="font-size:32px;margin-bottom:12px">✓</div>
      <div style="font-size:17px;font-weight:500;margin-bottom:8px">Konto erstellt</div>
      <p style="font-size:13px;color:#666;line-height:1.6;margin-bottom:20px">Bitte prüfen Sie Ihre E-Mails und bestätigen Sie Ihre Adresse. Ein Administrator schaltet anschließend Ihre Zugriffsrechte frei.</p>
      <button onclick="_renderLoginForm(document.getElementById('auth-screen'))" style="padding:10px 20px;background:#1a1a1a;color:#fff;border:none;border-radius:7px;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">Zum Login</button>
    </div>`;
  } catch(e) {
    _authErr(e.message?.includes('already registered') ? 'Diese E-Mail ist bereits registriert.' : 'Fehler: ' + e.message);
    btn.textContent = 'Konto erstellen'; btn.disabled = false;
  }
}

async function authLogin() {
  const email = document.getElementById('auth-email')?.value.trim();
  const pw = document.getElementById('auth-pw')?.value;
  const btn = document.getElementById('auth-btn');
  if (!email || !pw) { _authErr('Bitte E-Mail und Passwort eingeben.'); return; }
  btn.textContent = 'Anmelden…'; btn.disabled = true;
  try {
    const { error } = await getSB().auth.signInWithPassword({ email, password: pw });
    if (error) throw error;
  } catch(e) {
    _authErr(e.message?.includes('Invalid login') ? 'E-Mail oder Passwort falsch.' : 'Fehler: ' + e.message);
    btn.textContent = 'Anmelden'; btn.disabled = false;
  }
}

function _authErr(msg) {
  const el = document.getElementById('auth-err');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

async function signOut() { clearCache(); await getSB().auth.signOut(); }

function _hideLogin() {
  const el = document.getElementById('auth-screen');
  if (el) el.style.display = 'none';
  const root = document.getElementById('app-root');
  if (root) { root.style.removeProperty('display'); }
}

// ── Access Denied Banner ──────────────────────────────────
function showAccessDenied(modul) {
  const label = MODULE_LABELS[modul]?.label || modul;
  let el = document.getElementById('access-denied');
  if (!el) { el = document.createElement('div'); el.id = 'access-denied'; document.body.appendChild(el); }
  el.style.cssText = 'position:fixed;inset:0;background:rgba(244,244,242,.97);z-index:500;display:flex;align-items:center;justify-content:center;font-family:Inter,sans-serif';
  el.innerHTML = `<div style="text-align:center;padding:40px;max-width:400px">
    <div style="width:48px;height:48px;border-radius:50%;border:1.5px solid #e0dfd8;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:#aaa;font-size:20px">🔒</div>
    <div style="font-size:17px;font-weight:500;color:#1a1a1a;margin-bottom:8px">Kein Zugriff</div>
    <p style="font-size:13px;color:#888;line-height:1.6;margin-bottom:20px">Sie haben keinen Zugriff auf <strong>${label}</strong>. Bitte wenden Sie sich an Ihren Administrator.</p>
    <a href="index.html" style="display:inline-block;padding:9px 18px;background:#1a1a1a;color:#fff;border-radius:7px;text-decoration:none;font-size:13px">← Zurück</a>
  </div>`;
}

// ═══════════════════════════════════════════════════════════
// GRUNDEINSTELLUNGEN MODAL
// ═══════════════════════════════════════════════════════════
function _ensureSettingsStyles() {
  if (document.getElementById('settings-style')) return;
  const s = document.createElement('style');
  s.id = 'settings-style';
  s.textContent = `
    #settings-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(4px);z-index:8000;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto}
    #settings-overlay.on{display:flex}
    .settings-box{background:#fff;border:0.5px solid #e0dfd8;border-radius:12px;width:100%;max-width:560px;margin:auto;overflow:hidden}
    .settings-hd{padding:18px 22px;border-bottom:0.5px solid #e8e7e0;display:flex;align-items:center;justify-content:space-between}
    .settings-body{padding:22px;max-height:72vh;overflow-y:auto}
    .settings-section{margin-bottom:20px}
    .settings-section-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#aaa;font-weight:500;margin-bottom:10px}
    .settings-row{margin-bottom:12px}
    .settings-label{font-size:12px;color:#555;font-weight:500;margin-bottom:5px;display:block}
    .settings-input{width:100%;padding:9px 11px;border:0.5px solid #e0dfd8;border-radius:7px;font-size:13px;font-family:Inter,sans-serif;outline:none;background:#fafaf8}
    .settings-input:focus{border-color:#1a1a1a}
    .settings-ft{padding:14px 22px;border-top:0.5px solid #e8e7e0;display:flex;justify-content:flex-end;gap:8px}
    .btn-settings-save{padding:8px 16px;background:#1a1a1a;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;font-family:Inter,sans-serif}
    .btn-settings-cancel{padding:8px 14px;background:transparent;border:0.5px solid #e0dfd8;border-radius:6px;font-size:13px;color:#666;cursor:pointer;font-family:Inter,sans-serif}
  `;
  document.head.appendChild(s);
}

async function openSettingsModal() {
  _ensureSettingsStyles();
  let el = document.getElementById('settings-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'settings-overlay';
    el.onclick = e => { if (e.target === el) el.classList.remove('on'); };
    el.innerHTML = `
      <div class="settings-box">
        <div class="settings-hd">
          <div>
            <div style="font-size:16px;font-weight:500;color:#1a1a1a">Grundeinstellungen</div>
            <div style="font-size:12px;color:#aaa;margin-top:2px">Firmen- und Systemkonfiguration</div>
          </div>
          <button onclick="document.getElementById('settings-overlay').classList.remove('on')"
            style="padding:6px 10px;border:0.5px solid #e0dfd8;border-radius:6px;background:transparent;cursor:pointer;font-size:13px;color:#666">✕</button>
        </div>
        <div class="settings-body" id="settings-body">
          <div style="text-align:center;padding:20px;color:#aaa">Wird geladen…</div>
        </div>
        <div class="settings-ft">
          <button class="btn-settings-cancel" onclick="document.getElementById('settings-overlay').classList.remove('on')">Abbrechen</button>
          <button class="btn-settings-save" onclick="saveSettings()">Speichern</button>
        </div>
      </div>`;
    document.body.appendChild(el);
  }
  el.classList.add('on');
  const s = await getOrgSettings();
  document.getElementById('settings-body').innerHTML = `
    <div class="settings-section">
      <div class="settings-section-label">Unternehmen</div>
      <div class="settings-row"><label class="settings-label">Firmenname</label>
        <input class="settings-input" id="s-firmenname" value="${(s.firmenname||'').replace(/"/g,'&quot;')}" placeholder="Musterfirma GmbH"></div>
      <div class="settings-row"><label class="settings-label">Adresse</label>
        <input class="settings-input" id="s-adresse" value="${(s.adresse||'').replace(/"/g,'&quot;')}" placeholder="Musterstraße 1, 12345 Musterstadt"></div>
      <div class="settings-row"><label class="settings-label">EHS-Kontakt E-Mail</label>
        <input class="settings-input" id="s-ehs-mail" type="email" value="${(s.ehsMail||'').replace(/"/g,'&quot;')}" placeholder="ehs@firma.de"></div>
      <div class="settings-row"><label class="settings-label">Telefon</label>
        <input class="settings-input" id="s-telefon" value="${(s.telefon||'').replace(/"/g,'&quot;')}" placeholder="+49 821 …"></div>
    </div>
    <div class="settings-section">
      <div class="settings-section-label">Kennzahlen & Berechnung</div>
      <div class="settings-row"><label class="settings-label">Anzahl Mitarbeiter (Vollzeit)</label>
        <input class="settings-input" id="s-ma-vz" type="number" value="${s.maVZ||''}" placeholder="50"></div>
      <div class="settings-row"><label class="settings-label">Anzahl Mitarbeiter (Teilzeit ≤20h)</label>
        <input class="settings-input" id="s-ma-tz1" type="number" value="${s.maTZ1||''}" placeholder="0"></div>
      <div class="settings-row"><label class="settings-label">Anzahl Mitarbeiter (Teilzeit ≤30h)</label>
        <input class="settings-input" id="s-ma-tz2" type="number" value="${s.maTZ2||''}" placeholder="0"></div>
      <div class="settings-row"><label class="settings-label">Betreuungsgruppe (DGUV V2)</label>
        <select class="settings-input" id="s-betreuungsgruppe">
          <option value="1" ${(s.betreuungsgruppe||'1')==='1'?'selected':''}>Gruppe I – 2,5 Std./MA/Jahr (hohes Gefährdungspotenzial)</option>
          <option value="2" ${s.betreuungsgruppe==='2'?'selected':''}>Gruppe II – 1,5 Std./MA/Jahr (mittleres Gefährdungspotenzial)</option>
          <option value="3" ${s.betreuungsgruppe==='3'?'selected':''}>Gruppe III – 0,5 Std./MA/Jahr (geringes Gefährdungspotenzial)</option>
        </select></div>
      <div class="settings-row"><label class="settings-label">WZ-Code (Wirtschaftszweig, optional)</label>
        <input class="settings-input" id="s-wz" value="${(s.wzCode||'').replace(/"/g,'&quot;')}" placeholder="z.B. 25.61 (Oberflächenveredlung)"></div>
    </div>
    <div class="settings-section">
      <div class="settings-section-label">Darstellung</div>
  
      <div class="settings-row"><label class="settings-label">API-Key (Claude KI-Funktionen)</label>
        <input class="settings-input" id="s-apikey" type="password" value="${localStorage.getItem('ehs_api_key')||''}" placeholder="sk-ant-…" style="font-family:monospace"></div>
    </div>`;
}

async function saveSettings() {
  const updates = {
    firmenname:      document.getElementById('s-firmenname')?.value.trim(),
    adresse:         document.getElementById('s-adresse')?.value.trim(),
    ehsMail:         document.getElementById('s-ehs-mail')?.value.trim(),
    telefon:         document.getElementById('s-telefon')?.value.trim(),
    maVZ:            parseInt(document.getElementById('s-ma-vz')?.value) || 0,
    maTZ1:           parseInt(document.getElementById('s-ma-tz1')?.value) || 0,
    maTZ2:           parseInt(document.getElementById('s-ma-tz2')?.value) || 0,
    betreuungsgruppe:document.getElementById('s-betreuungsgruppe')?.value || '1',
    wzCode:          document.getElementById('s-wz')?.value.trim(),
  };
  const apiKey = document.getElementById('s-apikey')?.value.trim();
  if (apiKey) localStorage.setItem('ehs_api_key', apiKey);

  try {
    await saveOrgSettings(updates);
    document.getElementById('settings-overlay').classList.remove('on');
    if (typeof toast === 'function') toast('Einstellungen gespeichert ✓', 'ok');
  } catch(e) {
    if (typeof toast === 'function') toast('Fehler: ' + e.message, 'err');
  }
}

// Dark Mode initialisieren
(function() {
  const saved = localStorage.getItem('ehs_theme');
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
})();

// ═══════════════════════════════════════════════════════════
// NUTZERVERWALTUNG MODAL
// ═══════════════════════════════════════════════════════════
function _ensureNutzerStyles() {
  if (document.getElementById('nutzer-style')) return;
  const s = document.createElement('style');
  s.id = 'nutzer-style';
  s.textContent = `
    #nutzer-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(4px);z-index:8000;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto}
    #nutzer-overlay.on{display:flex}
    .nm-box{background:#fff;border:0.5px solid #e0dfd8;border-radius:12px;width:100%;max-width:720px;margin:auto}
    .nm-hd{padding:18px 22px;border-bottom:0.5px solid #e8e7e0;display:flex;align-items:center;justify-content:space-between;gap:10px}
    .nm-body{padding:20px 22px;max-height:68vh;overflow-y:auto}
    .nm-card{border:0.5px solid #e0dfd8;border-radius:8px;margin-bottom:8px;overflow:hidden}
    .nm-card-hd{padding:11px 15px;background:#fafaf8;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
    .nm-perms{padding:11px 15px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
    .nm-perm-lbl{font-size:11px;color:#888;font-weight:500;margin-bottom:3px}
    .nm-perm-sel{width:100%;padding:5px 8px;border:0.5px solid #e0dfd8;border-radius:5px;font-size:12px;background:#fafaf8;font-family:Inter,sans-serif;cursor:pointer}
    .nm-badge{padding:2px 8px;border-radius:20px;font-size:10px;font-weight:500}
    .nm-admin{background:#fef3c7;color:#92400e;border:0.5px solid #fde68a}
    .nm-ma{background:#f0fdf4;color:#166534;border:0.5px solid #bbf7d0}
    .nm-av{width:32px;height:32px;border-radius:50%;background:#1a1a1a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:500;flex-shrink:0}
    #invite-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);z-index:9000;align-items:center;justify-content:center;padding:20px}
    #invite-overlay.on{display:flex}
  `;
  document.head.appendChild(s);
}

function _ensureNutzerModal() {
  _ensureNutzerStyles();
  if (document.getElementById('nutzer-overlay')) return;
  const el = document.createElement('div');
  el.id = 'nutzer-overlay';
  el.onclick = e => { if (e.target === el) el.classList.remove('on'); };
  el.innerHTML = `
    <div class="nm-box">
      <div class="nm-hd">
        <div>
          <div style="font-size:16px;font-weight:500;color:#1a1a1a">Nutzerverwaltung</div>
          <div style="font-size:12px;color:#aaa;margin-top:2px">Zugriffsrechte pro Modul</div>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="openInviteModal()" style="padding:7px 13px;border-radius:6px;background:#1a1a1a;color:#fff;border:none;cursor:pointer;font-size:12px;font-family:Inter,sans-serif">+ Einladen</button>
          <button onclick="document.getElementById('nutzer-overlay').classList.remove('on')" style="padding:7px 11px;border-radius:6px;border:0.5px solid #e0dfd8;background:transparent;cursor:pointer;font-size:13px">✕</button>
        </div>
      </div>
      <div class="nm-body" id="nm-body"><div style="text-align:center;padding:30px;color:#aaa">Wird geladen…</div></div>
    </div>`;
  document.body.appendChild(el);
}

function _ensureInviteModal() {
  _ensureNutzerStyles();
  if (document.getElementById('invite-overlay')) return;
  const el = document.createElement('div');
  el.id = 'invite-overlay';
  el.onclick = e => { if (e.target === el) el.classList.remove('on'); };
  el.innerHTML = `
    <div style="background:#fff;border-radius:10px;padding:24px;width:100%;max-width:420px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
        <div style="font-size:16px;font-weight:500">Nutzer einladen</div>
        <button onclick="document.getElementById('invite-overlay').classList.remove('on')" style="padding:5px 9px;border:0.5px solid #e0dfd8;border-radius:5px;background:transparent;cursor:pointer">✕</button>
      </div>
      <div id="inv-err" style="display:none;padding:9px 12px;background:#fef2f2;border:0.5px solid #fecaca;border-radius:6px;font-size:12px;color:#dc2626;margin-bottom:12px"></div>
      <div style="display:flex;flex-direction:column;gap:11px;margin-bottom:18px">
        <div><label style="display:block;font-size:12px;color:#555;margin-bottom:4px;font-weight:500">Name *</label>
          <input id="inv-name" style="width:100%;padding:9px 11px;border:0.5px solid #e0dfd8;border-radius:6px;font-size:13px;font-family:Inter,sans-serif;outline:none;background:#fafaf8" placeholder="Max Mustermann"></div>
        <div><label style="display:block;font-size:12px;color:#555;margin-bottom:4px;font-weight:500">E-Mail *</label>
          <input id="inv-email" type="email" style="width:100%;padding:9px 11px;border:0.5px solid #e0dfd8;border-radius:6px;font-size:13px;font-family:Inter,sans-serif;outline:none;background:#fafaf8" placeholder="max@firma.de"></div>
        <div><label style="display:block;font-size:12px;color:#555;margin-bottom:4px;font-weight:500">Rolle</label>
          <select id="inv-rolle" style="width:100%;padding:9px 11px;border:0.5px solid #e0dfd8;border-radius:6px;font-size:13px;font-family:Inter,sans-serif;outline:none;background:#fafaf8">
            <option value="mitarbeiter">Mitarbeiter (Lesezugriff)</option>
            <option value="admin">Administrator (Vollzugriff)</option>
          </select></div>
        <div style="padding:9px 12px;background:#fffbeb;border:0.5px solid #fde68a;border-radius:6px;font-size:12px;color:#92400e">
          Der Nutzer erhält eine Einladungsmail zum Passwort setzen.
        </div>
      </div>
      <button onclick="submitInvite()" id="inv-btn" style="width:100%;padding:10px;background:#1a1a1a;color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:500;cursor:pointer;font-family:Inter,sans-serif">Einladen</button>
    </div>`;
  document.body.appendChild(el);
}

async function openNutzerModal() {
  _ensureNutzerModal();
  document.getElementById('nutzer-overlay').classList.add('on');
  await _renderNutzerBody();
}

function closeNutzerModal() { document.getElementById('nutzer-overlay')?.classList.remove('on'); }

async function _renderNutzerBody() {
  const body = document.getElementById('nm-body');
  body.innerHTML = '<div style="text-align:center;padding:30px;color:#aaa">Wird geladen…</div>';
  try {
    const { data: nutzer } = await getSB().from('profiles').select('*').order('name');
    if (!nutzer?.length) { body.innerHTML = '<div style="text-align:center;padding:30px;color:#aaa">Keine Nutzer.</div>'; return; }
    body.innerHTML = nutzer.map(n => {
      const isMe = n.id === _profile?.id;
      const admin = isAdmin(n);
      const perms = n.berechtigungen || {};
      const permGrid = admin
        ? `<div style="padding:9px 15px;font-size:12px;color:#aaa;font-style:italic">Admins haben automatisch Vollzugriff.</div>`
        : `<div class="nm-perms">${MODULES.map(m => {
            const val = perms[m] || '';
            return `<div><div class="nm-perm-lbl">${MODULE_LABELS[m].label}</div>
              <select class="nm-perm-sel" ${isMe?'disabled':''} onchange="nmPermChange('${n.id}','${m}',this.value)">
                <option value="write" ${val==='write'?'selected':''}>Lesen + Schreiben</option>
                <option value="read" ${val==='read'?'selected':''}>Nur lesen</option>
                <option value="" ${!val?'selected':''}>Kein Zugriff</option>
              </select></div>`;
          }).join('')}</div>`;
      return `<div class="nm-card">
        <div class="nm-card-hd">
          <div style="display:flex;align-items:center;gap:9px">
            <div class="nm-av">${(n.kuerzel||n.name?.slice(0,2)||'?').slice(0,3).toUpperCase()}</div>
            <div>
              <div style="font-weight:500;font-size:13px;color:#1a1a1a">${n.name||'–'}${isMe?' <span style="font-size:11px;color:#aaa;font-weight:400">(ich)</span>':''}</div>
              <div style="font-size:11px;color:#aaa">${n.kuerzel||''}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
            <span class="nm-badge ${admin?'nm-admin':'nm-ma'}">${admin?'Admin':'Mitarbeiter'}</span>
            ${!isMe?`<select style="padding:4px 7px;border-radius:5px;border:0.5px solid #e0dfd8;font-size:11px;background:#fafaf8;font-family:Inter,sans-serif;cursor:pointer" onchange="nmRolleChange('${n.id}',this.value)">
              <option value="mitarbeiter" ${!admin?'selected':''}>Mitarbeiter</option>
              <option value="admin" ${admin?'selected':''}>Admin</option>
            </select>`:''}
          </div>
        </div>
        ${permGrid}
      </div>`;
    }).join('');
  } catch(e) { body.innerHTML = `<div style="text-align:center;padding:30px;color:#dc2626">${e.message}</div>`; }
}

async function nmPermChange(userId, modul, value) {
  try {
    const { data } = await getSB().from('profiles').select('berechtigungen').eq('id', userId).single();
    const cur = { ...(data?.berechtigungen || {}) };
    if (value) cur[modul] = value; else delete cur[modul];
    await getSB().from('profiles').update({ berechtigungen: cur }).eq('id', userId);
    if (typeof toast === 'function') toast('Berechtigung gespeichert ✓', 'ok');
  } catch(e) { if (typeof toast === 'function') toast('Fehler: ' + e.message, 'err'); }
}

async function nmRolleChange(userId, rolle) {
  try {
    const updates = { rolle };
    if (rolle === 'admin') { const f = {}; MODULES.forEach(m => f[m] = 'write'); updates.berechtigungen = f; }
    await getSB().from('profiles').update(updates).eq('id', userId);
    if (typeof toast === 'function') toast('Rolle aktualisiert ✓', 'ok');
    await _renderNutzerBody();
  } catch(e) { if (typeof toast === 'function') toast('Fehler: ' + e.message, 'err'); }
}

function openInviteModal() {
  _ensureInviteModal();
  document.getElementById('invite-overlay').classList.add('on');
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
  btn.textContent = 'Wird gesendet…'; btn.disabled = true;
  const kuerzel = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
  const berechtigungen = {};
  MODULES.forEach(m => berechtigungen[m] = rolle === 'admin' ? 'write' : 'read');
  try {
    const { error } = await getSB().auth.signUp({ email,
      password: Math.random().toString(36).slice(2,10) + 'Aa1!',
      options: { data: { name, kuerzel, rolle, berechtigungen }, emailRedirectTo: window.location.origin + '/index.html' }
    });
    if (error) throw error;
    document.getElementById('invite-overlay').classList.remove('on');
    if (typeof toast === 'function') toast('Einladung gesendet ✓', 'ok');
    await _renderNutzerBody();
  } catch(e) { err.textContent = 'Fehler: ' + e.message; err.style.display = 'block'; btn.textContent = 'Einladen'; btn.disabled = false; }
}

// ═══════════════════════════════════════════════════════════
// SUPABASE DATEN-HELFER (Einzelobjekt-Tabellen)
// ═══════════════════════════════════════════════════════════

// Generische Einzelobjekt-CRUD
async function objGetAll(tabelle) {
  const { data, error } = await getSB().from(tabelle).select('id,data,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => ({ ...r.data, id: r.id, _updated: r.updated_at }));
}

async function objSave(tabelle, obj) {
  const { id, _updated, ...data } = obj;
  const { error } = await getSB().from(tabelle).upsert(
    { id, data: { ...data, id }, updated_at: new Date().toISOString() },
    { onConflict: 'id' }
  );
  if (error) throw error;
}

async function objDelete(tabelle, id) {
  const { error } = await getSB().from(tabelle).delete().eq('id', id);
  if (error) throw error;
}

// Spezifische Helfer (nutzen objGetAll/Save/Delete intern)
const maschinGetAll   = () => objGetAll('maschinen');
const maschinSave     = (o) => objSave('maschinen', o);
const maschinDelete   = (id) => objDelete('maschinen', id);

const gefahrstoffGetAll   = () => getSB().from('gefahrstoffe').select('id,data,aktiv,updated_at')
  .order('created_at',{ascending:false}).then(({data,error}) => {
    if(error)throw error;
    return (data||[]).map(r=>({...r.data,id:r.id,aktiv:r.aktiv!==false,_updated:r.updated_at}));
  });
const gefahrstoffSave     = async (o) => {
  const { id, _updated, aktiv=true, ...data } = o;
  const { error } = await getSB().from('gefahrstoffe').upsert(
    { id, data:{...data,id}, aktiv, updated_at:new Date().toISOString() }, {onConflict:'id'});
  if(error)throw error;
};
const gefahrstoffDelete   = (id) => objDelete('gefahrstoffe', id);

const arbeitsmittelGetAll = () => objGetAll('arbeitsmittel');
const arbeitsmittelSave   = (o) => objSave('arbeitsmittel', o);
const arbeitsmittelDelete = (id) => objDelete('arbeitsmittel', id);

const beauftragterGetAll  = () => objGetAll('beauftragte');
const beauftragterSave    = (o) => objSave('beauftragte', o);
const beauftragterDelete  = (id) => objDelete('beauftragte', id);

const bereichGetAll       = () => objGetAll('bereiche');
const bereichSave         = (o) => objSave('bereiche', o);
const bereichDelete       = (id) => objDelete('bereiche', id);

const taetigkeitGetAll    = () => objGetAll('taetigkeiten');
const taetigkeitSave      = (o) => objSave('taetigkeiten', o);
const taetigkeitDelete    = (id) => objDelete('taetigkeiten', id);

const unfallGetAll        = () => objGetAll('unfaelle');
const unfallSave          = (o) => objSave('unfaelle', o);
const unfallDelete        = (id) => objDelete('unfaelle', id);

const gbuGetAll           = () => objGetAll('gbu');
const gbuSave             = (o) => objSave('gbu', o);
const gbuDelete           = (id) => objDelete('gbu', id);

const checklisteGetAll    = () => objGetAll('checklisten');
const checklisteSave      = (o) => objSave('checklisten', o);
const checklisteDelete    = (id) => objDelete('checklisten', id);

// PSA, Besucher, Rechtskataster (bleiben in eigenen Tabellen)
async function psaGetAll() {
  const { data, error } = await getSB().from('psa').select('id,data,updated_at').order('created_at',{ascending:false});
  if(error)throw error;
  return (data||[]).map(r=>({...r.data,id:r.id}));
}
async function psaSave(o) {
  const{id,...data}=o;
  const{error}=await getSB().from('psa').upsert({id,data:{...data,id},updated_at:new Date().toISOString()},{onConflict:'id'});
  if(error)throw error;
}
async function psaDelete(id) { const{error}=await getSB().from('psa').delete().eq('id',id); if(error)throw error; }

async function besucherGetAll() {
  const{data,error}=await getSB().from('besucher').select('*').order('created_at',{ascending:false});
  if(error)throw error; return data||[];
}
async function besucherSave(b) {
  const{error}=b.created_at
    ?await getSB().from('besucher').update(b).eq('id',b.id)
    :await getSB().from('besucher').insert(b);
  if(error)throw error;
}
async function besucherDelete(id){const{error}=await getSB().from('besucher').delete().eq('id',id);if(error)throw error;}

async function rechtskatasterGetAll(){
  const{data,error}=await getSB().from('rechtskataster').select('id,data,updated_at').order('created_at',{ascending:false});
  if(error)throw error; return(data||[]).map(r=>({...r.data,id:r.id}));
}
async function rechtskatasterSave(o){
  const{id,...data}=o;
  const{error}=await getSB().from('rechtskataster').upsert({id,data:{...data,id},updated_at:new Date().toISOString()},{onConflict:'id'});
  if(error)throw error;
}
async function rechtskatasterDelete(id){const{error}=await getSB().from('rechtskataster').delete().eq('id',id);if(error)throw error;}

// Schulungen (bleiben in bestehender schulungen-Tabelle)
async function schulungenGetAll(){
  const{data,error}=await getSB().from('schulungen').select('id,data,updated_at').order('created_at',{ascending:false});
  if(error)throw error; return(data||[]).map(r=>({...r.data,id:r.id}));
}
async function schulungSave(s){
  const{id,_updated,...data}=s;
  const{error}=await getSB().from('schulungen').upsert({id,data:{...data,id},updated_at:new Date().toISOString()},{onConflict:'id'});
  if(error)throw error;
}
async function schulungDelete(id){const{error}=await getSB().from('schulungen').delete().eq('id',id);if(error)throw error;}

async function protokolleGetAll(schulungId=null){
  let q=getSB().from('protokolle').select('*').order('datum',{ascending:false});
  if(schulungId)q=q.eq('schulung_id',schulungId);
  const{data,error}=await q; if(error)throw error; return data||[];
}
async function protokollSave(p){
  const{error}=await getSB().from('protokolle').insert({
    id:p.id,schulung_id:p.schulungId,
    user_id:(await getCurrentUser())?.id||null,
    user_name:p.userName,user_kz:p.userKz,
    score:p.score,bestanden:p.bestanden,antworten:p.antworten,
    datum:new Date().toISOString()
  });
  if(error)throw error;
}

async function anmeldungenGet(sid){const{data,error}=await getSB().from('anmeldungen').select('*').eq('schulung_id',sid).order('angemeldet_am');if(error)throw error;return data||[];}
async function anmeldungSave(a){const{error}=await getSB().from('anmeldungen').insert({id:a.id,schulung_id:a.schulungId,name:a.name,email:a.email,status:a.status||'angemeldet'});if(error)throw error;}
async function anmeldungUpdateStatus(id,status){const{error}=await getSB().from('anmeldungen').update({status}).eq('id',id);if(error)throw error;}

async function profilesGetAll(){const{data,error}=await getSB().from('profiles').select('*').order('name');if(error)throw error;return data||[];}
async function profileUpdate(id,updates){const{error}=await getSB().from('profiles').update(updates).eq('id',id);if(error)throw error;}

// Supabase Storage für Dateien
async function uploadFile(path, file, contentType) {
  const { data, error } = await getSB().storage.from(STORAGE_BUCKET).upload(path, file, {
    contentType, upsert: true
  });
  if (error) throw error;
  return data.path;
}

async function getFileUrl(path) {
  const { data } = getSB().storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data?.publicUrl;
}

async function getFileSignedUrl(path, expiresIn = 3600) {
  const { data, error } = await getSB().storage.from(STORAGE_BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

async function deleteFile(path) {
  const { error } = await getSB().storage.from(STORAGE_BUCKET).remove([path]);
  if (error) throw error;
}

// Hilfsfunktion: Base64 → File-Upload
async function uploadBase64(base64DataUrl, filename, orgId) {
  const [header, data] = base64DataUrl.split(',');
  const contentType = header.match(/:(.*?);/)[1];
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const file = new Blob([bytes], { type: contentType });
  const path = `${orgId || DEFAULT_ORG}/${Date.now()}_${filename}`;
  return uploadFile(path, file, contentType);
}
