// Android does not always emit a WebView visibility event on returning to the app.
// Coalesce native/browser foreground events, then retry after Health Connect syncs.
(() => {
  let active = document.visibilityState === 'visible';
  let pending = null;
  let followup = null;
  const clearPending = () => {
    clearTimeout(pending);
    clearTimeout(followup);
    pending = followup = null;
  };
  const refresh = () => {
    if(active) return refreshPhoneSteps(currentDate, {force:true});
  };
  const foreground = () => {
    active = true;
    clearPending();
    pending = setTimeout(() => {
      pending = null;
      refresh();
      followup = setTimeout(() => { followup = null; refresh(); }, 3000);
    }, 150);
  };
  const background = () => { active = false; clearPending(); };
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') foreground();
    else background();
  });
  window.addEventListener('focus', foreground);
  setInterval(() => {
    if(active) refreshPhoneSteps(currentDate);
  }, 60000);

  const capacitor = window.Capacitor;
  if(capacitor?.getPlatform?.() === 'android'){
    const App = capacitor.Plugins?.App || capacitor.registerPlugin('App');
    for(const [event, listener] of [
      ['appStateChange', state => state.isActive ? foreground() : background()],
      ['resume', foreground]
    ]){
      try{
        Promise.resolve(App.addListener(event, listener))
          .catch(error => console.error('Could not register step refresh event', event, error));
      }catch(error){ console.error('Could not register step refresh event', event, error); }
    }
  }
})();
