// Stubs de vérification locale (non utilisés par l'application).
// Permettent de faire tourner tsc sans node_modules dans le bac à sable.

declare namespace JSX {
  interface IntrinsicAttributes {
    key?: string | number;
  }
  interface IntrinsicElements {
    [elemName: string]: any;
  }
  type Element = any;
}

declare namespace React {
  type ReactNode = any;
  type Key = string | number;
  type CSSProperties = { [k: string]: string | number | undefined };
  const Fragment: any;
  const StrictMode: any;
  interface Context<T> {
    Provider: any;
    Consumer: any;
  }
  interface ChangeEvent<T = any> {
    target: T;
    currentTarget: T;
  }
  interface RefObject<T> {
    current: T;
  }
  function createContext<T>(defaultValue: T): Context<T>;
  function useState<T>(
    initial: T | (() => T),
  ): [T, (value: T | ((prev: T) => T)) => void];
  function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  function useCallback<T extends (...args: any[]) => any>(
    fn: T,
    deps: any[],
  ): T;
  function useContext<T>(context: Context<T>): T;
  function useMemo<T>(factory: () => T, deps: any[]): T;
  function useRef<T>(initial: T): { current: T };
}

declare module 'react' {
  export = React;
}

declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare module 'react-dom/client' {
  export function createRoot(container: Element | DocumentFragment): {
    render(node: any): void;
  };
}

declare module 'qrcode' {
  const QRCode: {
    toDataURL(
      text: string,
      options?: { width?: number; margin?: number },
    ): Promise<string>;
  };
  export default QRCode;
}

declare module '*.css';

declare module '@vitejs/plugin-react' {
  const plugin: (options?: any) => any;
  export default plugin;
}

declare module 'vite' {
  export function defineConfig(config: any): any;
}
