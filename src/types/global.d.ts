declare global {
  interface Window {
    aistudyLifecycle?: {
      onBeforeClose: (callback: () => Promise<unknown> | unknown) => () => void;
    };
    aistudyClipboard?: {
      writeText: (text: string) => Promise<boolean>;
    };
    aistudyDatabase?: {
      getConfig: () => Promise<any>;
      saveConfig: (config: any) => Promise<void>;
      getTursoConfig?: () => Promise<any>;
      saveTursoConfig?: (config: any) => Promise<void>;
    };
  }
}

export {};
