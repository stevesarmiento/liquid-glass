import styled from "styled-components";

const Stack = styled.div`
  display: grid;
  gap: 24px;
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

export default function GuidesPage() {
  return (
    <Stack>
      <div>
        <h1>Guides</h1>
        <p>Placeholder setup notes for the design-system package.</p>
      </div>
      <CodeBlock>{`bun install
bun run build
bun run docs`}</CodeBlock>
      <CodeBlock>{`import { GlassSlider } from "@liquid-glass/design-system";`}</CodeBlock>
    </Stack>
  );
}

