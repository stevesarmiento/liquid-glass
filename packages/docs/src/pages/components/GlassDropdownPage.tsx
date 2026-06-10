import { useRef, useState, type ReactNode, type RefObject } from "react";
import {
  GlassDropdown,
  type GlassDropdownBackdrop,
  type GlassDropdownItem,
} from "@liquid-glass/design-system";
import styled from "styled-components";

import PreviewContainer from "../../components/PreviewContainer";
import PropsTable, { type PropRow } from "../../components/PropsTable";

const BACKDROP_IMAGE = "/images/rinaldo-armida.jpg";

const SAMPLE_ITEMS: GlassDropdownItem[] = [
  { id: "profile", label: "View profile" },
  { id: "settings", label: "Settings" },
  { id: "share", label: "Share…" },
  { id: "archive", label: "Archive", disabled: true },
  { id: "logout", label: "Log out" },
];

const PROP_ROWS: PropRow[] = [
  { name: "items", type: "GlassDropdownItem[]", description: "Menu entries: { id, label, icon?, disabled?, onSelect? }. Disabled items are rendered with aria-disabled and skipped by keyboard navigation." },
  { name: "icon", type: "ReactNode", description: "Trigger content. Defaults to an inline three-dots glyph drawn with currentColor." },
  { name: "label", type: "string", defaultValue: '"Open menu"', description: "Accessible name for the icon-only trigger (aria-label). Always set this to something meaningful." },
  { name: "open", type: "boolean", description: "Controlled open state. When set, the component only emits onOpenChange intents and follows the prop." },
  { name: "defaultOpen", type: "boolean", defaultValue: "false", description: "Initial open state when uncontrolled." },
  { name: "onOpenChange", type: "(open: boolean) => void", description: "Fired on every open/close intent (trigger click, Escape, Tab, outside click, item selection) — also in controlled mode." },
  { name: "onSelect", type: "(item: GlassDropdownItem) => void", description: "Fired when an enabled item is selected, after the item's own onSelect. Selection closes the menu and restores focus to the trigger." },
  { name: "triggerSize", type: "number", defaultValue: "48", description: "Trigger circle diameter in px (the constant lens L0 of the merged blob)." },
  { name: "menuWidth", type: "number", defaultValue: "224", description: "Open menu width in px. Menu height is measured from the items." },
  { name: "placement", type: '"bottom-start" | "bottom" | "bottom-end"', defaultValue: '"bottom-start"', description: "Horizontal alignment of the menu against the trigger; the menu always opens below." },
  { name: "gap", type: "number", defaultValue: "10", description: "Trigger → menu gap in px. The settled goo bridges this gap with a liquid meniscus." },
  { name: "blend", type: "number", defaultValue: "36", description: "Smooth-union (goo) blend distance in px. Larger = thicker liquid neck during the morph." },
  { name: "glassBackdrop", type: "{ image: string; anchor?: RefObject<HTMLElement | null> }", description: "REQUIRED for the goo: the merged WebGL renderer refracts a pixel scene, sliced from this image with CSS cover semantics against the anchor element (default: the dropdown's offsetParent). Same contract as GlassButton." },
  { name: "glassTint", type: "GlassTintName | GlassTintInput | GlassTint", defaultValue: '"frost"', description: "Glass chrome tint. The shader derives the fill, 1.5px border band, rim highlight, interior glow, saturation, and drop shadow from it (mirroring the controller's merged chrome mapping)." },
  { name: "glassLens", type: "Partial<LensParams>", description: "Optics overrides for the shared merged-lens params (depth 14, dome 40, scale 14/12, glow 0.5, edge 0.6, blur 1.2, mapSize 192 by default)." },
  { name: "engineMode", type: "LiquidGlassEngineMode", defaultValue: '"auto"', description: "Displacement-map engine forwarded to liquid-glass (auto / wasm / ts)." },
];

const Stack = styled.div`
  display: grid;
  gap: 30px;
`;

const Row = styled.div`
  display: flex;
  gap: 56px;
  align-items: flex-start;
  flex-wrap: wrap;
`;

const PlacementItem = styled.div`
  display: grid;
  justify-items: center;
  gap: 8px;
`;

const PlacementLabel = styled.span`
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  font-weight: 650;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.55);
`;

const ControlledRow = styled.div`
  display: flex;
  gap: 18px;
  align-items: flex-start;
`;

const ControlledButton = styled.button`
  min-height: 34px;
  padding: 0 14px;
  color: #ffffff;
  background: #1a88f8;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
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

const BackdropPanel = styled.div<{ $tall?: boolean }>`
  position: relative;
  display: grid;
  align-items: start;
  justify-items: center;
  min-height: ${({ $tall }) => ($tall ? "420px" : "360px")};
  padding: 48px 40px;
  overflow: hidden;
  background-image: url(${BACKDROP_IMAGE});
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  border: 1px solid rgba(17, 17, 17, 0.1);
  border-radius: 8px;
