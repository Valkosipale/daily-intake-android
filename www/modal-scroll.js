// Share one dialog stack for page scroll locking and Android Back navigation.
(() => {
  const root = document.documentElement;
  const stack = [];
  const previousZIndex = new Map();
  const closeButtons = {
    confirmOverlay:'confirmCancelBtn', multiPhotoOverlay:'multiPhotoCancelBtn',
    apiKeyOverlay:'apiKeyCloseBtn', photoResultOverlay:'photoResultCancelBtn',
    errorOverlay:'errorCloseBtn', copyToDayOverlay:'copyToDayCancelBtn',
    previousItemsOverlay:'previousItemsCloseBtn', bodyOverlay:'bodyCancelBtn',
    weeklyOverlay:'weeklyCloseBtn', csvOverlay:'csvCloseBtn',
    exportOverlay:'exportCloseBtn', importOverlay:'importCloseBtn'
  };
  const syncDialogs = () => {
    const visible = Array.from(document.querySelectorAll('.data-overlay.show, .confirm-overlay.show'));
    for(let i=stack.length-1;i>=0;i--){
      const dialog = stack[i];
      if(!visible.includes(dialog)){
        dialog.style.zIndex = previousZIndex.get(dialog);
        previousZIndex.delete(dialog);
        stack.splice(i,1);
      }
    }
    for(const dialog of visible){
      if(!previousZIndex.has(dialog)){
        previousZIndex.set(dialog,dialog.style.zIndex);
        stack.push(dialog);
      }
    }
    stack.forEach((dialog,index)=>{ dialog.style.zIndex = String(110+index); });
    root.classList.toggle('dialog-open', stack.length > 0);
  };
  const closeTopDialog = () => {
    syncDialogs();
    const dialog = stack[stack.length-1];
    if(!dialog) return false;
    const buttonId = closeButtons[dialog.id];
    const button = buttonId ? document.getElementById(buttonId) : null;
    if(button) button.click();
    else if(dialog.id === 'photoLoadingOverlay') cancelLoadingOverlay();
    else dialog.classList.remove('show');
    syncDialogs();
    return true;
  };
  const observer = new MutationObserver(syncDialogs);
  observer.observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['class']});
  syncDialogs();

  const capacitor = window.Capacitor;
  if(capacitor?.getPlatform?.() === 'android'){
    const App = capacitor.Plugins?.App || capacitor.registerPlugin('App');
    Promise.resolve(App.addListener('backButton', ()=>{
      if(closeTopDialog()) return;
      return App.exitApp();
    })).catch(error=>console.error('Could not register Android Back navigation',error));
  }
})();
