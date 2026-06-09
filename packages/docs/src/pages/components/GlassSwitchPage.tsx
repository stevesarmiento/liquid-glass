import { GlassSwitch } from "@liquid-glass/design-system";
import styled from "styled-components";

import PreviewContainer from "../../components/PreviewContainer";

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
    </Stack>
  );
}
