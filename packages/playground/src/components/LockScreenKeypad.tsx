import { memo, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { GlassButton, type GlassPressHighlight } from "@liquid-glass/design-system";
import type {
  GlassTintInput,
  GlassTintName,
  LensParams,
  LiquidGlassEngineMode,
  LiquidGlassRenderer,
  ResolvedLensParams,
} from "liquid-glass";
import { IconLockFill, IconLockOpenFill } from "symbols-react";

import { KEYPAD_KEYS, PASSCODE } from "../playgroundConfig";

interface LockScreenKeypadProps {
  backgroundUrl: string;
  containerRef: RefObject<HTMLDivElement | null>;
  engineMode: LiquidGlassEngineMode;
  glassTint: GlassTintName | GlassTintInput;
  lens: ResolvedLensParams;
  pressHighlight: GlassPressHighlight;
  renderer: LiquidGlassRenderer;
}

type LockStatus = "idle" | "wrong" | "unlocked";

/** Matches `.lockKey` in playground.css; the lens radius keeps the glass circular. */
const KEY_SIZE = 75;
/** Holds the shake long enough for the animation to finish before clearing. */
const WRONG_RESET_MS = 700;
const UNLOCK_RESET_MS = 2200;

export const LockScreenKeypad = memo(function LockScreenKeypad({
  backgroundUrl,
  containerRef,
  engineMode,
  glassTint,
  lens,
  pressHighlight,
  renderer,
}: LockScreenKeypadProps) {
  const [entered, setEntered] = useState("");
  const [status, setStatus] = useState<LockStatus>("idle");
  const resetTimerRef = useRef<number | null>(null);

  // The keypad keys are the tuning target here: the floating-controls lens
  // drives their optics directly, with only the geometry (a fixed circle) and
  // small-control perf caps owned by the keypad.
  const keyLens = useMemo<Partial<LensParams>>(
    () => ({
      radius: KEY_SIZE / 2,
      scaleX: lens.scaleX,
      scaleY: lens.scaleY,
      chroma: lens.chroma,
      depth: Math.min(lens.depth, 16),
      dome: Math.min(lens.dome, 110),
      splay: lens.splay,
      glow: lens.glow,
      edge: lens.edge,
      glowSpread: lens.glowSpread,
      glowExponent: lens.glowExponent,
      edgeExponent: lens.edgeExponent,
      specularRotation: lens.specularRotation,
      blur: Math.min(lens.blur, 4),
      mapSize: Math.min(lens.mapSize, 384),
    }),
    [lens],
  );

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  function scheduleReset(nextStatus: LockStatus, delay: number) {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => {
      resetTimerRef.current = null;
      setEntered("");
      setStatus("idle");
    }, delay);
    setStatus(nextStatus);
  }

  function handleDigit(digit: string) {
    if (status !== "idle") return;
    const next = entered + digit;
    setEntered(next);
    if (next.length < PASSCODE.length) return;
    if (next === PASSCODE) {
      scheduleReset("unlocked", UNLOCK_RESET_MS);
    } else {
      scheduleReset("wrong", WRONG_RESET_MS);
    }
  }

  function handleDelete() {
    if (status !== "idle") return;
    setEntered((current) => current.slice(0, -1));
  }

  const unlocked = status === "unlocked";

  return (
    <div className={`lockScreen${unlocked ? " lockUnlocked" : ""}`}>
      <div className="lockHeader">
        {unlocked ? <IconLockOpenFill aria-hidden="true" /> : <IconLockFill aria-hidden="true" />}
        <span className="lockTitle">{unlocked ? "Unlocked" : "Enter Passcode"}</span>
        <span
          aria-label={unlocked ? "Passcode accepted" : `${entered.length} of ${PASSCODE.length} digits entered`}
          className={`lockDots${status === "wrong" ? " lockDotsWrong" : ""}`}
          role="status"
        >
          {Array.from({ length: PASSCODE.length }, (_, index) => (
            <span
              className={index < entered.length ? "lockDot lockDotFilled" : "lockDot"}
              key={index}
            />
          ))}
        </span>
      </div>
      <div className="lockKeypad">
        {KEYPAD_KEYS.map(({ digit, letters }) => (
          <GlassButton
            aria-label={letters ? `${digit} ${letters}` : digit}
            className={digit === "0" ? "lockKey lockKeyZero" : "lockKey"}
            disabled={unlocked}
            engineMode={engineMode}
            glassBackdrop={{ image: backgroundUrl, anchor: containerRef }}
            glassLens={keyLens}
            glassSurfaceBlur={0}
            glassTint={glassTint}
            key={digit}
            onClick={() => handleDigit(digit)}
            // The lock screen sits on the draggable lens surface; keep key
            // presses from grabbing the stage lens underneath.
            onPointerDown={(event) => event.stopPropagation()}
            onPointerMove={(event) => event.stopPropagation()}
            pressHighlight={pressHighlight}
            renderer={renderer}
            variant="ghost"
          >
            <span className="lockKeyContent">
              <span className="lockKeyDigit">{digit}</span>
              {letters && <span className="lockKeyLetters">{letters}</span>}
            </span>
          </GlassButton>
        ))}
      </div>
      <div className="lockFooter">
        <button
          className="lockTextButton"
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          Emergency
        </button>
        <button
          className="lockTextButton"
          onClick={handleDelete}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          {entered.length > 0 && !unlocked ? "Delete" : "Cancel"}
        </button>
      </div>
    </div>
  );
});
