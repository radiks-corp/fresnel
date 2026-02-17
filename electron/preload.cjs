const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Start polling for review requests with the given token
  startReviewPolling: (token) => ipcRenderer.send('start-review-polling', token),
  
  // Stop polling for review requests
  stopReviewPolling: () => ipcRenderer.send('stop-review-polling'),
  
  // Update the GitHub token and restart polling
  updateToken: (token) => ipcRenderer.send('update-token', token),
  
  // Open a URL in the user's default system browser
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // Auto-update: listen for status changes from the main process
  onUpdateStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },

  // Auto-update: trigger quit-and-install
  installUpdate: () => ipcRenderer.send('install-update'),

  // Auto-update: manually check for updates
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),

  // Check if running in Electron
  isElectron: true,
});
