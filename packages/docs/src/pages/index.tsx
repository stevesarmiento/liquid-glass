import styled from "styled-components";

const Stack = styled.div`
  display: grid;
  gap: 24px;
`;

export default function IntroductionPage() {
  return (
    <Stack>
      <div>
        <h1>Liquid Glass Design System</h1>
        <p>
          A component library for using liquid glass as a design aesthetic across product
          primitives.
        </p>
      </div>
      <p>
        This docs site follows the Hillside reference structure. Three components are live —
        Glass Modal, Glass Slider, and Glass Switch — while the remaining getting-started
        pages are placeholders as the system shape settles.
      </p>
    </Stack>
  );
}

