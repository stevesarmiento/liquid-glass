import styled from "styled-components";

const LogoMark = styled.div`
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 30px;
  color: #111111;

  svg {
    display: block;
    width: 100%;
    height: auto;
  }
`;

const LogoText = styled.div`
  display: grid;
  gap: 1px;
  color: #111111;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0;
  line-height: 1.1;

  span {
    color: rgba(17, 17, 17, 0.54);
    font-size: 11px;
    font-weight: 500;
  }
`;

const LogoContainer = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 10px;
`;

export default function Logo() {
  return (
    <LogoContainer>
      <LogoMark aria-hidden="true">
        <svg viewBox="0 0 883 679" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M583.331 222.5C627.212 222.5 657.6 260.11 657.6 303.992V399.973C657.6 452.933 614.591 495.865 561.537 495.865H420.619H363.115C332.397 495.865 314.894 530.965 333.377 555.5C323.17 552.015 306.021 545.064 290.92 522.879C263.907 483.193 305.894 437.662 353.901 437.662H561.537C582.389 437.662 599.293 420.788 599.293 399.973V311.236L598.591 276.498C598.054 249.901 578.901 227.343 552.744 222.5H583.331Z"
            fill="currentColor"
          />
          <path
            d="M822 406.5C822 289.692 727.308 195 610.5 195H426.5C309.692 195 215 289.692 215 406.5C215 523.308 309.692 618 426.5 618H610.5C727.308 618 822 523.308 822 406.5ZM883 406.5C883 556.998 760.998 679 610.5 679H426.5C276.002 679 154 556.998 154 406.5C154 256.002 276.002 134 426.5 134H610.5C760.998 134 883 256.002 883 406.5Z"
            fill="currentColor"
          />
          <path
            d="M568.5 0C624.005 0 669 44.9954 669 100.5V171.619C650.267 166.969 630.672 164.5 610.5 164.5H608V100.5C608 78.6847 590.315 61 568.5 61H100.5C78.6848 61 61 78.6847 61 100.5V400.5C61 422.315 78.6848 440 100.5 440H186.801C189.757 461.35 195.498 481.809 203.646 501H100.5C44.9954 501 0 456.005 0 400.5V100.5C8.2476e-06 44.9954 44.9954 0 100.5 0H568.5Z"
            fill="currentColor"
          />
        </svg>
      </LogoMark>
      <LogoText>
        Liquid Glass
        <span>Design System</span>
      </LogoText>
    </LogoContainer>
  );
}
