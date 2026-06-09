import { createRoot } from "react-dom/client";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LiquidGlass } from "./LiquidGlass";

describe("LiquidGlass", () => {
  beforeEach(() => {
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
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

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
});
