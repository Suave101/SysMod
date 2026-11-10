export interface ISysmodAPI {
  saveJavaFile: (code: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  saveTextFile: (
    content: string,
    options: { defaultName: string; extension: string; description: string },
  ) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  runJKind: (lustre: string, timeoutSec?: number) => Promise<{ success: boolean; xml?: string; error?: string }>;
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