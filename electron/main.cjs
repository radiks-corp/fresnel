const { app, BrowserWindow, Notification, ipcMain, shell } = require('electron');
const path = require('path');

// Keep a global reference to prevent garbage collection.
let mainWindow = null;
let pollingInterval = null;
let seenReviewRequests = new Set();

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Show native notification for new review request
function showReviewNotification(pr) {
  const notification = new Notification({
    title: 'New Review Request',
    body: `${pr.user.login} requested your review on "${pr.title}"`,
    icon: path.join(__dirname, '../icon.png'),
  });

  notification.on('click', () => {
    // Open the PR in the browser
    shell.openExternal(pr.html_url);
    // Also focus the app window
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
      console.error('Failed to fetch review requests:', response.status);
      return;
    }

    const data = await response.json();
    const items = data.items || [];

    // Update dock badge with total count
    const count = items.length;
    if (process.platform === 'darwin') {
      app.dock.setBadge(count > 0 ? count.toString() : '');
    }

    // TEST MODE: Treat all PRs as new and notify for each one
    for (const pr of items) {
      const prId = `${pr.repository_url}#${pr.number}`;
      if (!seenReviewRequests.has(prId)) {
        showReviewNotification(pr);
        seenReviewRequests.add(prId);
      }
    }
  } catch (error) {
    console.error('Error polling review requests:', error);
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
  console.log('Starting review request polling...');
  startPolling(token);
});

ipcMain.on('stop-review-polling', () => {
  console.log('Stopping review request polling...');
  stopPolling();
});

ipcMain.on('update-token', (event, token) => {
  console.log('Updating token and restarting polling...');
  stopPolling();
  if (token) {
    startPolling(token);
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
  stopPolling();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
