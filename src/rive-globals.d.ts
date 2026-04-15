declare global {
  interface RiveInstance {
    contents?: unknown | (() => unknown | Promise<unknown>);
    defaultViewModel?: () => { properties?: Array<{ name: string; type: string }> } | null;
    viewModelInstance?: {
      string?: (name: string) => { value: string } | null;
      number?: (name: string) => { value: number } | null;
      boolean?: (name: string) => { value: boolean } | null;
      color?: (name: string) => { value: number | string } | null;
      image?: (name: string) => { value: unknown } | null;
      trigger?: (name: string) => unknown;
    } | null;
    cleanup?: () => void;
  }

  interface RiveConstructorOptions {
    src: string;
    canvas: HTMLCanvasElement;
    autoplay: boolean;
    artboard?: string;
    stateMachines?: string;
    autoBind?: boolean;
    onLoad?: () => void;
    onLoadError?: (error?: unknown) => void;
  }

  interface RiveGlobal {
    Rive: new (options: RiveConstructorOptions) => RiveInstance;
    decodeImage?: (bytes: Uint8Array) => Promise<unknown>;
  }

  var rive: RiveGlobal | undefined;
}

export {};
