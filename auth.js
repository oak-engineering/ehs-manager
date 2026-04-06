// ═══════════════════════════════════════════════════════════
// EHS Manager – auth.js v5
// Namespace-sicher: interne Variablen unter _ehs.*
// Keine Kollisionen mit Seiten-Variablen mehr.
// ═══════════════════════════════════════════════════════════

// ── Konfiguration ─────────────────────────────────────────
const EHS_SUPABASE_URL = 'https://evlneudkwqhfowyvnknp.supabase.co';
const EHS_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2bG5ldWRrd3FoZm93eXZua25wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNzY4NjgsImV4cCI6MjA5MDg1Mjg2OH0.ARqhc_HiERFnqhZsq75vWNdVDJmj16cldYX7pORwcsY';
const EHS_DEFAULT_ORG  = 'oak-engineering';
const EHS_STORAGE_BUCKET = 'ehs-dokumente';

const EHS_MODULE_LABELS = {
  datenbank:      { label:'Datenbank',           icon:'◫' },
  unterweisungen: { label:'Unterweisungen',       icon:'◈' },
  gbu:            { label:'GBU & BA',             icon:'◉' },
  unfaelle:       { label:'Unfälle',              icon:'◬' },
  sifa:           { label:'Sicherheitsfachkraft', icon:'◎' },
  dashboard:      { label:'Dashboard',            icon:'◻' },
};
const EHS_MODULES = Object.keys(EHS_MODULE_LABELS);

// ── Interner Zustand (kein Namenskonflikt) ────────────────
const _ehs = { sb:null, profile:null, settings:null };

// ── Supabase ──────────────────────────────────────────────
function getSB() {
  if (!_ehs.sb) _ehs.sb = window.supabase.createClient(EHS_SUPABASE_URL, EHS_SUPABASE_KEY);
  return _ehs.sb;
}
function _ehsClearCache() { _ehs.profile=null; _ehs.settings=null; }

// ── Profil & Einstellungen ────────────────────────────────
async function _ehsGetProfile() {
  if (_ehs.profile) return _ehs.profile;
  const { data:{ user } } = await getSB().auth.getUser();
  if (!user) return null;
  const { data } = await getSB().from('profiles').select('*').eq('id', user.id).single();
  _ehs.profile = data;
  return data;
}

async function getOrgSettings() {
  if (_ehs.settings) return _ehs.settings;
  const p = await _ehsGetProfile();
  const orgId = p?.organisation_id || EHS_DEFAULT_ORG;
  const { data } = await getSB().from('einstellungen').select('data').eq('organisation_id', orgId).single();
  _ehs.settings = data?.data || {};
  return _ehs.settings;
}

async function saveOrgSettings(updates) {
  const p = await _ehsGetProfile();
  const orgId = p?.organisation_id || EHS_DEFAULT_ORG;
  const current = await getOrgSettings();
  const merged = { ...current, ...updates };
  const { error } = await getSB().from('einstellungen').upsert(
    { organisation_id:orgId, data:merged, updated_at:new Date().toISOString() },
    { onConflict:'organisation_id' }
  );
  if (error) throw error;
  _ehs.settings = merged;
  return merged;
}

// ── Berechtigungen ────────────────────────────────────────
function isAdmin(profile)       { return (profile||_ehs.profile)?.rolle==='admin'; }
function canRead(modul,profile) {
  profile=profile||_ehs.profile; if(!profile)return false; if(isAdmin(profile))return true;
  const p=profile.berechtigungen?.[modul]; return p==='read'||p==='write';
}
function canWrite(modul,profile){
  profile=profile||_ehs.profile; if(!profile)return false; if(isAdmin(profile))return true;
  return profile.berechtigungen?.[modul]==='write';
}

// ── Auth Guard ────────────────────────────────────────────
async function requireAuth(onReady) {
  const sb = getSB();
  const { data:{ session } } = await sb.auth.getSession();
  if (session) await _ehsLoadAndStart(session.user, onReady);
  else _ehsShowLogin(onReady);
  sb.auth.onAuthStateChange(async(event,session)=>{
    if (event==='SIGNED_IN'&&session)  { _ehsClearCache(); await _ehsLoadAndStart(session.user,onReady); }
    else if (event==='SIGNED_OUT')     { _ehsClearCache(); _ehsShowLogin(onReady); }
  });
}

async function _ehsLoadAndStart(user, onReady) {
  const { data:profile } = await getSB().from('profiles').select('*').eq('id',user.id).single();
  if (profile && !profile.organisation_id) {
    const isOakAdmin = profile.id==='b490aa4e-36d6-4dff-b4ac-26a4b38e65bc';
    if (!isOakAdmin) {
      const newOrgId = 'org-'+user.id.slice(0,8);
      await getSB().from('profiles').update({organisation_id:newOrgId}).eq('id',user.id);
      profile.organisation_id = newOrgId;
      await getSB().from('einstellungen').upsert(
        {organisation_id:newOrgId, data:{firmenname:'',betreuungsgruppe:'1'}},{onConflict:'organisation_id'});
    }
  }
  _ehs.profile = profile;
  _ehsHideLogin();
  onReady(user, profile);
}

