import { GlassSwitch } from "@liquid-glass/design-system";
import styled from "styled-components";

import PreviewContainer from "../../components/PreviewContainer";
import PropsTable, { type PropRow } from "../../components/PropsTable";

const PROP_ROWS: PropRow[] = [
  { name: "checked", type: "boolean", description: "Controlled checked state." },
  { name: "defaultChecked", type: "boolean", defaultValue: "false", description: "Initial checked state for uncontrolled switches." },
  { name: "onCheckedChange", type: "(checked: boolean) => void", description: "Boolean checked callback for controlled or uncontrolled usage." },
  { name: "onChange", type: "ChangeEventHandler<HTMLInputElement>", description: "Native change handler for the hidden checkbox input." },
  { name: "label", type: "ReactNode", description: "Text rendered beside the switch." },
  { name: "size", type: '"sm" | "md" | "lg" | "xl"', defaultValue: '"md"', description: "Preset size for the switch geometry. Manual sizing props override preset values." },
  { name: "fillColor", type: "string", defaultValue: "theme accent (#1a88f8)", description: "Color used for the switch fill when checked." },
  { name: "trackColor", type: "string", defaultValue: "theme track", description: "Color used for the unchecked switch track." },
  { name: "switchWidth", type: "number | string", defaultValue: "size preset", description: "Width of the switch control." },
  { name: "controlHeight", type: "number", defaultValue: "size preset", description: "Height of the switch interaction area." },
  { name: "trackHeight", type: "number", defaultValue: "size preset", description: "Height of the switch track." },
  { name: "active", type: "boolean", description: "Holds the active glass stage for demos or externally controlled interactions." },
  { name: "disabled", type: "boolean", defaultValue: "false", description: "Disables the switch." },
  { name: "glassLens", type: "Partial<LensParams>", description: "Glass lens tuning for the thumb node." },
  { name: "glassTint", type: "GlassTintName | GlassTintInput | GlassTint", description: "Dynamic tint forwarded to the glass thumb node." },
  { name: "glassSurfaceBlur", type: "number | string", defaultValue: "0", description: "Frosted background blur in px for the glass thumb surface." },
  { name: "engineMode", type: "LiquidGlassEngineMode", defaultValue: '"auto"', description: "Engine mode forwarded to liquid-glass." },
  { name: "renderer", type: "GlassRendererMode", description: "Renderer mode forwarded to liquid-glass." },
];

const Stack = styled.div`
  display: grid;
  gap: 30px;
`;

const SizeGrid = styled.div`
  display: flex;
  align-items: center;
  gap: 26px;
  flex-wrap: wrap;
`;

const SizeItem = styled.div`
  display: grid;
  justify-items: center;
  gap: 8px;
`;

const SizeLabel = styled.span`
  color: rgba(17, 17, 17, 0.54);
  font-size: 12px;
  font-weight: 650;
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

export default function GlassSwitchPage() {
  return (
    <Stack>
      <div>
        <h1>Glass Switch</h1>
        <p>Boolean control with a draggable glass thumb node powered by the liquid-glass primitives.</p>
        <p>
          The thumb currently renders single-lens glass through the library's GlassNode primitive;
          its glass is customizable per instance via the glassLens (lens optics) and glassTint
          (chrome tint) props.
        </p>
      </div>

      <PreviewContainer>
        <GlassSwitch defaultChecked size="md" />
      </PreviewContainer>

      <div>
        <h2>Sizes</h2>
        <PreviewContainer>
          <SizeGrid>
            {(["sm", "md", "lg", "xl"] as const).map((size) => (
              <SizeItem key={size}>
                <SizeLabel>{size}</SizeLabel>
                <GlassSwitch defaultChecked size={size} />
              </SizeItem>
            ))}
          </SizeGrid>
        </PreviewContainer>
      </div>

      <div>
        <h2>Color</h2>
        <PreviewContainer>
          <GlassSwitch
            defaultChecked
            fillColor="#7c3aed"
            size="md"
            trackColor="rgba(124, 58, 237, 0.18)"
          />
        </PreviewContainer>
      </div>

      <div>
        <h2>Usage</h2>
        <CodeBlock>{`import { GlassSwitch } from "@liquid-glass/design-system";

<GlassSwitch
  defaultChecked
  fillColor="#1a88f8"
  size="md"
/>`}</CodeBlock>
      </div>

      <div>
        <h2>Props</h2>
        <PropsTable rows={PROP_ROWS} />
      </div>
    </Stack>
  );
}
