import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { registerJKindHandlers } from './jkind';
import windowIcon from '../../resources/icon.png?asset';

registerJKindHandlers();

// Handles writing the JSON file to the user's local AppData directory
ipcMain.handle('save-local-json', async (_event, data) => {
  try {
    const filePath = path.join(app.getPath('userData'), 'workspace-data.json')
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return { success: true }
  } catch (error: any) {
    console.error("Failed to save JSON:", error)
    return { success: false, error: error.message }
  }
})

// Handles loading the JSON file on startup
ipcMain.handle('load-local-json', async () => {
  try {
    const filePath = path.join(app.getPath('userData'), 'workspace-data.json')
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(raw)
    }
    return null // No file saved yet
  } catch (error) {
    console.error("Failed to load JSON:", error)
    return null
  }
})

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    // Windows and macOS take the icon from the installed app; Linux needs it on the window
    ...(process.platform === 'linux' ? { icon: windowIcon } : {}),
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

// Saves any generated text file (robot.py, Robot.java, the .aadl model) through a native dialog
ipcMain.handle(
  'save-text-file',
  async (_event, content: string, options: { defaultName: string; extension: string; description: string }) => {
    const windowContext = BrowserWindow.getFocusedWindow();
    if (!windowContext) return { success: false, error: 'No active window context detected.' };

    const { canceled, filePath } = await dialog.showSaveDialog(windowContext, {
      title: `Save ${options.defaultName}`,
      defaultPath: path.join(app.getPath('documents'), options.defaultName),
      filters: [
        { name: options.description, extensions: [options.extension] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (canceled || !filePath) return { success: false, canceled: true };

    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true, filePath };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
);

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