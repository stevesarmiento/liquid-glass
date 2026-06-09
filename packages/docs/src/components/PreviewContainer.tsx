import type { ReactNode } from "react";
import styled from "styled-components";

const Preview = styled.div`
  display: grid;
  place-items: center;
  min-height: 260px;
  padding: 40px;
  background: #ffffff;
  border: 1px solid rgba(17, 17, 17, 0.1);
  border-radius: 8px;
`;

export default function PreviewContainer({ children }: { children: ReactNode }) {
  return <Preview>{children}</Preview>;
}

