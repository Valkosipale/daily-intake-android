// Android does not always emit a WebView visibility event on returning to the app.
// Coalesce native/browser foreground events, then retry after Health Connect syncs.
(() => {
  let active = document.visibilityState === 'visible';
  let nativeActive = null;
  let pending = null;
  let followup = null;
  let later = null;
  const clearPending = () => {
    clearTimeout(pending);
    clearTimeout(followup);
    clearTimeout(later);
    pending = followup = later = null;
  };
  const refresh = (restart = false) => {
    if(active) return refreshPhoneSteps(currentDate, {force:true, restart});
  };
  const foreground = () => {
    active = true;
    clearPending();
    pending = setTimeout(() => {
      pending = null;
      refresh(true);
      later = setTimeout(() => { later = null; refresh(); }, 15000);
      followup = setTimeout(() => { followup = null; refresh(); }, 3000);
    }, 150);
  };
  const background = () => { active = false; clearPending(); };
  document.addEventListener('visibilitychange', () => {
    if(nativeActive !== null) return; // Native app state is authoritative on Android.
    if(document.visibilityState === 'visible') foreground();
    else background();
  });
  window.addEventListener('focus', () => { if(nativeActive !== false) foreground(); });
  setInterval(() => {
    if(active) refreshPhoneSteps(currentDate);
  }, 60000);

  const capacitor = window.Capacitor;
  if(capacitor?.getPlatform?.() === 'android'){
    const App = capacitor.Plugins?.App || capacitor.registerPlugin('App');
    for(const [event, listener] of [
      ['appStateChange', state => {nativeActive = state.isActive;state.isActive ? foreground() : background();}],
      ['resume', () => {nativeActive = true;foreground();}]
    ]){
      try{
        Promise.resolve(App.addListener(event, listener))
          .catch(error => console.error('Could not register step refresh event', event, error));
      }catch(error){ console.error('Could not register step refresh event', event, error); }
    }
  }
})();
