/// <reference types="vite/client" />

interface Window {
  aistudyWindow: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
  };
}

declare module 'tiptap-extension-line-height';

