import { useState } from "react";
import { GlassSlider } from "@liquid-glass/design-system";
import styled from "styled-components";

import PreviewContainer from "../../components/PreviewContainer";

const Stack = styled.div`
  display: grid;
  gap: 30px;
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
          sliderWidth={360}
          value={value}
        />
      </PreviewContainer>

      <div>
        <h2>Usage</h2>
        <CodeBlock>{`import { GlassSlider } from "@liquid-glass/design-system";

<GlassSlider
  label="Exposure"
  showValue
  value={value}
  onValueChange={setValue}
/>`}</CodeBlock>
      </div>
    </Stack>
  );
}

