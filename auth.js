// ═══════════════════════════════════════════════════════════
// EHS Manager – Supabase Auth Module
// Oak Engineering · auth.js
// Einbinden via: <script src="auth.js"></script>
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://evlneudkwqhfowyvnknp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2bG5ldWRrd3FoZm93eXZua25wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNzY4NjgsImV4cCI6MjA5MDg1Mjg2OH0.ARqhc_HiERFnqhZsq75vWNdVDJmj16cldYX7pORwcsY';

// Supabase Client (via CDN, wird in HTML geladen)
let _sb = null;
function getSB() {
  if (!_sb) _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _sb;
}

// ── Aktueller User & Profil ───────────────────────────────
let _currentUser = null;
let _currentProfile = null;

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

function isAdmin() {
  return _currentProfile?.rolle === 'admin';
}

function clearProfileCache() {
  _currentProfile = null;
}

// ── Login / Logout ────────────────────────────────────────
async function signIn(email, password) {
  const { data, error } = await getSB().auth.signInWithPassword({ email, password });
  if (error) throw error;
  _currentProfile = null;
  return data;
}

async function signOut() {
  clearProfileCache();
  _currentUser = null;
  await getSB().auth.signOut();
}

// ── Auth Guard: Login-Screen anzeigen wenn nicht eingeloggt ─
async function requireAuth(onReady) {
  const sb = getSB();

  // Initialen Auth-State prüfen
  const { data: { session } } = await sb.auth.getSession();

  if (session) {
    // Eingeloggt – Profil laden und App starten
    await _loadProfileAndStart(session.user, onReady);
  } else {
    // Nicht eingeloggt – Login-Screen zeigen
    _showLoginScreen(onReady);
  }

  // Auth-State-Änderungen abonnieren (Login/Logout)
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
  onReady(user, profile);
}

// ── Login-Screen HTML ─────────────────────────────────────
function _showLoginScreen(onReady) {
  // App-Inhalt ausblenden
  document.getElementById('app-content')?.style.setProperty('display', 'none');

  let overlay = document.getElementById('auth-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;background:#f5f5f3;z-index:9999;
      display:flex;align-items:center;justify-content:center;
      font-family:'DM Sans',sans-serif;
    `;
    overlay.innerHTML = `
      <div style="background:#fff;border:1px solid #d8d7d2;border-radius:12px;
                  padding:36px;width:100%;max-width:400px;box-shadow:0 8px 32px rgba(0,0,0,.1)">
        <div style="text-align:center;margin-bottom:28px">
          <img src="logo.png" alt="Oak Engineering"
               style="height:36px;margin-bottom:12px;filter:brightness(0)"
               onerror="this.style.display='none'">
          <div style="font-family:'Barlow',sans-serif;font-size:22px;font-weight:700;color:#1a1a1a">
            EHS Manager
          </div>
          <div style="font-size:13px;color:#999;margin-top:4px">Oak Engineering</div>
        </div>

        <div id="auth-error" style="display:none;padding:10px 14px;background:rgba(192,57,43,.08);
             border:1px solid rgba(192,57,43,.25);border-radius:7px;font-size:13px;
             color:#c0392b;margin-bottom:14px"></div>

        <div style="margin-bottom:14px">
          <label style="display:block;font-size:12px;font-weight:500;color:#555;margin-bottom:5px">
            E-Mail
          </label>
          <input id="auth-email" type="email" placeholder="name@firma.de"
                 style="width:100%;padding:11px 13px;background:#f0efec;border:1px solid #d8d7d2;
                        border-radius:8px;font-size:14px;outline:none;font-family:'DM Sans',sans-serif"
                 onkeydown="if(event.key==='Enter')document.getElementById('auth-pw').focus()">
        </div>
        <div style="margin-bottom:20px">
          <label style="display:block;font-size:12px;font-weight:500;color:#555;margin-bottom:5px">
            Passwort
          </label>
          <input id="auth-pw" type="password" placeholder="••••••••"
                 style="width:100%;padding:11px 13px;background:#f0efec;border:1px solid #d8d7d2;
                        border-radius:8px;font-size:14px;outline:none;font-family:'DM Sans',sans-serif"
                 onkeydown="if(event.key==='Enter')authLogin()">
        </div>
        <button onclick="authLogin()"
                style="width:100%;padding:12px;background:#1a1a1a;color:#fff;border:none;
                       border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;
                       font-family:'DM Sans',sans-serif;transition:background .18s"
                onmouseover="this.style.background='#333'"
                onmouseout="this.style.background='#1a1a1a'"
                id="auth-btn">
          Anmelden
        </button>
        <div style="text-align:center;margin-top:16px;font-size:12px;color:#999">
          Zugang über Ihren EHS-Administrator
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  } else {
    overlay.style.display = 'flex';
  }
  setTimeout(() => document.getElementById('auth-email')?.focus(), 100);
}

function _hideLoginScreen() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.style.display = 'none';
  document.getElementById('app-content')?.style.removeProperty('display');
}

