import { useMemo } from "react";
import { GlassModal } from "@liquid-glass/design-system";
import type { GlassTintInput, GlassTintName, LensParams, LiquidGlassEngineMode, LiquidGlassRenderer, ResolvedLensParams } from "liquid-glass";

interface GlassPreviewModalProps {
  engineMode: LiquidGlassEngineMode;
  glassTint: GlassTintName | GlassTintInput;
  isVisible: boolean;
  lens: ResolvedLensParams;
  onClose: () => void;
  renderer: LiquidGlassRenderer;
}

export function GlassPreviewModal({
  engineMode,
  glassTint,
  isVisible,
  lens,
  onClose,
  renderer,
}: GlassPreviewModalProps) {
  const modalLens = useMemo<Partial<Omit<LensParams, "width" | "height">>>(
    () => ({
      radius: lens.radius,
      scaleX: lens.scaleX,
      scaleY: lens.scaleY,
      chroma: lens.chroma,
      depth: lens.depth,
      dome: lens.dome,
      splay: lens.splay,
      glow: lens.glow,
      edge: lens.edge,
      glowSpread: lens.glowSpread,
      glowExponent: lens.glowExponent,
      edgeExponent: lens.edgeExponent,
      specularRotation: lens.specularRotation,
      blur: lens.blur,
      mapSize: lens.mapSize,
    }),
    [lens],
  );

  return (
    <GlassModal
      footer={
        <button className="modalConfirmButton" onClick={onClose} type="button">
          Done
        </button>
      }
      glassSettings={{
        lens: modalLens,
        surfaceBlur: 0,
        tint: glassTint,
      }}
      header="Glass modal"
      isVisible={isVisible}
      onClose={onClose}
      renderer={renderer}
      engineMode={engineMode}
      width={380}
    >
      <div className="modalPreviewBody">
        <p>Use the playground controls to tune this modal glass.</p>
        <p>Tint, lens, optics, and light settings are forwarded into the modal.</p>
      </div>
    </GlassModal>
  );
}
