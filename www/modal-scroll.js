// Keep the page locked until every dialog is closed, including stacked dialogs.
(() => {
  const root = document.documentElement;
  const syncDialogScrollLock = () => {
    root.classList.toggle('dialog-open', !!document.querySelector('.data-overlay.show, .confirm-overlay.show'));
  };
  const observer = new MutationObserver(syncDialogScrollLock);
  observer.observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['class']});
  syncDialogScrollLock();
})();
