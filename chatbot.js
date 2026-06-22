/* ============================================================================
   OAK engineering — Chat-Widget (BETA)
   Self-contained. Bindet einen schwebenden Chat-Button unten rechts ein.
   Spricht die Supabase Edge Function an (Key bleibt serverseitig).

   Einbindung (vor </body>):
     <script>
       window.OAK_CHAT = {
         endpoint: "https://<project-ref>.supabase.co/functions/v1/oak-chat",
         anonKey:  "<dein-supabase-anon-key>"   // optional (wenn Function JWT verlangt)
       };
     </script>
     <script defer src="chatbot.js"></script>
   ============================================================================ */
(function () {
  "use strict";
  var CFG = window.OAK_CHAT || {};
  if (!CFG.endpoint) { return; } // ohne Endpoint inaktiv – bricht nichts

  var WELCOME = "Hallo! Ich bin der OAK-Assistent (BETA). Fragen Sie mich zu EHS-Themen oder zu den Leistungen von OAK engineering.";
  var messages = []; // {role, content}
  var busy = false;

  // ── Styles ────────────────────────────────────────────────────────────────
  var css = `
  .oakc-launch{position:fixed;right:20px;bottom:20px;z-index:9998;width:58px;height:58px;border-radius:50%;
    background:#1B4332;color:#fff;border:none;cursor:pointer;box-shadow:0 8px 24px rgba(27,67,50,.35);
    display:grid;place-items:center;transition:transform .15s,background .2s;}
  .oakc-launch:hover{background:#2D6A4F;transform:translateY(-2px);}
  .oakc-launch svg{width:26px;height:26px;}
  .oakc-launch .oakc-beta{position:absolute;top:-6px;right:-6px;background:#FBD46D;color:#3b2c00;font-family:Jost,sans-serif;
    font-size:.55rem;font-weight:700;letter-spacing:.06em;padding:.1rem .35rem;border-radius:99px;}
  .oakc-panel{position:fixed;right:20px;bottom:20px;z-index:9999;width:min(380px,calc(100vw - 32px));
    height:min(560px,calc(100vh - 40px));background:#FDFCFA;border:1px solid #D6E4DA;border-radius:16px;
    display:none;flex-direction:column;overflow:hidden;box-shadow:0 18px 50px rgba(27,67,50,.22);
    font-family:Jost,system-ui,sans-serif;}
  .oakc-panel.open{display:flex;animation:oakc-in .22s ease;}
  @keyframes oakc-in{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:none;}}
  .oakc-head{background:linear-gradient(135deg,#1B4332,#2D6A4F);color:#fff;padding:.9rem 1rem;}
  .oakc-head .oakc-title{display:flex;align-items:center;gap:.5rem;font-family:'Cormorant Garamond',Georgia,serif;
    font-size:1.25rem;font-weight:600;line-height:1;}
  .oakc-head .oakc-pill{font-family:Jost,sans-serif;font-size:.55rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
    background:#FBD46D;color:#3b2c00;padding:.12rem .45rem;border-radius:99px;}
  .oakc-head .oakc-sub{font-size:.72rem;opacity:.85;margin-top:.25rem;}
  .oakc-x{position:absolute;top:.7rem;right:.7rem;background:rgba(255,255,255,.14);border:none;color:#fff;
    width:1.8rem;height:1.8rem;border-radius:50%;cursor:pointer;font-size:1rem;line-height:1;}
  .oakc-x:hover{background:rgba(255,255,255,.26);}
  .oakc-body{flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:.6rem;background:#F0FAF3;}
  .oakc-msg{max-width:85%;padding:.6rem .85rem;border-radius:12px;font-size:.88rem;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;}
  .oakc-bot{align-self:flex-start;background:#fff;border:1px solid #D6E4DA;color:#2C3A30;border-bottom-left-radius:4px;}
  .oakc-user{align-self:flex-end;background:#2D6A4F;color:#fff;border-bottom-right-radius:4px;}
  .oakc-bot a{color:#2D6A4F;font-weight:600;}
  .oakc-typing{align-self:flex-start;background:#fff;border:1px solid #D6E4DA;border-radius:12px;border-bottom-left-radius:4px;
    padding:.7rem .9rem;display:flex;gap:.25rem;}
  .oakc-typing i{width:.45rem;height:.45rem;border-radius:50%;background:#74C69D;animation:oakc-blink 1.2s infinite;}
  .oakc-typing i:nth-child(2){animation-delay:.2s;} .oakc-typing i:nth-child(3){animation-delay:.4s;}
  @keyframes oakc-blink{0%,80%,100%{opacity:.3;}40%{opacity:1;}}
  .oakc-foot{border-top:1px solid #D6E4DA;padding:.6rem;background:#FDFCFA;}
  .oakc-inwrap{display:flex;gap:.5rem;align-items:flex-end;}
  .oakc-in{flex:1;resize:none;border:1.5px solid #D6E4DA;border-radius:10px;padding:.6rem .7rem;font-family:Jost,sans-serif;
    font-size:.88rem;color:#111A14;max-height:96px;outline:none;}
  .oakc-in:focus{border-color:#2D6A4F;box-shadow:0 0 0 3px #D8F3DC;}
  .oakc-send{background:#1B4332;color:#fff;border:none;border-radius:10px;width:2.5rem;height:2.5rem;cursor:pointer;
    display:grid;place-items:center;flex:none;transition:background .2s;}
  .oakc-send:hover:not(:disabled){background:#2D6A4F;} .oakc-send:disabled{opacity:.5;cursor:default;}
  .oakc-disc{font-size:.62rem;color:#6B7C70;text-align:center;margin-top:.4rem;line-height:1.4;}
  @media (max-width:480px){.oakc-panel{right:8px;bottom:8px;height:calc(100vh - 16px);width:calc(100vw - 16px);}}
  `;
  var style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);

  // ── DOM ─────────────────────────────────────────────────────────────────
  var launch = document.createElement("button");
  launch.className = "oakc-launch"; launch.setAttribute("aria-label", "Chat mit OAK-Assistent öffnen");
  launch.innerHTML = '<span class="oakc-beta">Beta</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"/></svg>';

  var panel = document.createElement("div");
  panel.className = "oakc-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "OAK-Assistent");
  panel.innerHTML =
    '<div class="oakc-head" style="position:relative">' +
      '<div class="oakc-title"><span>OAK-Assistent</span><span class="oakc-pill">Beta</span></div>' +
      '<div class="oakc-sub">EHS &amp; Leistungen · allgemeine Infos, keine Rechtsberatung</div>' +
      '<button class="oakc-x" aria-label="Schließen">✕</button>' +
    '</div>' +
    '<div class="oakc-body" id="oakc-body"></div>' +
    '<div class="oakc-foot">' +
      '<div class="oakc-inwrap">' +
        '<textarea class="oakc-in" id="oakc-in" rows="1" placeholder="Ihre Frage …" maxlength="2000"></textarea>' +
        '<button class="oakc-send" id="oakc-send" aria-label="Senden"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg></button>' +
      '</div>' +
      '<div class="oakc-disc">Antworten können Fehler enthalten · keine Rechtsberatung</div>' +
    '</div>';

  document.body.appendChild(launch);
  document.body.appendChild(panel);

  var body = panel.querySelector("#oakc-body");
  var input = panel.querySelector("#oakc-in");
  var sendBtn = panel.querySelector("#oakc-send");
  var closeBtn = panel.querySelector(".oakc-x");

  // ── Helpers ───────────────────────────────────────────────────────────────
  function esc(s){ var d=document.createElement("div"); d.textContent=s; return d.innerHTML; }
  function linkify(s){
    s = esc(s);
    s = s.replace(/\b([a-z0-9-]+\.html)\b/g, '<a href="$1">$1</a>');
    s = s.replace(/\b(info@oak-engineering\.de)\b/g, '<a href="mailto:$1">$1</a>');
    return s;
  }
  function addMsg(role, text){
    var el = document.createElement("div");
    el.className = "oakc-msg " + (role === "user" ? "oakc-user" : "oakc-bot");
    el.innerHTML = role === "user" ? esc(text) : linkify(text);
    body.appendChild(el); body.scrollTop = body.scrollHeight;
  }
  function typing(on){
    var t = body.querySelector(".oakc-typing");
    if (on && !t){ t=document.createElement("div"); t.className="oakc-typing"; t.innerHTML="<i></i><i></i><i></i>"; body.appendChild(t); body.scrollTop=body.scrollHeight; }
    else if (!on && t){ t.remove(); }
  }

  function open(){ panel.classList.add("open"); launch.style.display="none"; if(!body.childElementCount) addMsg("bot", WELCOME); input.focus(); }
  function close(){ panel.classList.remove("open"); launch.style.display="grid"; }

  launch.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  document.addEventListener("keydown", function(e){ if(e.key==="Escape" && panel.classList.contains("open")) close(); });

  input.addEventListener("input", function(){ input.style.height="auto"; input.style.height=Math.min(input.scrollHeight,96)+"px"; });
  input.addEventListener("keydown", function(e){ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); } });
  sendBtn.addEventListener("click", send);

  async function send(){
    var text = input.value.trim();
    if (!text || busy) return;
    busy = true; sendBtn.disabled = true;
    input.value = ""; input.style.height="auto";
    addMsg("user", text);
    messages.push({ role:"user", content:text });
    typing(true);

    try {
      var hdrs = { "content-type":"application/json" };
      if (CFG.anonKey){ hdrs["authorization"]="Bearer "+CFG.anonKey; hdrs["apikey"]=CFG.anonKey; }
      var r = await fetch(CFG.endpoint, { method:"POST", headers:hdrs, body:JSON.stringify({ messages: messages.slice(-12) }) });
      var data = await r.json().catch(function(){ return {}; });
      typing(false);
      if (r.ok && data.reply){
        addMsg("bot", data.reply);
        messages.push({ role:"assistant", content:data.reply });
      } else {
        addMsg("bot", data.error || "Entschuldigung, da ist etwas schiefgelaufen. Bitte nutzen Sie das Kontaktformular.");
      }
    } catch (err){
      typing(false);
      addMsg("bot", "Verbindung nicht möglich. Bitte später erneut versuchen oder das Kontaktformular nutzen.");
    } finally {
      busy = false; sendBtn.disabled = false; input.focus();
    }
  }
})();
