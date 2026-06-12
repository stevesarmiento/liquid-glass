import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeLensParams } from "../engine/defaults";
import type { DisplacementMap } from "../engine/types";
import {
  createGlassCompositor,
  getSharedGlassCompositor,
  resetSharedGlassCompositorForTests,
} from "./glass-compositor";
import { createStub2dCanvas, createStubGl, createStubGlCanvas } from "./test-stub-gl";
import type { WebglGlassDrawInput } from "./webgl-renderer";

function makeMap(size = 4): DisplacementMap {
  return { width: size, height: size, rgba: new Uint8ClampedArray(size * size * 4).fill(128) };
}

function makeDrawInput(overrides: Partial<WebglGlassDrawInput> = {}): WebglGlassDrawInput {
  const lens = normalizeLensParams({ width: 32, height: 20, radius: 8, mapSize: 16 });
  const scene = document.createElement("canvas");
  scene.width = 64;
  scene.height = 48;
  return {
    scene,
    sceneKey: "scene-a",
    map: makeMap(),
    lens,
    geometry: { left: 10, top: 6, width: lens.width, height: lens.height, radius: lens.radius },
    sceneWidth: 64,
    sceneHeight: 48,
    viewport: { left: 10, top: 6, width: lens.width, height: lens.height },
    pixelRatio: 1,
    ...overrides,
  };
}

afterEach(() => {
  resetSharedGlassCompositorForTests();
  vi.restoreAllMocks();
});

