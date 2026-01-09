declare module 'occt-import-js' {
  interface BrepFace {
    first: number;  // First triangle index
    last: number;   // Last triangle index
    color?: [number, number, number];  // RGB color if available
  }

  interface OcctMesh {
    name?: string;
    color?: [number, number, number];
    attributes: {
      position: {
        array: number[];
      };
      normal?: {
        array: number[];
      };
    };
    index?: {
      array: number[];
    };
    brep_faces?: BrepFace[];  // B-rep face boundaries
  }

  interface OcctResult {
    success: boolean;
    error?: string;
    meshes: OcctMesh[];
  }

  interface OcctInstance {
    ReadStepFile(buffer: Uint8Array, params: null): OcctResult;
  }

  interface OcctInitOptions {
    locateFile?: (name: string) => string;
    instantiateWasm?: (
      imports: WebAssembly.Imports,
      receiveInstance: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void
    ) => Promise<WebAssembly.Exports> | WebAssembly.Exports;
  }

  function occtimportjs(options?: OcctInitOptions): Promise<OcctInstance>;
  export default occtimportjs;
}
