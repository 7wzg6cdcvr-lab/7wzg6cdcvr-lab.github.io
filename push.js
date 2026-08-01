/* ══════════════════════════════════════════════════════════════
   DM — notificações push (OneSignal)
   Liga este dispositivo ao nome de quem entrou (Diogo/Marla), para
   o Code.gs conseguir mandar a notificação à pessoa certa.
   Preenche APP_ID depois de criares a app no dashboard do OneSignal
   (Settings → Keys & IDs → OneSignal App ID).
   ══════════════════════════════════════════════════════════════ */
const Push = (() => {
  const APP_ID = "2b2162eb-3c8d-4fde-a89a-237c23973af6";

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

  // true/false/'default' — usa para decidir se mostras o botão "Ativar notificações".
  // Espera mesmo pelo init() terminar antes de ler o estado — sem isto, lia sempre
  // "por decidir" mesmo depois de já teres aceitado, porque o SDK ainda não estava pronto.
  async function permissionState(){
    const OneSignal = await ready;
    if (!OneSignal) return 'unsupported';
    return OneSignal.Notifications.permission ? 'granted' : 'default';
  }

  async function requestPermission(){
    const OneSignal = await ready;
    if (!OneSignal) return 'unsupported';
    await OneSignal.Notifications.requestPermission();
    return OneSignal.Notifications.permission;
  }

  return { init, isSupported, permissionState, requestPermission };
})();