`;

/**
 * Image preview panel: owns the anchor ref and hands children a ready-made
 * glassBackdrop wired to it, so the goo refracts the exact slice of the
 * painting behind the whole dropdown region (trigger + menu + margin).
 */
function BackdropPreview({
  children,
  tall,
}: {
  children: (backdrop: GlassDropdownBackdrop) => ReactNode;
  tall?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  return (
    <BackdropPanel $tall={tall} ref={panelRef}>
      {children({ image: BACKDROP_IMAGE, anchor: panelRef as RefObject<HTMLElement | null> })}
    </BackdropPanel>
  );
}

function ControlledExample() {
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <Stack>
      <ControlledRow>
        <ControlledButton onClick={() => setOpen((current) => !current)} type="button">
          {open ? "Close from outside" : "Open from outside"}
        </ControlledButton>
      </ControlledRow>
      <BackdropPanel ref={panelRef}>
        <GlassDropdown
          glassBackdrop={{ image: BACKDROP_IMAGE, anchor: panelRef as RefObject<HTMLElement | null> }}
          items={SAMPLE_ITEMS}
          label="Controlled menu"
          onOpenChange={setOpen}
          open={open}
        />
      </BackdropPanel>
    </Stack>
  );
}

export default function GlassDropdownPage() {
  return (
    <Stack>
      <div>
        <h1>Glass Dropdown</h1>
        <p>
          Icon trigger whose glass menu morphs out of it like liquid — the first component built on
          the merged-lens (metaball) system.
        </p>
        <p>
          One WebGL canvas spans the whole dropdown region and renders two lenses through a shared
          merged displacement map: the trigger circle (constant) and the menu lens, animated by a
          spring. While opening, the menu lens pulls out of the circle and the smooth-union blend
          forms a gooey neck between them; settled open, the two read as one connected blob bridged
          across the gap. Closing reabsorbs the menu back into the trigger. Menu items are real DOM
          on top of the glass — they stagger in once the goo has mostly poured and are never
          refracted.
        </p>
        <p>
          The goo needs <code>glassBackdrop</code> (the merged renderer refracts a pixel scene) and
          WebGL2. Without either, the dropdown falls back to a plain CSS-animated translucent panel
          that scale+fades from the trigger — same markup, same keyboard behavior, no liquid.
        </p>
      </div>

      <BackdropPreview tall>
        {(backdrop) => (
          <GlassDropdown defaultOpen glassBackdrop={backdrop} items={SAMPLE_ITEMS} label="Demo menu" />
        )}
      </BackdropPreview>

      <div>
        <h2>Placements</h2>
        <BackdropPreview tall>
          {(backdrop) => (
            <Row>
              {(["bottom-start", "bottom", "bottom-end"] as const).map((placement) => (
                <PlacementItem key={placement}>
                  <PlacementLabel>{placement}</PlacementLabel>
                  <GlassDropdown
                    glassBackdrop={backdrop}
                    items={SAMPLE_ITEMS.slice(0, 3)}
                    label={`Open ${placement} menu`}
                    menuWidth={180}
                    placement={placement}
                  />
                </PlacementItem>
              ))}
            </Row>
          )}
        </BackdropPreview>
      </div>

      <div>
        <h2>Controlled</h2>
        <ControlledExample />
      </div>

      <div>
        <h2>Fallback (no backdrop)</h2>
        <p>
          Without <code>glassBackdrop</code> there is no pixel scene to refract, so the menu uses
          the CSS fallback: a translucent tinted panel with backdrop blur, scale+fading from the
          trigger. The same fallback engages automatically when WebGL2 is unavailable or its
          context is lost.
        </p>
        <PreviewContainer>
          <div style={{ minHeight: 300, display: "grid", justifyItems: "center", alignItems: "start" }}>
            <GlassDropdown glassTint="smoke" items={SAMPLE_ITEMS} label="Fallback menu" />
          </div>
        </PreviewContainer>
      </div>

      <div>
        <h2>Usage</h2>
        <CodeBlock>{`import { useRef } from "react";
import { GlassDropdown } from "@liquid-glass/design-system";

const heroRef = useRef<HTMLDivElement>(null);

<div ref={heroRef} style={{ backgroundImage: "url(/images/hero.jpg)", backgroundSize: "cover" }}>
  <GlassDropdown
    label="Open actions"
    glassBackdrop={{ image: "/images/hero.jpg", anchor: heroRef }}
    items={[
      { id: "edit", label: "Edit", onSelect: () => console.log("edit") },
      { id: "share", label: "Share…" },
      { id: "delete", label: "Delete", disabled: true },
    ]}
    onSelect={(item) => console.log("selected", item.id)}
  />
</div>`}</CodeBlock>
      </div>

      <div>
        <h2>Keyboard</h2>
        <p>
          Trigger: Enter / Space / ArrowDown open the menu and focus the first item; ArrowUp opens
          and focuses the last. Menu: ArrowDown / ArrowUp cycle (disabled items skipped), Home /
          End jump, Escape closes and restores focus to the trigger, Tab closes without trapping
          focus. Clicking outside closes. With <code>prefers-reduced-motion</code> the morph and
          item stagger are skipped entirely.
        </p>
      </div>

      <div>
        <h2>Props</h2>
        <PropsTable rows={PROP_ROWS} />
      </div>
    </Stack>
  );
}
