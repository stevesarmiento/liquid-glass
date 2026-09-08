import { useRef, type ReactNode, type RefObject } from "react";
import { GlassButton, GLASS_BUTTON_SIZE_PRESETS, type GlassButtonBackdrop } from "@liquid-glass/design-system";
import styled from "styled-components";

import PreviewContainer from "../../components/PreviewContainer";
import PropsTable, { type PropRow } from "../../components/PropsTable";
import PresetTable from "../../components/PresetTable";

const BACKDROP_IMAGE = "/images/rinaldo-armida.jpg";

const PROP_ROWS: PropRow[] = [
  { name: "children", type: "ReactNode", description: "Button label content." },
  { name: "variant", type: '"glass" | "tinted" | "ghost"', defaultValue: '"glass"', description: "Glass tint of the material — the button has no CSS face of its own. glass = frosty white tint, tinted = theme-accent tint, ghost = fully clear (the backdrop refracts through untinted). An explicit glassTint prop overrides the variant tint." },
  { name: "size", type: '"sm" | "md" | "lg" | "xl"', defaultValue: '"md"', description: "Preset size for the button geometry and resting lens optics." },
  { name: "fullWidth", type: "boolean", defaultValue: "false", description: "Stretches the button to fill its container width." },
  { name: "loading", type: "boolean", defaultValue: "false", description: "Shows a spinner, sets aria-busy, and ignores activation while pending. Refraction is paused so the spinner stays readable." },
  { name: "disabled", type: "boolean", defaultValue: "false", description: "Disables the button. The glass surface stays but is dimmed, and refraction is turned off to save work." },
  { name: "type", type: '"button" | "submit" | "reset"', defaultValue: '"button"', description: "Native button type." },
  { name: "onClick", type: "MouseEventHandler<HTMLButtonElement>", description: "Native click handler. Ignored while loading." },
  { name: "active", type: "boolean", description: "Holds the pressed optics boost for demos or externally controlled interactions." },
  { name: "glassBackdrop", type: "{ image: string; anchor?: RefObject<HTMLElement | null> }", description: "Same-origin image painted into the refraction source with CSS background-size: cover semantics against the anchor element (default: the button's offsetParent), translated so the button refracts exactly the slice visually behind it. Forces the pixel renderer (WebGL, CPU canvas fallback) when renderer is auto." },
  { name: "glassLens", type: "Partial<LensParams>", description: "Glass lens tuning for the always-on face node. Pressing boosts scaleX/scaleY and glow on top of these resting optics." },
  { name: "glassTint", type: "GlassTintName | GlassTintInput | GlassTint", description: "Dynamic tint forwarded to the glass face node." },
  { name: "glassSurfaceBlur", type: "number | string", defaultValue: "0", description: "Frosted background blur in px for the glass face surface." },
  { name: "engineMode", type: "LiquidGlassEngineMode", defaultValue: '"auto"', description: "Engine mode forwarded to liquid-glass." },
  { name: "renderer", type: "GlassRendererMode", description: "Renderer mode forwarded to liquid-glass. Explicit values are honored even with glassBackdrop (note: the svg renderer cannot paint the backdrop image)." },
];

const Stack = styled.div`
  display: grid;
  gap: 30px;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
`;

const SizeItem = styled.div`
  display: grid;
  justify-items: center;
  gap: 8px;
`;

const SizeLabel = styled.span<{ $onImage?: boolean }>`
  color: ${({ $onImage }) => ($onImage ? "rgba(255, 255, 255, 0.92)" : "rgba(17, 17, 17, 0.54)")};
  font-size: 12px;
  font-weight: 650;
  ${({ $onImage }) => ($onImage ? "text-shadow: 0 1px 8px rgba(0, 0, 0, 0.55);" : "")}
`;

const FullWidthFrame = styled.div`
  width: min(420px, 100%);
`;

const CodeBlock = styled.pre`
  margin: 0;
  padding: 16px;
  overflow: auto;
  color: #111111;
  background: #f5f5f5;
  border: 1px solid rgba(17, 17, 17, 0.08);
  border-radius: 8px;
  font-size: 13px;
`;

const BackdropPanel = styled.div`
  position: relative;
  display: grid;
  place-items: center;
  min-height: 260px;
  padding: 40px;
  overflow: hidden;
  background-image: url(${BACKDROP_IMAGE});
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  border: 1px solid rgba(17, 17, 17, 0.1);
  border-radius: 8px;
`;

