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
  },
  saveTextFile: (content: string, options: { defaultName: string; extension: string; description: string }) =>
    ipcRenderer.invoke('save-text-file', content, options),
  runJKind: (lustre: string, timeoutSec?: number) => ipcRenderer.invoke('run-jkind', lustre, timeoutSec)
});