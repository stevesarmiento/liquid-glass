/**
 * Type declaration for the "#wasm" subpath import (package.json "imports"),
 * which resolves to ./wasm/liquid_glass_core.js. Shape mirrors
 * wasm/liquid_glass_core.d.ts.
 */
declare module "#wasm" {
  export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;
  export type SyncInitInput = BufferSource | WebAssembly.Module;

  export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly generateDisplacementMap: (a: unknown) => [number, number, number];
    readonly generateMergedDisplacementMap: (a: unknown) => [number, number, number];
    readonly computeLensGeometry: (a: unknown) => [number, number, number];
  }

  export function computeLensGeometry(input: unknown): unknown;
  export function generateDisplacementMap(params: unknown): Uint8Array;
  export function generateMergedDisplacementMap(input: unknown): Uint8Array;
  export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

  export default function init(
    moduleOrPath?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>,
  ): Promise<InitOutput>;
}