/**
 * Image preview panel: owns the anchor ref and hands children a ready-made
 * glassBackdrop wired to it, so each button refracts the exact slice of the
 * painting that is visually behind it.
 */
function BackdropPreview({
  children,
}: {
  children: (backdrop: GlassButtonBackdrop) => ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  return (
    <BackdropPanel ref={panelRef}>
      {children({ image: BACKDROP_IMAGE, anchor: panelRef as RefObject<HTMLElement | null> })}
    </BackdropPanel>
  );
}

export default function GlassButtonPage() {
  return (
    <Stack>
      <div>
        <h1>Glass Button</h1>
        <p>Native button whose face is always-on glass: the lens is the surface, not a press effect.</p>
        <p>
          The face renders single-lens glass through the library's GlassNode primitive whenever the
          button is mounted and enabled. Pressing (pointer or keyboard) briefly raises the lens
          optics — a slightly stronger refraction and glow held for a beat after release — instead
          of toggling the glass. The optics are customizable per instance via glassLens (lens
          optics) and glassTint (chrome tint), and glassBackdrop feeds the refraction a real image
          so the glass visibly bends what is behind the button.
        </p>
      </div>

      <BackdropPreview>
        {(backdrop) => (
          <GlassButton glassBackdrop={backdrop} size="md">
            Press me
          </GlassButton>
        )}
      </BackdropPreview>

      <div>
        <h2>Sizes</h2>
        <BackdropPreview>
          {(backdrop) => (
            <Row>
              {(["sm", "md", "lg", "xl"] as const).map((size) => (
                <SizeItem key={size}>
                  <SizeLabel $onImage>{size}</SizeLabel>
                  <GlassButton glassBackdrop={backdrop} size={size}>
                    Liquid
                  </GlassButton>
                </SizeItem>
              ))}
            </Row>
          )}
        </BackdropPreview>
      </div>

      <div>
        <h2>Variants</h2>
        <BackdropPreview>
          {(backdrop) => (
            <Row>
              <GlassButton glassBackdrop={backdrop} variant="glass">
                Glass
              </GlassButton>
              <GlassButton glassBackdrop={backdrop} variant="tinted">
                Tinted
              </GlassButton>
              <GlassButton glassBackdrop={backdrop} variant="ghost">
                Ghost
              </GlassButton>
            </Row>
          )}
        </BackdropPreview>
      </div>

      <div>
        <h2>States</h2>
        <PreviewContainer>
          <Row>
            <GlassButton disabled>Disabled</GlassButton>
            <GlassButton loading>Saving</GlassButton>
          </Row>
        </PreviewContainer>
      </div>

      <div>
        <h2>Full width</h2>
        <PreviewContainer>
          <FullWidthFrame>
            <GlassButton fullWidth>Continue</GlassButton>
          </FullWidthFrame>
        </PreviewContainer>
      </div>

      <div>
        <h2>Custom tint</h2>
        <PreviewContainer>
          <GlassButton
            glassTint={{ color: "#7c3aed", opacity: 0.14, borderOpacity: 0.4 }}
            variant="tinted"
          >
            Violet
          </GlassButton>
        </PreviewContainer>
      </div>

      <div>
        <h2>Usage</h2>
        <CodeBlock>{`import { useRef } from "react";
import { GlassButton } from "@liquid-glass/design-system";

const heroRef = useRef<HTMLDivElement>(null);

<div ref={heroRef} style={{ backgroundImage: "url(/images/hero.jpg)", backgroundSize: "cover" }}>
  <GlassButton
    size="md"
    variant="glass"
    glassBackdrop={{ image: "/images/hero.jpg", anchor: heroRef }}
    onClick={() => console.log("pressed")}
  >
    Press me
  </GlassButton>
</div>`}</CodeBlock>
      </div>

      <div>
        <h2>Props</h2>
        <PropsTable rows={PROP_ROWS} />
      </div>
      <div>
        <h2>Size presets</h2>
        <p>
          Generated from the shipped presets in sizes.ts. Tier optics derive from one ratio
          profile anchored at md, so every size renders the same material.
        </p>
        <PresetTable presets={GLASS_BUTTON_SIZE_PRESETS} />
      </div>
    </Stack>
  );
}
