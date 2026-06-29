import { contextBridge, ipcRenderer } from 'electron';

interface SaveFileResponse {
  success: boolean;
  filePath?: string;
  error?: string;
}

contextBridge.exposeInMainWorld('sysmodAPI', {
  saveJavaFile: async (code: string): Promise<SaveFileResponse> => {
    return await ipcRenderer.invoke('save-java-file', code);
  }
});