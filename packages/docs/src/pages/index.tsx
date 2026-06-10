import type { MouseEvent } from "react";
import styled from "styled-components";

const Stack = styled.div`
  display: grid;
  gap: 24px;
`;

const InlineLink = styled.a`
  color: #111111;
  font-weight: 650;
`;

function handleInternalLink(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  window.history.pushState({}, "", event.currentTarget.getAttribute("href") ?? "/");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function IntroductionPage() {
  return (
    <Stack>
      <div>
        <h1>Liquid Glass Design System</h1>
        <p>
          A component library for using liquid glass as a design aesthetic across product
          primitives.
        </p>
      </div>
      <p>
        Under the hood is the liquid-glass library: a deterministic lens engine written in Rust and
        compiled to WASM, with a TypeScript fallback that produces byte-identical displacement maps
        — switching engines never changes rendering. Refraction is drawn by one of three renderers
        (SVG filters over live DOM, a WebGL2 shader, or a CPU canvas over image scenes), with an
        auto mode that picks the right one per browser and scene.
      </p>
      <p>
        The library also supports multi-lens{" "}
        <InlineLink href="/library/liquid-blend" onClick={handleInternalLink}>
          liquid blend
        </InlineLink>{" "}
        rendering: two or more lenses merge into a single metaball blob via a smooth-union SDF, with
        the glass chrome (tint, border, highlights, shadow) drawn by the shader so it merges with
        the blob. See the Library section for the controller API, lens parameters, and React
        bindings.
      </p>
      <p>
        Three components are live — Glass Modal, Glass Slider, and Glass Switch — each rendering
        single-lens glass through the library's GlassNode primitive.
      </p>
    </Stack>
  );
}
