import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true, // Bolsters security matching Electron production guidelines
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  // Target development server URL configuration mapping electron-vite build routing
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

// Secure Native Operating System File API Interface Handler
ipcMain.handle('save-java-file', async (_event, code: string) => {
  const windowContext = BrowserWindow.getFocusedWindow();
  if (!windowContext) return { success: false, error: 'No active window context detected.' };

  const { canceled, filePath } = await dialog.showSaveDialog(windowContext, {
    title: 'Export Robot Hardware Configuration',
    defaultPath: path.join(app.getPath('documents'), 'RobotHardware.java'),
    filters: [
      { name: 'Java Source Files', extensions: ['java'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (canceled || !filePath) {
    return { success: false, error: 'File save dialog operation aborted by system client.' };
  }

  try {
    fs.writeFileSync(filePath, code, 'utf-8');
    return { success: true, filePath };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});