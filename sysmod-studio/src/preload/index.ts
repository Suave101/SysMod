import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  saveData: (data: any) => ipcRenderer.invoke('save-local-json', data),
  loadData: () => ipcRenderer.invoke('load-local-json')
})

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