async function authLogin() {
  const email = document.getElementById('auth-email')?.value.trim();
  const pw = document.getElementById('auth-pw')?.value;
  const btn = document.getElementById('auth-btn');
  const err = document.getElementById('auth-error');

  if (!email || !pw) {
    err.textContent = 'Bitte E-Mail und Passwort eingeben.';
    err.style.display = 'block';
    return;
  }

  btn.textContent = 'Anmelden…';
  btn.disabled = true;
  err.style.display = 'none';

  try {
    await signIn(email, pw);
    // onAuthStateChange übernimmt den Rest
  } catch(e) {
    err.textContent = e.message?.includes('Invalid login')
      ? 'E-Mail oder Passwort falsch.'
      : 'Fehler: ' + e.message;
    err.style.display = 'block';
    btn.textContent = 'Anmelden';
    btn.disabled = false;
  }
}

// ── Supabase Datenbank-Helfer ─────────────────────────────
// Alle Daten als JSONB in der "datenbank"-Tabelle (key/value)

async function dbGet(key) {
  const { data } = await getSB()
    .from('datenbank').select('data').eq('key', key).single();
  return data?.data ?? null;
}

async function dbSet(key, value) {
  const { error } = await getSB().from('datenbank').upsert({
    key, data: value, updated_at: new Date().toISOString()
  }, { onConflict: 'key' });
  if (error) throw error;
}

// ── Schulungen ────────────────────────────────────────────
async function schulungenGetAll() {
  const { data } = await getSB()
    .from('schulungen').select('id, data, created_at, updated_at')
    .order('created_at', { ascending: false });
  return (data || []).map(r => ({ ...r.data, id: r.id, _updated: r.updated_at }));
}

async function schulungSave(schulung) {
  const { id, _updated, ...data } = schulung;
  const { error } = await getSB().from('schulungen').upsert({
    id: schulung.id,
    data: { ...data, id: schulung.id },
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function schulungDelete(id) {
  const { error } = await getSB().from('schulungen').delete().eq('id', id);
  if (error) throw error;
}

// ── Protokolle ────────────────────────────────────────────
async function protokolleGetAll(schulungId = null) {
  let query = getSB().from('protokolle').select('*').order('datum', { ascending: false });
  if (schulungId) query = query.eq('schulung_id', schulungId);
  const { data } = await query;
  return data || [];
}

async function protokollSave(p) {
  const { error } = await getSB().from('protokolle').insert({
    id: p.id,
    schulung_id: p.schulungId,
    user_id: (await getCurrentUser())?.id || null,
    user_name: p.userName,
    user_kz: p.userKz,
    score: p.score,
    bestanden: p.bestanden,
    antworten: p.antworten,
    datum: new Date().toISOString()
  });
  if (error) throw error;
}

// ── Präsenzschulungen ─────────────────────────────────────
async function praesenzGetAll() {
  const { data } = await getSB()
    .from('praesenzschulungen').select('id, data, created_at')
    .order('created_at', { ascending: false });
  return (data || []).map(r => ({ ...r.data, id: r.id }));
}

async function praesenzSave(s) {
  const { id, ...data } = s;
  const { error } = await getSB().from('praesenzschulungen').upsert({
    id: s.id, data: { ...data, id: s.id },
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function praesenzDelete(id) {
  const { error } = await getSB().from('praesenzschulungen').delete().eq('id', id);
  if (error) throw error;
}

async function anmeldungenGet(schulungId) {
  const { data } = await getSB()
    .from('anmeldungen').select('*').eq('schulung_id', schulungId)
    .order('angemeldet_am', { ascending: true });
  return data || [];
}

async function anmeldungSave(a) {
  const { error } = await getSB().from('anmeldungen').insert({
    id: a.id,
    schulung_id: a.schulungId,
    name: a.name,
    email: a.email,
    status: a.status || 'angemeldet'
  });
  if (error) throw error;
}

async function anmeldungUpdateStatus(id, status) {
  const { error } = await getSB()
    .from('anmeldungen').update({ status }).eq('id', id);
  if (error) throw error;
}

// ── Nutzer-Verwaltung (nur Admin) ─────────────────────────
async function profilesGetAll() {
  const { data } = await getSB()
    .from('profiles').select('*').order('name');
  return data || [];
}

async function profileUpdate(id, updates) {
  const { error } = await getSB()
    .from('profiles').update(updates).eq('id', id);
  if (error) throw error;
}

async function inviteUser(email, name, rolle = 'mitarbeiter') {
  // Neuen User über Supabase Admin API anlegen
  // (nur möglich wenn Admin eingeloggt ist)
  const kuerzel = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
  const { data, error } = await getSB().auth.signUp({
    email,
    password: Math.random().toString(36).slice(2) + 'Aa1!', // temp password
    options: {
      data: { name, kuerzel, rolle },
      emailRedirectTo: window.location.origin + '/schulungen.html'
    }
  });
  if (error) throw error;
  return data;
}
