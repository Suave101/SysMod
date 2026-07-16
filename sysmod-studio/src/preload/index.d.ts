export interface ISysmodAPI {
  saveJavaFile: (code: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
}

declare global {
  interface Window {
    sysmodAPI: ISysmodAPI;
    electronAPI: {
      saveData: (data: any) => Promise<{ success: boolean; error?: string }>
      loadData: () => Promise<any>
    };
  }
}

export {}