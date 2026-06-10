import { useState } from "react";
import { GlassSlider } from "@liquid-glass/design-system";
import styled from "styled-components";

import PreviewContainer from "../../components/PreviewContainer";
import PropsTable, { type PropRow } from "../../components/PropsTable";

const PROP_ROWS: PropRow[] = [
  { name: "value", type: "number", description: "Controlled slider value." },
  { name: "defaultValue", type: "number", defaultValue: "min", description: "Initial value for uncontrolled sliders." },
  { name: "min", type: "number", defaultValue: "0", description: "Minimum slider value." },
  { name: "max", type: "number", defaultValue: "100", description: "Maximum slider value." },
  { name: "step", type: 'number | "any"', defaultValue: "1", description: "Step between values." },
  { name: "onValueChange", type: "(value: number) => void", description: "Numeric value callback for controlled or uncontrolled usage." },
  { name: "onChange", type: "ChangeEventHandler<HTMLInputElement>", description: "Native change handler for the underlying range input." },
  { name: "label", type: "ReactNode", description: "Label rendered above the slider." },
  { name: "showValue", type: "boolean", defaultValue: "false", description: "Displays the current value beside the label." },
  { name: "valueFormatter", type: "(value: number) => ReactNode", description: "Formats the displayed value when showValue is enabled; string results also feed aria-valuetext." },
  { name: "size", type: '"sm" | "md" | "lg" | "xl"', defaultValue: '"md"', description: "Preset size for the slider geometry. Manual sizing props override preset values." },
  { name: "fillColor", type: "string", defaultValue: "theme accent (#1a88f8)", description: "Color used for the filled portion of the slider track." },
  { name: "trackColor", type: "string", defaultValue: "theme track", description: "Color used for the unfilled slider track." },
  { name: "sliderWidth", type: "number | string", defaultValue: "size preset", description: "Width of the full slider control." },
  { name: "controlHeight", type: "number", defaultValue: "size preset", description: "Height of the slider interaction area." },
  { name: "trackHeight", type: "number", defaultValue: "size preset", description: "Height of the slider track." },
  { name: "disabled", type: "boolean", defaultValue: "false", description: "Disables the slider." },
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
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 28px;
  align-items: center;
`;

const SizeItem = styled.div`
  display: grid;
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

export default function GlassSliderPage() {
  const [value, setValue] = useState(58);

  return (
    <Stack>
      <div>
        <h1>Glass Slider</h1>
        <p>Range input with a glass thumb node powered by the liquid-glass primitives.</p>
      </div>

      <PreviewContainer>
        <GlassSlider
          label="Exposure"
          onValueChange={setValue}
          showValue
          value={value}
        />
      </PreviewContainer>

      <div>
        <h2>Sizes</h2>
        <PreviewContainer>
          <SizeGrid>
            {(["sm", "md", "lg", "xl"] as const).map((size) => (
              <SizeItem key={size}>
                <SizeLabel>{size}</SizeLabel>
                <GlassSlider defaultValue={58} size={size} />
              </SizeItem>
            ))}
          </SizeGrid>
        </PreviewContainer>
      </div>

      <div>
        <h2>Color</h2>
        <PreviewContainer>
          <GlassSlider
            defaultValue={58}
            fillColor="#7c3aed"
            trackColor="rgba(124, 58, 237, 0.18)"
          />
        </PreviewContainer>
      </div>

      <div>
        <h2>Usage</h2>
        <CodeBlock>{`import { GlassSlider } from "@liquid-glass/design-system";

<GlassSlider
  label="Exposure"
  size="md"
  fillColor="#1a88f8"
  showValue
  value={value}
  onValueChange={setValue}
/>`}</CodeBlock>
      </div>

      <div>
        <h2>Props</h2>
        <PropsTable rows={PROP_ROWS} />
      </div>
    </Stack>
  );
}