async function signOut() { _ehsClearCache(); await getSB().auth.signOut(); }

// ── Login Screen ──────────────────────────────────────────
function _ehsShowLogin(onReady) {
  document.getElementById('app-root')?.style.setProperty('display','none');
  let el = document.getElementById('auth-screen');
  if (!el) { el=document.createElement('div'); el.id='auth-screen';
    el.style.cssText='position:fixed;inset:0;background:#f4f4f2;z-index:9999;display:flex;align-items:center;justify-content:center;font-family:Inter,-apple-system,sans-serif';
    document.body.appendChild(el); }
  el.style.display='flex';
  _ehsRenderLogin(el);
  setTimeout(()=>document.getElementById('auth-email')?.focus(),100);
}

function _ehsRenderLogin(el) {
  el.innerHTML=`<div style="background:#fff;border:0.5px solid #e0dfd8;border-radius:12px;padding:40px;width:100%;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,.06)">
    <div style="margin-bottom:28px">
      <div style="width:36px;height:36px;background:#1a1a1a;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:16px">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
      </div>
      <div style="font-size:18px;font-weight:500;color:#1a1a1a">EHS Manager</div>
      <div style="font-size:13px;color:#999;margin-top:3px">Oak Engineering</div>
    </div>
    <div id="auth-err" style="display:none;padding:10px 13px;background:#fef2f2;border:0.5px solid #fecaca;border-radius:7px;font-size:13px;color:#dc2626;margin-bottom:14px"></div>
    <div style="margin-bottom:12px"><label style="display:block;font-size:12px;color:#666;margin-bottom:5px;font-weight:500">E-Mail</label>
      <input id="auth-email" type="email" placeholder="name@firma.de" autocomplete="email"
        style="width:100%;padding:10px 12px;border:0.5px solid #e0dfd8;border-radius:7px;font-size:14px;outline:none;font-family:Inter,sans-serif;background:#fafaf8"
        onkeydown="if(event.key==='Enter')document.getElementById('auth-pw').focus()"></div>
    <div style="margin-bottom:20px"><label style="display:block;font-size:12px;color:#666;margin-bottom:5px;font-weight:500">Passwort</label>
      <input id="auth-pw" type="password" placeholder="••••••••" autocomplete="current-password"
        style="width:100%;padding:10px 12px;border:0.5px solid #e0dfd8;border-radius:7px;font-size:14px;outline:none;font-family:Inter,sans-serif;background:#fafaf8"
        onkeydown="if(event.key==='Enter')authLogin()"></div>
    <button onclick="authLogin()" id="auth-btn"
      style="width:100%;padding:11px;background:#1a1a1a;color:#fff;border:none;border-radius:7px;font-size:14px;font-weight:500;cursor:pointer;font-family:Inter,sans-serif">Anmelden</button>
    <div style="text-align:center;margin-top:14px">
      <button onclick="_ehsShowRegister()" style="background:none;border:none;color:#888;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">Noch kein Konto? Registrieren →</button>
    </div>
  </div>`;
}

// Aliases für alte onclick-Handler in HTML
function _renderLoginForm(el) { _ehsRenderLogin(el); }
function _showRegister()      { _ehsShowRegister(); }

function _ehsShowRegister() {
  const el = document.getElementById('auth-screen');
  el.innerHTML=`<div style="background:#fff;border:0.5px solid #e0dfd8;border-radius:12px;padding:40px;width:100%;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,.06)">
    <div style="font-size:17px;font-weight:500;color:#1a1a1a;margin-bottom:6px">Konto erstellen</div>
    <div style="font-size:12px;color:#999;margin-bottom:24px">Zugriff wird von einem Admin freigegeben</div>
    <div id="auth-err" style="display:none;padding:10px 13px;background:#fef2f2;border:0.5px solid #fecaca;border-radius:7px;font-size:13px;color:#dc2626;margin-bottom:14px"></div>
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px">
      <div><label style="display:block;font-size:12px;color:#666;margin-bottom:5px;font-weight:500">Name *</label>
        <input id="reg-name" placeholder="Max Mustermann" style="width:100%;padding:10px 12px;border:0.5px solid #e0dfd8;border-radius:7px;font-size:14px;outline:none;font-family:Inter,sans-serif;background:#fafaf8"></div>
      <div><label style="display:block;font-size:12px;color:#666;margin-bottom:5px;font-weight:500">E-Mail *</label>
        <input id="reg-email" type="email" placeholder="max@firma.de" style="width:100%;padding:10px 12px;border:0.5px solid #e0dfd8;border-radius:7px;font-size:14px;outline:none;font-family:Inter,sans-serif;background:#fafaf8"></div>
      <div><label style="display:block;font-size:12px;color:#666;margin-bottom:5px;font-weight:500">Passwort * (min. 8 Zeichen)</label>
        <input id="reg-pw" type="password" placeholder="••••••••" style="width:100%;padding:10px 12px;border:0.5px solid #e0dfd8;border-radius:7px;font-size:14px;outline:none;font-family:Inter,sans-serif;background:#fafaf8"></div>
      <div style="padding:10px 12px;background:#fffbeb;border:0.5px solid #fde68a;border-radius:7px;font-size:12px;color:#92400e">
        Nach Registrierung erhalten Sie Lesezugriff. Ein Admin vergibt weitere Rechte.
      </div>
    </div>
    <button onclick="authRegister()" id="reg-btn" style="width:100%;padding:11px;background:#1a1a1a;color:#fff;border:none;border-radius:7px;font-size:14px;font-weight:500;cursor:pointer;font-family:Inter,sans-serif">Konto erstellen</button>
    <div style="text-align:center;margin-top:14px">
      <button onclick="_ehsRenderLogin(document.getElementById('auth-screen'))" style="background:none;border:none;color:#888;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">← Zurück zum Login</button>
    </div>
  </div>`;
  setTimeout(()=>document.getElementById('reg-name')?.focus(),100);
}

