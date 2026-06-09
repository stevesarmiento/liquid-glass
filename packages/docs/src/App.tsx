import { type ComponentType, useEffect, useMemo, useState } from "react";
import { GlassDesignSystemProvider } from "@liquid-glass/design-system";
import styled, { createGlobalStyle } from "styled-components";

import Topbar from "./components/Common/Topbar";
import rootNav from "./nav";
import GlassModalPage from "./pages/components/GlassModalPage";
import GlassSliderPage from "./pages/components/GlassSliderPage";
import GlassSwitchPage from "./pages/components/GlassSwitchPage";
import GuidesPage from "./pages/guides";
import IntroductionPage from "./pages";

const GlobalDocsStyle = createGlobalStyle`
  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    min-width: 320px;
    min-height: 100vh;
    color: #111111;
    background: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  }

  button,
  input {
    font: inherit;
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
    letter-spacing: 0;
  }

  h1 {
    font-size: 28px;
    line-height: 1.15;
    font-weight: 700;
  }

  h2 {
    margin-bottom: 12px;
    font-size: 18px;
    line-height: 1.25;
    font-weight: 650;
  }

  p {
    max-width: 680px;
    color: rgba(17, 17, 17, 0.68);
    font-size: 15px;
    line-height: 1.65;
  }
`;

const Shell = styled.div`
  min-height: 100vh;
  background: #ffffff;
`;

const Body = styled.div`
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  min-height: calc(100vh - 64px);
`;

const Sidebar = styled.aside`
  padding: 20px 14px 48px;
  border-right: 1px solid rgba(17, 17, 17, 0.1);
  overflow: auto;
`;

const NavGroup = styled.div`
  display: grid;
  gap: 7px;
  margin-bottom: 22px;
`;

const NavLabel = styled.div`
  padding: 0 10px 4px;
  color: rgba(17, 17, 17, 0.48);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

const NavLink = styled.a<{ $active?: boolean; $disabled?: boolean }>`
  display: block;
  min-height: 32px;
  padding: 8px 10px;
  color: ${({ $active, $disabled }) =>
    $disabled ? "rgba(17, 17, 17, 0.32)" : $active ? "#111111" : "rgba(17, 17, 17, 0.68)"};
  background: ${({ $active }) => ($active ? "rgba(17, 17, 17, 0.06)" : "transparent")};
  border-radius: 6px;
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? 650 : 500)};
  text-decoration: none;
  pointer-events: ${({ $disabled }) => ($disabled ? "none" : "auto")};

  &:hover {
    color: #111111;
    background: rgba(17, 17, 17, 0.05);
  }
`;

const Content = styled.main`
  width: min(860px, 100%);
  padding: 56px 56px 96px;
`;

const routes: Record<string, ComponentType> = {
  "/": IntroductionPage,
  "/guides": GuidesPage,
  "/components/glass-modal": GlassModalPage,
  "/components/glass-slider": GlassSliderPage,
  "/components/glass-switch": GlassSwitchPage,
};

export default function App() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));
  const Page = useMemo(() => routes[path] ?? IntroductionPage, [path]);

  useEffect(() => {
    const handlePopState = () => setPath(normalizePath(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigate(href: string) {
    const nextPath = normalizePath(href);
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
  }

  return (
    <GlassDesignSystemProvider>
      <GlobalDocsStyle />
      <Shell>
        <Topbar />
        <Body>
          <Sidebar>
            {rootNav.map((group) => (
              <NavGroup key={group.label}>
                <NavLabel>{group.label}</NavLabel>
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    $active={normalizePath(item.href) === path}
                    $disabled={"disabled" in item && item.disabled}
                    href={item.href}
                    onClick={(event) => {
                      event.preventDefault();
                      if (!("disabled" in item && item.disabled)) navigate(item.href);
                    }}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </NavGroup>
            ))}
          </Sidebar>
          <Content>
            <Page />
          </Content>
        </Body>
      </Shell>
    </GlassDesignSystemProvider>
  );
}

function normalizePath(path: string): string {
  if (!path || path === "/index.html") return "/";
  return path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
}
