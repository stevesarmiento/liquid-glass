import { useState } from "react";
import { GlassModal } from "@liquid-glass/design-system";
import styled from "styled-components";

import PreviewContainer from "../../components/PreviewContainer";
import PropsTable, { type PropRow } from "../../components/PropsTable";

const PAINTING_URL = "/images/rinaldo-armida.jpg";

const PROP_ROWS: PropRow[] = [
  { name: "isVisible", type: "boolean", description: "Controls modal visibility. Required." },
  { name: "onClose", type: "() => void", description: "Called when the modal requests to close (escape, backdrop, close button)." },
  { name: "dismissible", type: "boolean", defaultValue: "true", description: "Set to false to prevent backdrop, escape, and close-button dismissal." },
  { name: "header", type: "ReactNode", description: "Header content rendered above the modal body. Strings render as modal titles." },
  { name: "children", type: "ReactNode", description: "Modal body content." },
  { name: "footer", type: "ReactNode", description: "Footer content rendered below the modal body." },
  { name: "closeLabel", type: "string", defaultValue: '"Close modal"', description: "Accessible label for the close button and dismissible backdrop." },
  { name: "initialFocusRef", type: "RefObject<HTMLElement | null>", defaultValue: "dialog surface", description: "Ref focused when the modal opens." },
  { name: "width", type: "number | string", defaultValue: "380", description: "Modal width." },
  { name: "maxWidth", type: "number | string", defaultValue: '"calc(100vw - 32px)"', description: "Maximum modal width." },
  { name: "stackedOffset", type: "boolean | number", description: "Scales the modal back visually for stacked modal states." },
  { name: "portalId", type: "string", description: "Custom portal root id." },
  { name: "glassLens", type: "Partial<LensParams>", description: "Glass lens tuning for the modal surface. Width, height, and radius are size-derived unless provided." },
  { name: "glassSettings", type: "Partial<GlassModalGlassSettings>", description: "Grouped modal glass tuning. Direct glass props override this when both are provided." },
  { name: "glassSource", type: "ReactNode", description: "Viewport-sized source content refracted by the modal glass node. Overrides the default app DOM snapshot source." },
  { name: "glassSourceSelector", type: "string", description: "Selector for the app DOM node cloned as the default modal glass source." },
  { name: "glassDrawSource", type: "GlassCanvasSource", description: "Canvas source used by Safari/forced canvas rendering." },
  { name: "glassTint", type: "GlassTintName | GlassTintInput | GlassTint", defaultValue: '"clear"', description: "Dynamic tint forwarded to the glass modal node." },
  { name: "glassSurfaceBlur", type: "number | string", defaultValue: "0", description: "Frosted background blur in px for the glass modal surface." },
  { name: "glassSurfaceTone", type: "GlassTone", defaultValue: '"clear"', description: "Base glass surface tone forwarded to the modal node." },
  { name: "engineMode", type: "LiquidGlassEngineMode", defaultValue: '"auto"', description: "Engine mode forwarded to liquid-glass." },
  { name: "renderer", type: "GlassRendererMode", description: "Renderer mode forwarded to liquid-glass." },
  { name: "style", type: "CSSProperties", description: "Style applied to the modal surface." },
  { name: "className", type: "string", description: "Additional class name for the portal-rendered modal root." },
];

const Stack = styled.div`
  display: grid;
  gap: 30px;
`;

const ModalPreviewContainer = styled(PreviewContainer)`
  background-image:
    linear-gradient(rgba(15, 23, 42, 0.1), rgba(15, 23, 42, 0.1)),
    url(${PAINTING_URL});
  background-position: center;
  background-size: cover;
`;

const PreviewScene = styled.div`
  display: grid;
  place-items: center;
`;

const ButtonRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
`;

const Button = styled.button<{ $primary?: boolean }>`
  min-height: 36px;
  padding: 0 14px;
  color: ${({ $primary }) => ($primary ? "#ffffff" : "#111827")};
  background: ${({ $primary }) => ($primary ? "#1a88f8" : "rgba(255, 255, 255, 0.74)")};
  border: 1px solid ${({ $primary }) => ($primary ? "transparent" : "rgba(15, 23, 42, 0.12)")};
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 650;
`;

const ModalBody = styled.div`
  display: grid;
  gap: 12px;
  width: 100%;
  max-width: 320px;

  p {
    margin: 0;
  }
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

export default function GlassModalPage() {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <Stack>
      <div>
        <h1>Glass Modal</h1>
        <p>Portal-rendered dialog with a glass surface, backdrop dismissal, escape handling, and body scroll lock.</p>
        <p>
          The panel currently renders single-lens glass through the library's GlassNode primitive;
          its glass is customizable per instance via the glassLens (lens optics) and glassTint
          (chrome tint) props.
        </p>
      </div>

      <ModalPreviewContainer>
        <PreviewScene>
          <Button $primary onClick={() => setIsVisible(true)} type="button">
            Open modal
          </Button>
        </PreviewScene>
      </ModalPreviewContainer>

      <GlassModal
        footer={
          <ButtonRow>
            <Button onClick={() => setIsVisible(false)} type="button">
              Cancel
            </Button>
            <Button $primary onClick={() => setIsVisible(false)} type="button">
              Confirm
            </Button>
          </ButtonRow>
        }
        header="Glass modal"
        isVisible={isVisible}
        onClose={() => setIsVisible(false)}
        width={380}
      >
        <ModalBody>
          <p>The modal surface is rendered by the liquid-glass node. Tint is passed through the glass engine.</p>
          <p>The modal samples a viewport-sized source at the panel position, so depth and splay have visible pixels to bend.</p>
        </ModalBody>
      </GlassModal>

      <div>
        <h2>Usage</h2>
        <CodeBlock>{`import { GlassModal } from "@liquid-glass/design-system";

<GlassModal
  header="Glass modal"
  isVisible={isVisible}
  onClose={() => setIsVisible(false)}
  width={380}
>
  Modal content
</GlassModal>`}</CodeBlock>
      </div>

      <div>
        <h2>Props</h2>
        <PropsTable rows={PROP_ROWS} />
      </div>
    </Stack>
  );
}
