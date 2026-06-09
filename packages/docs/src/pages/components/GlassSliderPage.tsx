import { useState } from "react";
import { GlassSlider } from "@liquid-glass/design-system";
import styled from "styled-components";

import PreviewContainer from "../../components/PreviewContainer";

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
    </Stack>
  );
}