async function authRegister() {
  const name=document.getElementById('reg-name')?.value.trim();
  const email=document.getElementById('reg-email')?.value.trim();
  const pw=document.getElementById('reg-pw')?.value;
  const btn=document.getElementById('reg-btn');
  if(!name||!email||!pw){_ehsAuthErr('Bitte alle Felder ausfüllen.');return;}
  if(pw.length<8){_ehsAuthErr('Passwort muss min. 8 Zeichen haben.');return;}
  btn.textContent='Wird erstellt…';btn.disabled=true;
  const kuerzel=name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,3);
  try {
    const{error}=await getSB().auth.signUp({email,password:pw,options:{data:{name,kuerzel,rolle:'mitarbeiter'}}});
    if(error)throw error;
    document.getElementById('auth-screen').innerHTML=`<div style="background:#fff;border:0.5px solid #e0dfd8;border-radius:12px;padding:40px;max-width:400px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.06)">
      <div style="font-size:32px;margin-bottom:12px">✓</div>
      <div style="font-size:17px;font-weight:500;margin-bottom:8px">Konto erstellt</div>
      <p style="font-size:13px;color:#666;line-height:1.6;margin-bottom:20px">Bitte E-Mails prüfen und Adresse bestätigen.</p>
      <button onclick="_ehsRenderLogin(document.getElementById('auth-screen'))" style="padding:10px 20px;background:#1a1a1a;color:#fff;border:none;border-radius:7px;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">Zum Login</button>
    </div>`;
  } catch(e) {
    _ehsAuthErr(e.message?.includes('already registered')?'E-Mail bereits registriert.':'Fehler: '+e.message);
    btn.textContent='Konto erstellen';btn.disabled=false;
  }
}

async function authLogin() {
  const email=document.getElementById('auth-email')?.value.trim();
  const pw=document.getElementById('auth-pw')?.value;
  const btn=document.getElementById('auth-btn');
  if(!email||!pw){_ehsAuthErr('Bitte E-Mail und Passwort eingeben.');return;}
  btn.textContent='Anmelden…';btn.disabled=true;
  try {
    const{error}=await getSB().auth.signInWithPassword({email,password:pw});
    if(error)throw error;
  } catch(e) {
    _ehsAuthErr(e.message?.includes('Invalid login')?'E-Mail oder Passwort falsch.':'Fehler: '+e.message);
    btn.textContent='Anmelden';btn.disabled=false;
  }
}

function _ehsAuthErr(msg){const el=document.getElementById('auth-err');if(el){el.textContent=msg;el.style.display='block';}}
function _ehsHideLogin(){
  const el=document.getElementById('auth-screen');if(el)el.style.display='none';
  document.getElementById('app-root')?.style.removeProperty('display');
}

// ── Access Denied ─────────────────────────────────────────
function showAccessDenied(modul) {
  const label=EHS_MODULE_LABELS[modul]?.label||modul;
  let el=document.getElementById('access-denied');
  if(!el){el=document.createElement('div');el.id='access-denied';document.body.appendChild(el);}
  el.style.cssText='position:fixed;inset:0;background:rgba(244,244,242,.97);z-index:500;display:flex;align-items:center;justify-content:center;font-family:Inter,sans-serif';
  el.innerHTML=`<div style="text-align:center;padding:40px;max-width:400px">
    <div style="width:48px;height:48px;border-radius:50%;border:1.5px solid #e0dfd8;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:20px">🔒</div>
    <div style="font-size:17px;font-weight:500;color:#1a1a1a;margin-bottom:8px">Kein Zugriff</div>
    <p style="font-size:13px;color:#888;line-height:1.6;margin-bottom:20px">Kein Zugriff auf <strong>${label}</strong>.</p>
    <a href="index.html" style="display:inline-block;padding:9px 18px;background:#1a1a1a;color:#fff;border-radius:7px;text-decoration:none;font-size:13px">← Zurück</a>
  </div>`;
}