describe("createGlassCompositor", () => {
  it("returns null without a WebGL2 context (jsdom default)", () => {
    expect(createGlassCompositor()).toBeNull();
  });

  it("renders multiple instances through ONE shared context", () => {
    const { gl, calls } = createStubGl();
    const compositor = createGlassCompositor({ canvas: createStubGlCanvas(gl) })!;
    expect(compositor).not.toBeNull();

    const a = createStub2dCanvas();
    const b = createStub2dCanvas();
    const instanceA = compositor.register({ canvas: a.canvas });
    const instanceB = compositor.register({ canvas: b.canvas });
    expect(compositor.instanceCount).toBe(2);

    expect(instanceA.update(makeDrawInput())).toBe(true);
    expect(instanceB.update(makeDrawInput({ sceneKey: "scene-b" }))).toBe(true);

    // Both rendered (glass pass each), both blitted into their own canvas.
    expect(calls.filter((name) => name === "drawArrays").length).toBeGreaterThanOrEqual(4);
    expect(a.drawImageCalls.length).toBe(1);
    expect(b.drawImageCalls.length).toBe(1);
    compositor.destroy();
  });

  it("skips re-blur and map re-upload for an unchanged instance (cache hit)", () => {
    const { gl, calls } = createStubGl();
    const compositor = createGlassCompositor({ canvas: createStubGlCanvas(gl) })!;
    const target = createStub2dCanvas();
    const instance = compositor.register({ canvas: target.canvas });
    const input = makeDrawInput();

    instance.update(input);
    const drawsAfterFirst = calls.filter((name) => name === "drawArrays").length;
    const uploadsAfterFirst = calls.filter((name) => name === "texImage2D").length;

    instance.update(input);
    const drawsAfterSecond = calls.filter((name) => name === "drawArrays").length;
    const uploadsAfterSecond = calls.filter((name) => name === "texImage2D").length;

    // Cached blur + pooled map texture: only the glass pass runs again.
    expect(drawsAfterSecond - drawsAfterFirst).toBe(1);
    expect(uploadsAfterSecond - uploadsAfterFirst).toBe(0);
    compositor.destroy();
  });

  it("pools map textures by map identity across instances", () => {
    const { gl, calls } = createStubGl();
    const compositor = createGlassCompositor({ canvas: createStubGlCanvas(gl) })!;
    const a = compositor.register({ canvas: createStub2dCanvas().canvas });
    const b = compositor.register({ canvas: createStub2dCanvas().canvas });
    const sharedMap = makeMap();

    a.update(makeDrawInput({ map: sharedMap, sceneKey: undefined }));
    const uploadsAfterA = calls.filter((name) => name === "texImage2D").length;
    b.update(makeDrawInput({ map: sharedMap, sceneKey: undefined }));
    const uploadsAfterB = calls.filter((name) => name === "texImage2D").length;

    // B re-uploaded its scene (no sceneKey) but NOT the displacement map —
    // the pooled texture for sharedMap is reused. Scene upload = 1 texImage2D.
    expect(uploadsAfterB - uploadsAfterA).toBe(1);
    compositor.destroy();
  });

  it("blits with a y-flipped source rect when the shared canvas is taller than the output", () => {
    const { gl } = createStubGl();
    const glCanvas = createStubGlCanvas(gl);
    // Start tiny so the grow-only sizing is observable (jsdom default 300x150
    // would already cover both instances).
    glCanvas.width = 1;
    glCanvas.height = 1;
    const compositor = createGlassCompositor({ canvas: glCanvas })!;

    // Big instance grows the shared canvas...
    const bigLens = normalizeLensParams({ width: 100, height: 80, radius: 8, mapSize: 16 });
    const big = compositor.register({ canvas: createStub2dCanvas().canvas });
    big.update(
      makeDrawInput({
        lens: bigLens,
        geometry: { left: 0, top: 0, width: 100, height: 80, radius: 8 },
        viewport: { left: 0, top: 0, width: 100, height: 80 },
        sceneWidth: 100,
        sceneHeight: 80,
      }),
    );
    expect(glCanvas.height).toBe(80);

    // ...then a small instance must blit from the BOTTOM of the GL buffer
    // (image-space y = glCanvas.height - outH).
    const small = createStub2dCanvas();
    const smallInstance = compositor.register({ canvas: small.canvas });
    smallInstance.update(makeDrawInput()); // 32x20 viewport
    expect(small.drawImageCalls.length).toBe(1);
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = small.drawImageCalls[0];
    expect([sx, sy, sw, sh]).toEqual([0, 80 - 20, 32, 20]);
    expect([dx, dy, dw, dh]).toEqual([0, 0, 32, 20]);
    compositor.destroy();
  });

  it("survives context loss: update fails while lost, restore re-renders all instances", () => {
    const { gl, calls } = createStubGl();
    const glCanvas = createStubGlCanvas(gl);
    const compositor = createGlassCompositor({ canvas: glCanvas })!;
    const target = createStub2dCanvas();
    const instance = compositor.register({ canvas: target.canvas });
    instance.update(makeDrawInput());
    expect(target.drawImageCalls.length).toBe(1);

    glCanvas.dispatchEvent(new Event("webglcontextlost"));
    expect(instance.update(makeDrawInput())).toBe(false);
    expect(compositor.isAvailable()).toBe(true); // lost, not failed

    const drawsBeforeRestore = calls.filter((name) => name === "drawArrays").length;
    glCanvas.dispatchEvent(new Event("webglcontextrestored"));
    // The stored input was re-rendered and re-blitted automatically.
    expect(calls.filter((name) => name === "drawArrays").length).toBeGreaterThan(drawsBeforeRestore);
    expect(target.drawImageCalls.length).toBeGreaterThanOrEqual(2);
    compositor.destroy();
  });

  it("fails permanently after repeated losses and fans out onFallback", () => {
    const { gl } = createStubGl();
    const glCanvas = createStubGlCanvas(gl);
    const compositor = createGlassCompositor({ canvas: glCanvas })!;
    const onFallback = vi.fn();
    compositor.register({ canvas: createStub2dCanvas().canvas, onFallback });

    for (let i = 0; i < 3; i += 1) {
      glCanvas.dispatchEvent(new Event("webglcontextlost"));
      glCanvas.dispatchEvent(new Event("webglcontextrestored"));
    }

    expect(onFallback).toHaveBeenCalled();
    expect(compositor.isAvailable()).toBe(false);
    // New registrations on a failed compositor get the fallback immediately.
    const lateFallback = vi.fn();
    const late = compositor.register({ canvas: createStub2dCanvas().canvas, onFallback: lateFallback });
    expect(lateFallback).toHaveBeenCalledTimes(1);
    expect(late.update(makeDrawInput())).toBe(false);
    compositor.destroy();
  });

  it("destroy releases GL resources and is idempotent", () => {
    const { gl, calls } = createStubGl();
    const compositor = createGlassCompositor({ canvas: createStubGlCanvas(gl) })!;
    const instance = compositor.register({ canvas: createStub2dCanvas().canvas });
    instance.update(makeDrawInput());

    compositor.destroy();
    expect(calls.filter((name) => name === "deleteProgram").length).toBe(2);
    expect(calls.filter((name) => name === "loseContext").length).toBe(1);
    expect(compositor.isAvailable()).toBe(false);

    const total = calls.length;
    compositor.destroy();
    expect(calls.length).toBe(total);
    expect(instance.update(makeDrawInput())).toBe(false);
  });
});

describe("getSharedGlassCompositor", () => {
  it("resolves to null in environments without WebGL2 and stays sticky", () => {
    expect(getSharedGlassCompositor()).toBeNull();
    expect(getSharedGlassCompositor()).toBeNull();
  });

  it("returns one shared compositor when WebGL2 is available", () => {
    const { gl } = createStubGl();
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(function getContextMock(this: HTMLCanvasElement, type: string) {
        return type === "webgl2" ? (gl as never) : null;
      });

    const first = getSharedGlassCompositor();
    const second = getSharedGlassCompositor();
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    // Exactly one webgl2 context was requested for any number of consumers.
    const webgl2Requests = getContextSpy.mock.calls.filter(([type]) => type === "webgl2");
    expect(webgl2Requests.length).toBe(1);
  });
});
