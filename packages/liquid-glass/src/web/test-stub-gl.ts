import { vi } from "vitest";

/**
 * Minimal hand-rolled WebGL2 stub for tests: records call names so suites can
 * assert renderer/compositor behavior without a real GL context (jsdom has
 * none). Mirrors the stub in webgl-renderer.test.ts.
 */
export function createStubGl() {
  const calls: string[] = [];
  const record =
    (name: string) =>
    (..._args: unknown[]) => {
      calls.push(name);
    };
  const constants = [
    "VERTEX_SHADER",
    "FRAGMENT_SHADER",
    "COMPILE_STATUS",
    "LINK_STATUS",
    "ARRAY_BUFFER",
    "STATIC_DRAW",
    "FLOAT",
    "TEXTURE_2D",
    "TEXTURE0",
    "TEXTURE1",
    "TEXTURE_MIN_FILTER",
    "TEXTURE_MAG_FILTER",
    "TEXTURE_WRAP_S",
    "TEXTURE_WRAP_T",
    "LINEAR",
    "CLAMP_TO_EDGE",
    "RGBA",
    "UNSIGNED_BYTE",
    "FRAMEBUFFER",
    "COLOR_ATTACHMENT0",
    "TRIANGLE_STRIP",
    "BLEND",
    "COLOR_BUFFER_BIT",
    "UNPACK_FLIP_Y_WEBGL",
    "UNPACK_PREMULTIPLY_ALPHA_WEBGL",
  ] as const;
  const gl: Record<string, unknown> = {};
  constants.forEach((name, index) => {
    gl[name] = index + 1;
  });
  let contextLost = false;
  Object.assign(gl, {
    createShader: () => ({}),
    shaderSource: record("shaderSource"),
    compileShader: record("compileShader"),
    getShaderParameter: () => true,
    getShaderInfoLog: () => "",
    deleteShader: record("deleteShader"),
    createProgram: () => ({}),
    attachShader: record("attachShader"),
    linkProgram: record("linkProgram"),
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    deleteProgram: record("deleteProgram"),
    createBuffer: () => ({}),
    bindBuffer: record("bindBuffer"),
    bufferData: record("bufferData"),
    deleteBuffer: record("deleteBuffer"),
    createVertexArray: () => ({}),
    bindVertexArray: record("bindVertexArray"),
    deleteVertexArray: record("deleteVertexArray"),
    enableVertexAttribArray: record("enableVertexAttribArray"),
    vertexAttribPointer: record("vertexAttribPointer"),
    createTexture: () => ({}),
    bindTexture: record("bindTexture"),
    texParameteri: record("texParameteri"),
    texImage2D: record("texImage2D"),
    deleteTexture: record("deleteTexture"),
    pixelStorei: record("pixelStorei"),
    activeTexture: record("activeTexture"),
    createFramebuffer: () => ({}),
    bindFramebuffer: record("bindFramebuffer"),
    framebufferTexture2D: record("framebufferTexture2D"),
    deleteFramebuffer: record("deleteFramebuffer"),
    useProgram: record("useProgram"),
    getUniformLocation: (_program: unknown, name: string) => ({ name }),
    uniform1i: record("uniform1i"),
    uniform1f: record("uniform1f"),
    uniform2f: record("uniform2f"),
    uniform3f: record("uniform3f"),
    uniform4f: record("uniform4f"),
    uniform1fv: record("uniform1fv"),
    viewport: record("viewport"),
    disable: record("disable"),
    drawArrays: record("drawArrays"),
    clearColor: record("clearColor"),
    clear: record("clear"),
    isContextLost: () => contextLost,
    getExtension: (name: string) =>
      name === "WEBGL_lose_context" ? { loseContext: record("loseContext") } : null,
  });
  return {
    gl: gl as unknown as WebGL2RenderingContext,
    calls,
    setContextLost(value: boolean) {
      contextLost = value;
    },
  };
}

/** A jsdom canvas whose getContext("webgl2") hands out the given stub GL. */
export function createStubGlCanvas(gl: WebGL2RenderingContext): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  vi.spyOn(canvas, "getContext").mockImplementation((type: string) =>
    type === "webgl2" ? (gl as never) : null,
  );
  return canvas;
}

/** A jsdom canvas with a recording 2D context (blit target). */
export function createStub2dCanvas(): { canvas: HTMLCanvasElement; drawImageCalls: unknown[][] } {
  const canvas = document.createElement("canvas");
  const drawImageCalls: unknown[][] = [];
  const ctx2d = {
    canvas,
    clearRect: vi.fn(),
    drawImage: (...args: unknown[]) => {
      drawImageCalls.push(args);
    },
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(canvas, "getContext").mockImplementation((type: string) =>
    type === "2d" ? (ctx2d as never) : null,
  );
  return { canvas, drawImageCalls };
}
