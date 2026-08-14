/* ══════════════════════════════════════════════════════════════
   DC Family — acesso
   Password verdadeira, verificada no Apps Script (Code.gs).
   Uma vez introduzida, o utilizador e a password ficam guardados
   neste dispositivo e a entrada é automática — até se fazer
   logout (Auth.logout()).
   ══════════════════════════════════════════════════════════════ */
const Auth = (() => {
  const API_URL = "https://script.google.com/macros/s/AKfycbxzKI0lupG5gjLzuC3J1aR5AwVA1PIbSxTqA7Pjy3NWp_HaUbctCbNzhxjbuXx5GtqnJw/exec";
  const PIN_KEY  = 'dm_pin';
  const USER_KEY = 'dm_user';

  const b64e = s => btoa(unescape(encodeURIComponent(s)));
  const b64d = s => decodeURIComponent(escape(atob(s)));

  function getStoredPin(){ const v = localStorage.getItem(PIN_KEY); return v ? b64d(v) : null; }
  function setStoredPin(pin){ localStorage.setItem(PIN_KEY, b64e(pin)); }
  function getStoredUser(){ return localStorage.getItem(USER_KEY); }
  function forget(){ localStorage.removeItem(PIN_KEY); localStorage.removeItem(USER_KEY); }

  function logout(){
    forget();
    location.href = './index.html';
  }

  async function verifyPinWithServer(pin, claimedUser){
    try {
      const url = API_URL + '?action=checkpin&pin=' + encodeURIComponent(pin) +
        (claimedUser ? '&claimedUser=' + encodeURIComponent(claimedUser) : '');
      const r = await fetch(url);
      const d = await r.json();
      if (d.ok && d.user) localStorage.setItem(USER_KEY, d.user);
      return d;
    } catch(e){ return { ok:false, error:'Sem ligação à rede.' }; }
  }

  function lockScreenHTML(){
    return `
    <div id="dm-lock" style="position:fixed;inset:0;background:#0A0D12;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;font-family:'DM Sans',sans-serif">
      <img src="logo.svg" alt="DC logo" style="width:160px;height:auto;margin-bottom:0">
      <div style="font-family:'Cybertruck',sans-serif;font-size:30px;letter-spacing:.08em;color:#B0B5BD;margin-top:-4px;margin-bottom:26px">FAMILY</div>

      <div style="width:100%;max-width:280px;background:#12161D;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:22px">
        <div style="color:#8B95A5;font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Utilizador</div>
        <input id="dm-lock-user" type="text" autocomplete="off" autocapitalize="words" style="width:100%;box-sizing:border-box;font-size:15px;padding:11px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:#181D26;color:#F2F4F7;margin-bottom:16px">

        <div style="color:#8B95A5;font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Password</div>
        <input id="dm-lock-pin" type="password" autocomplete="off" style="width:100%;box-sizing:border-box;font-size:15px;padding:11px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:#181D26;color:#F2F4F7;margin-bottom:16px">

        <div style="display:flex;justify-content:center">
          <button id="dm-lock-submit" title="Entrar" aria-label="Entrar" style="width:34px;height:34px;padding:0;border:none;border-radius:10px;background:#D2A13A;color:#1a1305;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
          </button>
        </div>
      </div>
      <div id="dm-lock-error" style="color:#FF6B5E;font-size:12.5px;margin-top:14px;min-height:16px;text-align:center"></div>
    </div>`;
  }

  function showPasswordScreen(onUnlock){
    document.body.insertAdjacentHTML('beforeend', lockScreenHTML());
    const box       = document.getElementById('dm-lock');
    const userInput = document.getElementById('dm-lock-user');
    const input     = document.getElementById('dm-lock-pin');
    const submit    = document.getElementById('dm-lock-submit');
    const err       = document.getElementById('dm-lock-error');

    const stored = getStoredUser();
    if (stored) userInput.value = stored;
    setTimeout(() => (stored ? input : userInput).focus(), 50);

    async function trySubmit(){
      const name = userInput.value.trim();
      if (!name) { err.textContent = 'Escreve o teu nome.'; userInput.focus(); return; }
      const pin = input.value.trim();
      if (!pin) { err.textContent = 'Introduz a password.'; return; }
      submit.disabled = true; submit.style.opacity = '0.5';
      const res = await verifyPinWithServer(pin, name);
      submit.disabled = false; submit.style.opacity = '1';
      if (!res.ok) {
        err.textContent = res.error || 'Password incorreta.';
        input.value=''; input.focus();
        return;
      }
      setStoredPin(pin);
      box.remove();

      // O iOS só deixa pedir permissão de notificações em resposta direta
      // a um toque — este clique no "Entrar" é esse toque, por isso é
      // aqui (e não mais tarde, já sem toque nenhum) que se pede.
      if (window.Push) {
        try { Push.init(); Push.requestPermission(); } catch (e) {}
      }

      onUnlock(pin);
    }
    submit.onclick = trySubmit;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') trySubmit(); });
    userInput.addEventListener('keydown', e => { if (e.key === 'Enter') input.focus(); });
  }

  // Chamar isto no topo de cada página: Auth.protect(pin => { ...mostra a página... })
  // Se o dispositivo já tem utilizador+password guardados, entra logo,
  // sem perguntar nada — só volta a pedir depois de um logout.
  async function protect(onUnlock){
    const storedPin = getStoredPin();
    if (storedPin) { onUnlock(storedPin); return; }
    showPasswordScreen(onUnlock);
  }

  return { protect, forget, logout, getStoredPin, getStoredUser, API_URL };
})();
