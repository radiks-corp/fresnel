const { app, BrowserWindow, Notification, ipcMain, shell } = require('electron');
const path = require('path');

// Keep a global reference to prevent garbage collection.
let mainWindow = null;
let pollingInterval = null;
let seenReviewRequests = new Set();

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Initialize Sentry only in production
// Use /main for Electron main process
const Sentry = require("@sentry/electron/main");

Sentry.init({
  dsn: "https://1313505948be789d210f934165505f77@o4510896900276224.ingest.us.sentry.io/4510896915939328",
  enabled: !isDev,
  tracesSampleRate: 1.0,
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL('https://app.reviewgpt.ca');
  }

  // macOS trackpad swipe gestures for back/forward navigation
  mainWindow.on('swipe', (event, direction) => {
    if (direction === 'left') {
      mainWindow.webContents.goBack();
    } else if (direction === 'right') {
      mainWindow.webContents.goForward();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Show native notification for new review request
function showReviewNotification(pr) {
  if (!Notification.isSupported()) {
    console.warn('Notifications are not supported on this system.');
    return;
  }

  const notification = new Notification({
    title: 'New Review Request',
    body: `${pr.user.login} requested your review on "${pr.title}"`,
    icon: path.join(__dirname, '../icon.png'),
  });

  notification.on('click', () => {
    // Open the PR in the browser
    shell.openExternal(pr.html_url);
    // Focus an existing window, or recreate one if all windows were closed.
    if (!mainWindow) createWindow();
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  notification.show();
}

// Poll GitHub for review requests
async function pollReviewRequests(token) {
  if (!token) return;

  try {
    const response = await fetch(
      'https://api.github.com/search/issues?q=review-requested:@me+type:pr+state:open&per_page=100',
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const error = new Error(
        `Failed to fetch review requests (${response.status} ${response.statusText || 'unknown'})` +
        (errorText ? `: ${errorText.slice(0, 500)}` : '')
      );
      console.error(error.message);
      Sentry.captureException(error, {
        tags: { area: 'review-notifications' },
        extra: {
          status: response.status,
          statusText: response.statusText,
          responseBody: errorText.slice(0, 2000),
        },
      });
      return;
    }

    const data = await response.json();
    const items = data.items || [];

    // Update dock badge with total count
    const count = items.length;
    if (process.platform === 'darwin') {
      app.dock.setBadge(count > 0 ? count.toString() : '');
    }

    for (const pr of items) {
      const prId = `${pr.repository_url}#${pr.number}`;
      if (!seenReviewRequests.has(prId)) {
        showReviewNotification(pr);
        seenReviewRequests.add(prId);
      }
    }
  } catch (error) {
    console.error('Error polling review requests:', error);
    Sentry.captureException(error);
  }
}

// Start polling for review requests
function startPolling(token) {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }

  // Initial poll
  pollReviewRequests(token);

  // Poll every 30 seconds
  pollingInterval = setInterval(() => {
    pollReviewRequests(token);
  }, 30000);
}

// Stop polling
function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  seenReviewRequests.clear();
  // Clear dock badge
  if (process.platform === 'darwin') {
    app.dock.setBadge('');
  }
}

// IPC handlers
ipcMain.on('start-review-polling', (event, token) => {
  startPolling(token);
});

ipcMain.on('stop-review-polling', () => {
  stopPolling();
});

ipcMain.on('update-token', (event, token) => {
  stopPolling();
  if (token) {
    startPolling(token);
  }
});

ipcMain.on('open-external', (event, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Keep polling on macOS while app stays active in Dock.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopPolling();
});
