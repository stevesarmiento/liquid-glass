import { useState } from "react";
import { GlassModal } from "@liquid-glass/design-system";
import styled from "styled-components";

import PreviewContainer from "../../components/PreviewContainer";

const PAINTING_URL = "/images/rinaldo-armida.jpg";

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
    </Stack>
  );
}
