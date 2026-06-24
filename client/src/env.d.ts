/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

// Reference the canonical ElectronAPI type exposed by preload.ts instead of
// re-declaring it by hand. preload.ts is the single source of truth for the
// `window.electronAPI` shape (see `contextBridge.exposeInMainWorld`).
import type { ElectronAPI } from '../electron/preload';

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
