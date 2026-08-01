/* ══════════════════════════════════════════════════════════════
   DM — notificações push (OneSignal)
   Liga este dispositivo ao nome de quem entrou (Diogo/Marla), para
   o Code.gs conseguir mandar a notificação à pessoa certa.
   Preenche APP_ID depois de criares a app no dashboard do OneSignal
   (Settings → Keys & IDs → OneSignal App ID).
   ══════════════════════════════════════════════════════════════ */
const Push = (() => {
  const APP_ID = 2b2162eb-3c8d-4fde-a89a-237c23973af6;

  function init(){
    if (!isSupported() || APP_ID.indexOf('COLOCA_AQUI') === 0) return;
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    OneSignalDeferred.push(async function (OneSignal) {
      await OneSignal.init({ appId: APP_ID });
      const user = Auth.getStoredUser();
      if (user) await OneSignal.login(user);
    });
  }

  function isSupported(){
    return 'serviceWorker' in navigator && window.isSecureContext;
  }

  // true/false/'default' — usa para decidir se mostras o botão "Ativar notificações"
  async function permissionState(){
    return new Promise(resolve => {
      if (!isSupported()) return resolve('unsupported');
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      OneSignalDeferred.push(function (OneSignal) {
        resolve(OneSignal.Notifications.permission ? 'granted' : 'default');
      });
    });
  }

  async function requestPermission(){
    return new Promise(resolve => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      OneSignalDeferred.push(async function (OneSignal) {
        await OneSignal.Notifications.requestPermission();
        resolve(OneSignal.Notifications.permission);
      });
    });
  }

  return { init, isSupported, permissionState, requestPermission };
})();
