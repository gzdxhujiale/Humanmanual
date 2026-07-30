// Global environment patches to execute before any components/dependencies load

// 1. Prevent Yjs duplicate import warning from bundled third-party dependencies (e.g. reactjs-tiptap-editor)
if (typeof globalThis !== 'undefined') {
  try {
    Object.defineProperty(globalThis, '__ $YJS$ __', {
      get() {
        return false;
      },
      set() {},
      configurable: true,
      enumerable: true,
    });
  } catch {
    // Fallback if property is non-configurable
  }
}

// Intercept console.error for specific warnings
const originalConsoleError = console.error;
console.error = function (...args: any[]) {
  if (typeof args[0] === 'string') {
    if (args[0].includes('Yjs was already imported')) {
      return;
    }
    if (args[0].includes('Accessing element.ref was removed in React 19')) {
      return;
    }
    if (args[0].includes('A props object containing a "key" prop is being spread into JSX')) {
      return;
    }
  }
  originalConsoleError.apply(console, args);
};

// 2. Set default willReadFrequently to true for Canvas 2D contexts to eliminate readback warnings
if (typeof HTMLCanvasElement !== 'undefined') {
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    type: string,
    attributes?: any
  ) {
    if (type === '2d') {
      attributes = { willReadFrequently: true, ...attributes };
    }
    return origGetContext.call(this, type as any, attributes);
  } as any;
}
