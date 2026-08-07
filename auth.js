//* ══════════════════════════════════════════════════════════════
   DC Family — bloqueio de acesso
   Password verdadeira, verificada no Apps Script (Code.gs).
   Face ID / Touch ID é só um atalho local para não teres de
   escrever a password sempre — nunca substitui a verificação
   no servidor na primeira vez em cada dispositivo.
   ══════════════════════════════════════════════════════════════ */
const Auth = (() => {
  const API_URL = "https://script.google.com/macros/s/AKfycbxzKI0lupG5gjLzuC3J1aR5AwVA1PIbSxTqA7Pjy3NWp_HaUbctCbNzhxjbuXx5GtqnJw/exec";
  const PIN_KEY  = 'dm_pin';
  const CRED_KEY = 'dm_cred_id';
  const SESSION_KEY = 'dm_session_until'; // agora guarda um prazo (timestamp), não um simples sim/não
  const USER_KEY = 'dm_user';
  const SESSION_DAYS = 7;

  function markSessionUnlocked(){
    localStorage.setItem(SESSION_KEY, String(Date.now() + SESSION_DAYS*24*60*60*1000));
  }
  function isSessionStillValid(){
    const until = parseInt(localStorage.getItem(SESSION_KEY) || '0', 10);
    return Date.now() < until;
  }

  const b64e = s => btoa(unescape(encodeURIComponent(s)));
  const b64d = s => decodeURIComponent(escape(atob(s)));
  const bufToB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const b64ToBuf = b64 => { const bin=atob(b64); const buf=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) buf[i]=bin.charCodeAt(i); return buf; };

  function getStoredPin(){ const v = localStorage.getItem(PIN_KEY); return v ? b64d(v) : null; }
  function setStoredPin(pin){ localStorage.setItem(PIN_KEY, b64e(pin)); }
  function getStoredUser(){ return localStorage.getItem(USER_KEY); }
  function hasBiometric(){ return !!localStorage.getItem(CRED_KEY); }
  function forget(){ localStorage.removeItem(PIN_KEY); localStorage.removeItem(CRED_KEY); localStorage.removeItem(USER_KEY); localStorage.removeItem(SESSION_KEY); }

  async function verifyPinWithServer(pin){
    try {
      const r = await fetch(API_URL + '?action=checkpin&pin=' + encodeURIComponent(pin));
      const d = await r.json();
      if (d.ok && d.user) localStorage.setItem(USER_KEY, d.user);
      return !!d.ok;
    } catch(e){ return false; }
  }

  async function platformAuthAvailable(){
    if (!window.PublicKeyCredential || !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(()=>false);
  }

  async function registerBiometric(){
    try {
      if (!(await platformAuthAvailable())) return false;
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = crypto.getRandomValues(new Uint8Array(16));
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'DC Family' },
          user: { id: userId, name: 'family', displayName: 'Family' },
          pubKeyCredParams: [{ type:'public-key', alg:-7 }, { type:'public-key', alg:-257 }],
          authenticatorSelection: { authenticatorAttachment:'platform', userVerification:'required' },
          timeout: 60000
        }
      });
      if (!cred) return false;
      localStorage.setItem(CRED_KEY, bufToB64(cred.rawId));
      return true;
    } catch(e){ return false; }
  }

  async function authenticateBiometric(){
    const credId = localStorage.getItem(CRED_KEY);
    if (!credId || !window.PublicKeyCredential) return false;
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{ id: b64ToBuf(credId), type:'public-key' }],
          userVerification:'required',
          timeout: 60000
        }
      });
      return !!assertion;
    } catch(e){ return false; }
  }

  function lockScreenHTML(){
    return `
    <div id="dm-lock" style="position:fixed;inset:0;background:#0A0D12;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;font-family:'DM Sans',sans-serif">
      <svg width="80" height="57" viewBox="90 95 560 400" style="margin-bottom:10px">
        <defs>
          <linearGradient id="lockgd" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F4D27A"/><stop offset="45%" stop-color="#D2A13A"/><stop offset="100%" stop-color="#8E641C"/></linearGradient>
        </defs>
        <path fill="url(#lockgd)" fill-rule="evenodd" d="M120 470 L620 470 L620 120 Z M300 390 L520 390 L520 215 Z"/>
      </svg>
      <div style="font-family:'Cybertruck',sans-serif;font-size:13px;letter-spacing:.12em;color:#F4D27A;margin-bottom:22px">FAMILY</div>
      <div id="dm-lock-msg" style="color:#8B95A5;font-size:13px;margin-bottom:18px">Introduz a password</div>
      <input id="dm-lock-pin" type="password" inputmode="numeric" autocomplete="off" placeholder="••••" style="width:180px;text-align:center;font-size:24px;letter-spacing:8px;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:#181D26;color:#F2F4F7;margin-bottom:14px">
      <button id="dm-lock-submit" style="width:180px;padding:12px;border:none;border-radius:10px;background:#D2A13A;color:#1a1305;font-weight:700;font-size:14px;cursor:pointer;margin-bottom:10px;font-family:inherit">Entrar</button>
      <button id="dm-lock-faceid" style="display:none;width:180px;padding:10px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:transparent;color:#8B95A5;font-size:13px;cursor:pointer;font-family:inherit">🔓 Usar Face ID</button>
      <div id="dm-lock-error" style="color:#FF6B5E;font-size:12.5px;margin-top:12px;min-height:16px;text-align:center"></div>
    </div>`;
  }

  function showPasswordScreen(onUnlock, opts){
    opts = opts || {};
    document.body.insertAdjacentHTML('beforeend', lockScreenHTML());
    const box    = document.getElementById('dm-lock');
    const input  = document.getElementById('dm-lock-pin');
    const submit = document.getElementById('dm-lock-submit');
    const err    = document.getElementById('dm-lock-error');
    const faceBtn= document.getElementById('dm-lock-faceid');
    const msg    = document.getElementById('dm-lock-msg');

    if (opts.faceIdRetry) {
      msg.textContent = 'Confirma a tua identidade';
      faceBtn.style.display = 'block';
      faceBtn.onclick = async () => {
        err.textContent = '';
        const ok = await authenticateBiometric();
        if (ok) { markSessionUnlocked(); box.remove(); onUnlock(getStoredPin()); }
        else { err.textContent = 'Não foi possível confirmar. Usa a password.'; }
      };
    }

    async function trySubmit(){
      const pin = input.value.trim();
      if (!pin) { err.textContent = 'Introduz a password.'; return; }
      submit.disabled = true; submit.textContent = 'A verificar...';
      const ok = await verifyPinWithServer(pin);
      submit.disabled = false; submit.textContent = 'Entrar';
      if (!ok) { err.textContent = 'Password incorreta.'; input.value=''; input.focus(); return; }

      setStoredPin(pin);
      box.remove();

      if (!hasBiometric() && await platformAuthAvailable()) {
        if (confirm('Queres usar Face ID/Touch ID para abrir mais depressa da próxima vez neste iPhone?')) {
          await registerBiometric();
        }
      }
      markSessionUnlocked();
      onUnlock(pin);
    }
    submit.onclick = trySubmit;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') trySubmit(); });
    setTimeout(()=>input.focus(), 50);
  }

  // Chamar isto no topo de cada página: Auth.protect(pin => { ...mostra a página... })
  async function protect(onUnlock){
    const storedPin = getStoredPin();

    // Ainda dentro do prazo de 7 dias desde a última vez que confirmaste
    // (password ou Face ID) — não voltar a pedir nada.
    if (storedPin && isSessionStillValid()) {
      onUnlock(storedPin);
      return;
    }

    if (storedPin && hasBiometric()) {
      const ok = await authenticateBiometric();
      if (ok) { markSessionUnlocked(); onUnlock(storedPin); return; }
      showPasswordScreen(onUnlock, { faceIdRetry:true });
      return;
    }
    if (storedPin && !hasBiometric()) {
      markSessionUnlocked();
      onUnlock(storedPin);
      return;
    }
    showPasswordScreen(onUnlock, {});
  }

  return { protect, forget, getStoredPin, getStoredUser, API_URL };
})();