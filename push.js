/* ══════════════════════════════════════════════════════════════
   DM — notificações push (OneSignal)
   Liga este dispositivo ao nome de quem entrou (Diogo/Marla), para
   o Code.gs conseguir mandar a notificação à pessoa certa.
   Preenche APP_ID depois de criares a app no dashboard do OneSignal
   (Settings → Keys & IDs → OneSignal App ID).
   ══════════════════════════════════════════════════════════════ */
const Push = (() => {
  const APP_ID = "2b2162eb-3c8d-4fde-a89a-237c23973af6";
  const ENABLED_KEY = 'dm_push_enabled';

  let readyResolve;
  const ready = new Promise(res => { readyResolve = res; });

  function init(){
    if (!isSupported() || APP_ID.indexOf('COLOCA_AQUI') === 0) { readyResolve(null); return; }
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    OneSignalDeferred.push(async function (OneSignal) {
      await OneSignal.init({ appId: APP_ID });
      const user = Auth.getStoredUser();
      if (user) await OneSignal.login(user);
      readyResolve(OneSignal);
    });
  }

  function isSupported(){
    return 'serviceWorker' in navigator && window.isSecureContext;
  }

  // No Safari em iOS, ler o estado da permissão a cada abertura da app
  // (Notification.permission, usado por baixo do SDK) é conhecido por
  // devolver valores errados dentro de apps instaladas no ecrã principal
  // — por isso, em vez de perguntar ao browser, guardamos localmente que
  // já ativaste, na primeira vez que resulta.
  function alreadyEnabled(){
    return localStorage.getItem(ENABLED_KEY) === '1';
  }

  // 'granted' | 'default' | 'unsupported' — só chamado quando alreadyEnabled() é false.
  async function permissionState(){
    if (alreadyEnabled()) return 'granted';
    const OneSignal = await ready;
    if (!OneSignal) return 'unsupported';
    return OneSignal.Notifications.permission ? 'granted' : 'default';
  }

  async function requestPermission(){
    const OneSignal = await ready;
    if (!OneSignal) return 'unsupported';
    await OneSignal.Notifications.requestPermission();
    const result = OneSignal.Notifications.permission ? 'granted' : 'default';
    if (result === 'granted') localStorage.setItem(ENABLED_KEY, '1');
    return result;
  }

  function reset(){ localStorage.removeItem(ENABLED_KEY); }

  return { init, isSupported, permissionState, requestPermission, alreadyEnabled, reset };
})();