// ── Dark Mode (sofort) ────────────────────────────────────
(function(){
  const saved=localStorage.getItem('ehs_theme');
  const dark=saved?saved==='dark':window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme',dark?'dark':'light');
})();

// ═══════════════════════════════════════════════════════════
// EINSTELLUNGEN MODAL
// ═══════════════════════════════════════════════════════════
async function openSettingsModal() {
  if(!document.getElementById('ehs-s-style')){
    const s=document.createElement('style');s.id='ehs-s-style';
    s.textContent=`#ehs-s-ov{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(4px);z-index:8000;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto}#ehs-s-ov.on{display:flex}.ehs-s-box{background:#fff;border:0.5px solid #e0dfd8;border-radius:12px;width:100%;max-width:560px;margin:auto;overflow:hidden}.ehs-s-hd{padding:18px 22px;border-bottom:0.5px solid #e8e7e0;display:flex;align-items:center;justify-content:space-between}.ehs-s-body{padding:22px;max-height:72vh;overflow-y:auto}.ehs-s-ft{padding:14px 22px;border-top:0.5px solid #e8e7e0;display:flex;justify-content:flex-end;gap:8px}.ehs-inp{width:100%;padding:9px 11px;border:0.5px solid #e0dfd8;border-radius:7px;font-size:13px;font-family:Inter,sans-serif;outline:none;background:#fafaf8}.ehs-inp:focus{border-color:#1a1a1a}`;
    document.head.appendChild(s);
  }
  let el=document.getElementById('ehs-s-ov');
  if(!el){
    el=document.createElement('div');el.id='ehs-s-ov';
    el.onclick=e=>{if(e.target===el)el.classList.remove('on');};
    el.innerHTML=`<div class="ehs-s-box"><div class="ehs-s-hd">
      <div><div style="font-size:16px;font-weight:500;color:#1a1a1a">Grundeinstellungen</div><div style="font-size:12px;color:#aaa;margin-top:2px">Firmen- und Systemkonfiguration</div></div>
      <button onclick="document.getElementById('ehs-s-ov').classList.remove('on')" style="padding:6px 10px;border:0.5px solid #e0dfd8;border-radius:6px;background:transparent;cursor:pointer;font-size:13px;color:#666">✕</button>
    </div>
    <div class="ehs-s-body" id="ehs-s-body"><div style="text-align:center;padding:20px;color:#aaa">Wird geladen…</div></div>
    <div class="ehs-s-ft">
      <button onclick="document.getElementById('ehs-s-ov').classList.remove('on')" style="padding:8px 14px;background:transparent;border:0.5px solid #e0dfd8;border-radius:6px;font-size:13px;color:#666;cursor:pointer;font-family:Inter,sans-serif">Abbrechen</button>
      <button onclick="_ehsSaveSettings()" style="padding:8px 16px;background:#1a1a1a;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;font-family:Inter,sans-serif">Speichern</button>
    </div></div>`;
    document.body.appendChild(el);
  }
  el.classList.add('on');
  const s=await getOrgSettings();
  const x=v=>(v||'').replace(/"/g,'&quot;');
  document.getElementById('ehs-s-body').innerHTML=`
    <div style="margin-bottom:18px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#aaa;font-weight:500;margin-bottom:10px">Unternehmen</div>
      <div style="margin-bottom:10px"><label style="display:block;font-size:12px;color:#555;font-weight:500;margin-bottom:5px">Firmenname</label><input class="ehs-inp" id="es-fn" value="${x(s.firmenname)}" placeholder="Musterfirma GmbH"></div>
      <div style="margin-bottom:10px"><label style="display:block;font-size:12px;color:#555;font-weight:500;margin-bottom:5px">Adresse</label><input class="ehs-inp" id="es-adr" value="${x(s.adresse)}" placeholder="Musterstraße 1, 12345 Musterstadt"></div>
      <div style="margin-bottom:10px"><label style="display:block;font-size:12px;color:#555;font-weight:500;margin-bottom:5px">EHS-Kontakt E-Mail</label><input class="ehs-inp" id="es-mail" type="email" value="${x(s.ehsMail)}" placeholder="ehs@firma.de"></div>
      <div><label style="display:block;font-size:12px;color:#555;font-weight:500;margin-bottom:5px">Telefon</label><input class="ehs-inp" id="es-tel" value="${x(s.telefon)}" placeholder="+49 821 …"></div>
    </div>
    <div style="margin-bottom:18px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#aaa;font-weight:500;margin-bottom:10px">Kennzahlen</div>
      <div style="margin-bottom:10px"><label style="display:block;font-size:12px;color:#555;font-weight:500;margin-bottom:5px">Mitarbeiter Vollzeit</label><input class="ehs-inp" id="es-vz" type="number" value="${s.maVZ||''}" placeholder="50"></div>
      <div style="margin-bottom:10px"><label style="display:block;font-size:12px;color:#555;font-weight:500;margin-bottom:5px">Mitarbeiter Teilzeit ≤20h</label><input class="ehs-inp" id="es-tz1" type="number" value="${s.maTZ1||''}" placeholder="0"></div>
      <div style="margin-bottom:10px"><label style="display:block;font-size:12px;color:#555;font-weight:500;margin-bottom:5px">Mitarbeiter Teilzeit ≤30h</label><input class="ehs-inp" id="es-tz2" type="number" value="${s.maTZ2||''}" placeholder="0"></div>
      <div style="margin-bottom:10px"><label style="display:block;font-size:12px;color:#555;font-weight:500;margin-bottom:5px">Betreuungsgruppe (DGUV V2)</label>
        <select class="ehs-inp" id="es-btg">
          <option value="1" ${(s.betreuungsgruppe||'1')==='1'?'selected':''}>Gruppe I – 2,5 Std./MA/Jahr</option>
          <option value="2" ${s.betreuungsgruppe==='2'?'selected':''}>Gruppe II – 1,5 Std./MA/Jahr</option>
          <option value="3" ${s.betreuungsgruppe==='3'?'selected':''}>Gruppe III – 0,5 Std./MA/Jahr</option>
        </select></div>
      <div><label style="display:block;font-size:12px;color:#555;font-weight:500;margin-bottom:5px">WZ-Code</label><input class="ehs-inp" id="es-wz" value="${x(s.wzCode)}" placeholder="z.B. 25.61"></div>
    </div>
    <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#aaa;font-weight:500;margin-bottom:10px">KI-Integration</div>
      <div><label style="display:block;font-size:12px;color:#555;font-weight:500;margin-bottom:5px">API-Key (Claude)</label><input class="ehs-inp" id="es-key" type="password" value="${localStorage.getItem('ehs_api_key')||''}" placeholder="sk-ant-…" style="font-family:monospace"></div>
    </div>`;
}

async function _ehsSaveSettings() {
  const g=id=>document.getElementById(id)?.value?.trim()||'';
  const updates={
    firmenname:g('es-fn'),adresse:g('es-adr'),ehsMail:g('es-mail'),telefon:g('es-tel'),
    maVZ:parseInt(g('es-vz'))||0,maTZ1:parseInt(g('es-tz1'))||0,maTZ2:parseInt(g('es-tz2'))||0,
    betreuungsgruppe:document.getElementById('es-btg')?.value||'1',wzCode:g('es-wz'),
  };
  const apiKey=g('es-key');
  if(apiKey)localStorage.setItem('ehs_api_key',apiKey);
  try {
    await saveOrgSettings(updates);
    document.getElementById('ehs-s-ov').classList.remove('on');
    if(typeof toast==='function')toast('Einstellungen gespeichert ✓','ok');
    const el=document.getElementById('sb-firm');
    if(el&&updates.firmenname)el.textContent=updates.firmenname;
  } catch(e){if(typeof toast==='function')toast('Fehler: '+e.message,'err');}
}

// ═══════════════════════════════════════════════════════════
// NUTZERVERWALTUNG MODAL
// ═══════════════════════════════════════════════════════════
async function openNutzerModal() {
  if(!document.getElementById('ehs-nm-style')){
    const s=document.createElement('style');s.id='ehs-nm-style';
    s.textContent=`#ehs-nm-ov{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(4px);z-index:8000;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto}#ehs-nm-ov.on{display:flex}.enm-box{background:#fff;border:0.5px solid #e0dfd8;border-radius:12px;width:100%;max-width:720px;margin:auto}.enm-hd{padding:18px 22px;border-bottom:0.5px solid #e8e7e0;display:flex;align-items:center;justify-content:space-between;gap:10px}.enm-body{padding:20px 22px;max-height:68vh;overflow-y:auto}.enm-card{border:0.5px solid #e0dfd8;border-radius:8px;margin-bottom:8px;overflow:hidden}.enm-card-hd{padding:11px 15px;background:#fafaf8;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.enm-perms{padding:11px 15px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.enm-psel{width:100%;padding:5px 8px;border:0.5px solid #e0dfd8;border-radius:5px;font-size:12px;background:#fafaf8;font-family:Inter,sans-serif;cursor:pointer}.enm-av{width:32px;height:32px;border-radius:50%;background:#1a1a1a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:500;flex-shrink:0}#ehs-inv-ov{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);z-index:9000;align-items:center;justify-content:center;padding:20px}#ehs-inv-ov.on{display:flex}`;
    document.head.appendChild(s);
  }
  let el=document.getElementById('ehs-nm-ov');
  if(!el){
    el=document.createElement('div');el.id='ehs-nm-ov';
    el.onclick=e=>{if(e.target===el)el.classList.remove('on');};
    el.innerHTML=`<div class="enm-box"><div class="enm-hd">
      <div><div style="font-size:16px;font-weight:500;color:#1a1a1a">Nutzerverwaltung</div><div style="font-size:12px;color:#aaa;margin-top:2px">Zugriffsrechte pro Modul</div></div>
      <div style="display:flex;gap:8px">
        <button onclick="openInviteModal()" style="padding:7px 13px;border-radius:6px;background:#1a1a1a;color:#fff;border:none;cursor:pointer;font-size:12px;font-family:Inter,sans-serif">+ Einladen</button>
        <button onclick="document.getElementById('ehs-nm-ov').classList.remove('on')" style="padding:7px 11px;border-radius:6px;border:0.5px solid #e0dfd8;background:transparent;cursor:pointer;font-size:13px">✕</button>
      </div>
    </div>
    <div class="enm-body" id="enm-body"><div style="text-align:center;padding:30px;color:#aaa">Wird geladen…</div></div>
    </div>`;
    document.body.appendChild(el);
  }
  el.classList.add('on');
  await _ehsRenderNutzer();
}

function closeNutzerModal(){document.getElementById('ehs-nm-ov')?.classList.remove('on');}

async function _ehsRenderNutzer(){
  const body=document.getElementById('enm-body');
  body.innerHTML='<div style="text-align:center;padding:30px;color:#aaa">Wird geladen…</div>';
  try{
    const{data:nutzer}=await getSB().from('profiles').select('*').order('name');
    if(!nutzer?.length){body.innerHTML='<div style="text-align:center;padding:30px;color:#aaa">Keine Nutzer.</div>';return;}
    body.innerHTML=nutzer.map(n=>{
      const isMe=n.id===_ehs.profile?.id;
      const admin=isAdmin(n);
      const perms=n.berechtigungen||{};
      const permGrid=admin
        ?`<div style="padding:9px 15px;font-size:12px;color:#aaa;font-style:italic">Admins haben automatisch Vollzugriff.</div>`
        :`<div class="enm-perms">${EHS_MODULES.map(m=>{
          const val=perms[m]||'';
          return`<div><div style="font-size:11px;color:#888;font-weight:500;margin-bottom:3px">${EHS_MODULE_LABELS[m].label}</div>
            <select class="enm-psel" ${isMe?'disabled':''} onchange="_ehsPermChange('${n.id}','${m}',this.value)">
              <option value="write" ${val==='write'?'selected':''}>Lesen + Schreiben</option>
              <option value="read"  ${val==='read' ?'selected':''}>Nur lesen</option>
              <option value=""      ${!val         ?'selected':''}>Kein Zugriff</option>
            </select></div>`;
        }).join('')}</div>`;
      const badge=admin
        ?`<span style="padding:2px 8px;border-radius:20px;font-size:10px;font-weight:500;background:#fef3c7;color:#92400e;border:0.5px solid #fde68a">Admin</span>`
        :`<span style="padding:2px 8px;border-radius:20px;font-size:10px;font-weight:500;background:#f0fdf4;color:#166534;border:0.5px solid #bbf7d0">Mitarbeiter</span>`;
      return`<div class="enm-card">
        <div class="enm-card-hd">
          <div style="display:flex;align-items:center;gap:9px">
            <div class="enm-av">${(n.kuerzel||n.name?.slice(0,2)||'?').slice(0,3).toUpperCase()}</div>
            <div><div style="font-weight:500;font-size:13px;color:#1a1a1a">${n.name||'–'}${isMe?' <span style="font-size:11px;color:#aaa;font-weight:400">(ich)</span>':''}</div>
            <div style="font-size:11px;color:#aaa">${n.email||n.kuerzel||''}</div></div>
          </div>
          <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
            ${badge}
            ${!isMe?`<select style="padding:4px 7px;border-radius:5px;border:0.5px solid #e0dfd8;font-size:11px;background:#fafaf8;font-family:Inter,sans-serif;cursor:pointer" onchange="_ehsRolleChange('${n.id}',this.value)">
              <option value="mitarbeiter" ${!admin?'selected':''}>Mitarbeiter</option>
              <option value="admin"       ${admin ?'selected':''}>Admin</option>
            </select>`:''}
          </div>
        </div>${permGrid}
      </div>`;
    }).join('');
  }catch(e){body.innerHTML=`<div style="text-align:center;padding:30px;color:#dc2626">${e.message}</div>`;}
}

async function _ehsPermChange(userId,modul,value){
  try{
    const{data}=await getSB().from('profiles').select('berechtigungen').eq('id',userId).single();
    const cur={...(data?.berechtigungen||{})};
    if(value)cur[modul]=value;else delete cur[modul];
    await getSB().from('profiles').update({berechtigungen:cur}).eq('id',userId);
    if(typeof toast==='function')toast('Berechtigung gespeichert ✓','ok');
  }catch(e){if(typeof toast==='function')toast('Fehler: '+e.message,'err');}
}

async function _ehsRolleChange(userId,rolle){
  try{
    const updates={rolle};
    if(rolle==='admin'){const f={};EHS_MODULES.forEach(m=>f[m]='write');updates.berechtigungen=f;}
    await getSB().from('profiles').update(updates).eq('id',userId);
    if(typeof toast==='function')toast('Rolle aktualisiert ✓','ok');
    await _ehsRenderNutzer();
  }catch(e){if(typeof toast==='function')toast('Fehler: '+e.message,'err');}
}

function openInviteModal(){
  let el=document.getElementById('ehs-inv-ov');
  if(!el){
    el=document.createElement('div');el.id='ehs-inv-ov';
    el.onclick=e=>{if(e.target===el)el.classList.remove('on');};
    el.innerHTML=`<div style="background:#fff;border-radius:10px;padding:24px;width:100%;max-width:420px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
        <div style="font-size:16px;font-weight:500">Nutzer einladen</div>
        <button onclick="document.getElementById('ehs-inv-ov').classList.remove('on')" style="padding:5px 9px;border:0.5px solid #e0dfd8;border-radius:5px;background:transparent;cursor:pointer">✕</button>
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
        <div style="padding:9px 12px;background:#fffbeb;border:0.5px solid #fde68a;border-radius:6px;font-size:12px;color:#92400e">Der Nutzer erhält eine Einladungsmail.</div>
      </div>
      <button onclick="_ehsSubmitInvite()" id="inv-btn" style="width:100%;padding:10px;background:#1a1a1a;color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:500;cursor:pointer;font-family:Inter,sans-serif">Einladen</button>
    </div>`;
    document.body.appendChild(el);
  }
  el.classList.add('on');
  document.getElementById('inv-err').style.display='none';
  ['inv-name','inv-email'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  setTimeout(()=>document.getElementById('inv-name')?.focus(),120);
}

async function _ehsSubmitInvite(){
  const name=document.getElementById('inv-name')?.value.trim();
  const email=document.getElementById('inv-email')?.value.trim();
  const rolle=document.getElementById('inv-rolle')?.value||'mitarbeiter';
  const err=document.getElementById('inv-err');
  const btn=document.getElementById('inv-btn');
  if(!name||!email){err.textContent='Name und E-Mail erforderlich.';err.style.display='block';return;}
  btn.textContent='Wird gesendet…';btn.disabled=true;
  const kuerzel=name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,3);
  const berechtigungen={};
  EHS_MODULES.forEach(m=>berechtigungen[m]=rolle==='admin'?'write':'read');
  try{
    const{error}=await getSB().auth.signUp({email,
      password:Math.random().toString(36).slice(2,10)+'Aa1!',
      options:{data:{name,kuerzel,rolle,berechtigungen},emailRedirectTo:window.location.origin+'/index.html'}});
    if(error)throw error;
    document.getElementById('ehs-inv-ov').classList.remove('on');
    if(typeof toast==='function')toast('Einladung gesendet ✓','ok');
    await _ehsRenderNutzer();
  }catch(e){
    err.textContent='Fehler: '+e.message;err.style.display='block';
    btn.textContent='Einladen';btn.disabled=false;
  }
}

// ═══════════════════════════════════════════════════════════
// DATEN-HELFER
// ═══════════════════════════════════════════════════════════

async function objGetAll(tabelle){
  const{data,error}=await getSB().from(tabelle).select('id,data,created_at,updated_at').order('created_at',{ascending:false});
  if(error)throw error;
  return(data||[]).map(r=>({...r.data,id:r.id,_updated:r.updated_at}));
}
async function objSave(tabelle,obj){
  const{id,_updated,...data}=obj;
  const{error}=await getSB().from(tabelle).upsert({id,data:{...data,id},updated_at:new Date().toISOString()},{onConflict:'id'});
  if(error)throw error;
}
async function objDelete(tabelle,id){
  const{error}=await getSB().from(tabelle).delete().eq('id',id);
  if(error)throw error;
}

// Maschinen
const maschinGetAll   = ()=>objGetAll('maschinen');
const maschinSave     = (o)=>objSave('maschinen',o);
const maschinDelete   = (id)=>objDelete('maschinen',id);

// Gefahrstoffe (mit aktiv-Flag)
const gefahrstoffGetAll = ()=>getSB().from('gefahrstoffe').select('id,data,aktiv,updated_at').order('created_at',{ascending:false}).then(({data,error})=>{
  if(error)throw error;return(data||[]).map(r=>({...r.data,id:r.id,aktiv:r.aktiv!==false,_updated:r.updated_at}));
});
const gefahrstoffSave = async(o)=>{
  const{id,_updated,aktiv=true,...data}=o;
  const{error}=await getSB().from('gefahrstoffe').upsert({id,data:{...data,id},aktiv,updated_at:new Date().toISOString()},{onConflict:'id'});
  if(error)throw error;
};
const gefahrstoffDelete = (id)=>objDelete('gefahrstoffe',id);

// Arbeitsmittel
const arbeitsmittelGetAll = ()=>objGetAll('arbeitsmittel');
const arbeitsmittelSave   = (o)=>objSave('arbeitsmittel',o);
const arbeitsmittelDelete = (id)=>objDelete('arbeitsmittel',id);

// Beauftragte
const beauftragterGetAll  = ()=>objGetAll('beauftragte');
const beauftragterSave    = (o)=>objSave('beauftragte',o);
const beauftragterDelete  = (id)=>objDelete('beauftragte',id);

// Bereiche
const bereichGetAll  = ()=>objGetAll('bereiche');
const bereichSave    = (o)=>objSave('bereiche',o);
const bereichDelete  = (id)=>objDelete('bereiche',id);

// Tätigkeiten
const taetigkeitGetAll  = ()=>objGetAll('taetigkeiten');
const taetigkeitSave    = (o)=>objSave('taetigkeiten',o);
const taetigkeitDelete  = (id)=>objDelete('taetigkeiten',id);

// GBU
const gbuGetAll  = ()=>objGetAll('gbu');
const gbuSave    = (o)=>objSave('gbu',o);
const gbuDelete  = (id)=>objDelete('gbu',id);

// Unfälle
const unfallGetAll  = ()=>objGetAll('unfaelle');
const unfallSave    = (o)=>objSave('unfaelle',o);
const unfallDelete  = (id)=>objDelete('unfaelle',id);

// Checklisten
const checklisteGetAll  = ()=>objGetAll('checklisten');
const checklisteSave    = (o)=>objSave('checklisten',o);
const checklisteDelete  = (id)=>objDelete('checklisten',id);

// Checklisten-Protokolle
async function checklisteProtokolleGetAll(objektId=null){
  const{data,error}=await getSB().from('checklisten_protokolle').select('id,data,created_at').order('created_at',{ascending:false});
  if(error)throw error;
  const all=(data||[]).map(r=>({...r.data,id:r.id,_created:r.created_at}));
  return objektId?all.filter(p=>p.objektId===objektId):all;
}
async function checklisteProtokollSave(p){
  const{id,_created,...data}=p;
  const{error}=await getSB().from('checklisten_protokolle').upsert({id,data:{...data,id},created_at:_created||new Date().toISOString()},{onConflict:'id'});
  if(error)throw error;
}
async function checklisteProtokollDelete(id){
  const{error}=await getSB().from('checklisten_protokolle').delete().eq('id',id);
  if(error)throw error;
}

// PSA
async function psaGetAll(){
  const{data,error}=await getSB().from('psa').select('id,data,updated_at').order('created_at',{ascending:false});
  if(error)throw error;return(data||[]).map(r=>({...r.data,id:r.id}));
}
async function psaSave(o){
  const{id,...data}=o;
  const{error}=await getSB().from('psa').upsert({id,data:{...data,id},updated_at:new Date().toISOString()},{onConflict:'id'});
  if(error)throw error;
}
const psaDelete=(id)=>objDelete('psa',id);

// Besucher (flache Spalten – eigene Tabellenstruktur)
async function besucherGetAll(){
  const{data,error}=await getSB().from('besucher').select('*').order('created_at',{ascending:false});
  if(error)throw error;return data||[];
}
async function besucherSave(b){
  const{error}=b.created_at
    ?await getSB().from('besucher').update(b).eq('id',b.id)
    :await getSB().from('besucher').insert(b);
  if(error)throw error;
}
const besucherDelete=(id)=>objDelete('besucher',id);

// Rechtskataster
async function rechtskatasterGetAll(){
  const{data,error}=await getSB().from('rechtskataster').select('id,data,updated_at').order('created_at',{ascending:false});
  if(error)throw error;return(data||[]).map(r=>({...r.data,id:r.id}));
}
async function rechtskatasterSave(o){
  const{id,...data}=o;
  const{error}=await getSB().from('rechtskataster').upsert({id,data:{...data,id},updated_at:new Date().toISOString()},{onConflict:'id'});
  if(error)throw error;
}
const rechtskatasterDelete=(id)=>objDelete('rechtskataster',id);

// Schulungen
async function schulungenGetAll(){
  const{data,error}=await getSB().from('schulungen').select('id,data,updated_at').order('created_at',{ascending:false});
  if(error)throw error;return(data||[]).map(r=>({...r.data,id:r.id}));
}
async function schulungSave(s){
  const{id,_updated,...data}=s;
  const{error}=await getSB().from('schulungen').upsert({id,data:{...data,id},updated_at:new Date().toISOString()},{onConflict:'id'});
  if(error)throw error;
}
const schulungDelete=(id)=>objDelete('schulungen',id);
const schulungGetAll=schulungenGetAll;

// Profiles
async function profilesGetAll(){
  const{data,error}=await getSB().from('profiles').select('*').order('name');
  if(error)throw error;return data||[];
}
async function profileUpdate(id,updates){
  const{error}=await getSB().from('profiles').update(updates).eq('id',id);
  if(error)throw error;
}

// Storage
async function uploadFile(path,file,contentType){
  const{data,error}=await getSB().storage.from(EHS_STORAGE_BUCKET).upload(path,file,{contentType,upsert:true});
  if(error)throw error;return data.path;
}
async function getFileUrl(path){
  const{data}=getSB().storage.from(EHS_STORAGE_BUCKET).getPublicUrl(path);
  return data?.publicUrl;
}
async function deleteFile(path){
  const{error}=await getSB().storage.from(EHS_STORAGE_BUCKET).remove([path]);
  if(error)throw error;
}
