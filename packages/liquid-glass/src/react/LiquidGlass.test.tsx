import { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  LensInstanceInput,
  LiquidGlassController,
  LiquidGlassControllerOptions,
} from "../web/controller";

import { LiquidGlass } from "./LiquidGlass";

// Wrap the real factory in a spy so most tests run the actual controller,
// while merged-mode tests can swap in a stub via mockImplementation.
const { createControllerMock, actualHolder } = vi.hoisted(() => ({
  createControllerMock: vi.fn<
    (options: LiquidGlassControllerOptions) => LiquidGlassController
  >(),
  actualHolder: {} as {
    create?: (options: LiquidGlassControllerOptions) => LiquidGlassController;
  },
}));

vi.mock("../web/controller", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../web/controller")>();
  actualHolder.create = actual.createLiquidGlassController;
  return { ...actual, createLiquidGlassController: createControllerMock };
});

function createControllerStub(): LiquidGlassController & {
  update: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
} {
  return {
    stats: {
      activeEngine: "ts",
      activeRenderer: "svg",
      applyCount: 0,
      domWrites: 0,
      lastMapMs: 0,
      lastApplyMs: 0,
    },
    update: vi.fn(),
    setPosition: vi.fn(),
    setLensPosition: vi.fn(),
    destroy: vi.fn(),
  };
}

function mountedRoot(): { host: HTMLDivElement; root: Root } {
  const host = document.createElement("div");
  document.body.append(host);
  return { host, root: createRoot(host) };
}

const TWO_LENSES: LensInstanceInput[] = [
  { position: { x: 0.35, y: 0.5 } },
  { position: { x: 0.65, y: 0.5 }, width: 80, height: 80, radius: 28 },
];

describe("LiquidGlass", () => {
  beforeEach(() => {
    createControllerMock.mockReset();
    createControllerMock.mockImplementation((options) => actualHolder.create!(options));
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal(
      "ImageData",
      class ImageDataMock {
        constructor(
          public data: Uint8ClampedArray,
          public width: number,
          public height: number,
        ) {}
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,test");
  });

  it("renders children and cleans up on unmount", () => {
    const { host, root } = mountedRoot();

    act(() => {
      root.render(
        <LiquidGlass engineMode="ts" lens={{ mapSize: 32 }}>
          <span>content</span>
        </LiquidGlass>,
      );
    });

    expect(host.textContent).toContain("content");
    expect(host.querySelectorAll("svg")).toHaveLength(1);

    act(() => root.unmount());
    expect(host.querySelectorAll("svg")).toHaveLength(0);
  });

  it("passes lenses, blend, tint, and sourceImageUrl to the controller on mount", () => {
    const stub = createControllerStub();
    createControllerMock.mockImplementation(() => stub);
    const { root } = mountedRoot();

    act(() => {
      root.render(
        <LiquidGlass
          engineMode="ts"
          lens={{ mapSize: 32, width: 120, height: 120 }}
          lenses={TWO_LENSES}
          blend={56}
          tint="aqua"
          sourceImageUrl="/scene.jpg"
        >
          <span>content</span>
        </LiquidGlass>,
      );
    });

    expect(createControllerMock).toHaveBeenCalledTimes(1);
    expect(createControllerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lenses: TWO_LENSES,
        blend: 56,
        tint: "aqua",
        sourceImageUrl: "/scene.jpg",
      }),
    );

    act(() => root.unmount());
    expect(stub.destroy).toHaveBeenCalledTimes(1);
  });

  it("propagates a changed blend (and lenses/tint) through update", () => {
    const stub = createControllerStub();
    createControllerMock.mockImplementation(() => stub);
    const { root } = mountedRoot();

    const render = (blend: number) =>
      act(() => {
        root.render(
          <LiquidGlass
            engineMode="ts"
            lenses={TWO_LENSES}
            blend={blend}
            tint="aqua"
            sourceImageUrl="/scene.jpg"
          >
            <span>content</span>
          </LiquidGlass>,
        );
      });

    render(40);
    stub.update.mockClear();

    render(64);
    expect(stub.update).toHaveBeenCalledTimes(1);
    expect(stub.update).toHaveBeenCalledWith(
      expect.objectContaining({ blend: 64, lenses: TWO_LENSES, tint: "aqua" }),
    );

    stub.update.mockClear();
    render(64);
    expect(stub.update).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("populates controllerRef (function and object) and nulls it on unmount", () => {
    const stub = createControllerStub();
    createControllerMock.mockImplementation(() => stub);

    // Function ref.
    const refFn = vi.fn();
    const first = mountedRoot();
    act(() => {
      first.root.render(
        <LiquidGlass engineMode="ts" controllerRef={refFn}>
          <span>content</span>
        </LiquidGlass>,
      );
    });
    expect(refFn).toHaveBeenCalledWith(stub);
    act(() => first.root.unmount());
    expect(refFn).toHaveBeenLastCalledWith(null);

    // Object ref.
    const refObject = createRef<LiquidGlassController | null>();
    const second = mountedRoot();
    act(() => {
      second.root.render(
        <LiquidGlass engineMode="ts" controllerRef={refObject}>
          <span>content</span>
        </LiquidGlass>,
      );
    });
    expect(refObject.current).toBe(stub);
    act(() => second.root.unmount());
    expect(refObject.current).toBeNull();
  });
});
