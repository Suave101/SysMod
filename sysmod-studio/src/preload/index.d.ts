export interface ISysmodAPI {
  saveJavaFile: (code: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
}

declare global {
  interface Window {
    sysmodAPI: ISysmodAPI;
  }
}