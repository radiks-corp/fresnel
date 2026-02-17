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

  // Check if running in Electron
  isElectron: true,
});
