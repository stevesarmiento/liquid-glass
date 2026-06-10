import {
  type CSSProperties,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
import { type GlassCanvasSource, type LensParams } from "liquid-glass";
import { GlassNode } from "liquid-glass/react";

import {
  Backdrop,
  Body,
  CloseButton,
  ContentContainer,
  DocumentGlassSourceHost,
  Footer,
  GlassLayer,
  Header,
  ModalRoot,
  Surface,
  SurfaceWrap,
  Title,
  glassContentClassName,
  glassNodeClassName,
  glassSurfaceClassName,
  modalGlobalCss
} from "./styles";
import type { GlassModalGlassSettings, GlassModalProps } from "./types";
import { getCanvasBackgroundColor, isTransparentCssColor } from "../../../lib/canvas";
import { useGlobalCssOnce } from "../../../lib/globalCss";
import useGlassTheme from "../../../hooks/useGlassTheme";

const EXIT_DURATION_MS = 220;
const DEFAULT_PORTAL_ID = "__LGDS_GLASS_MODAL_PORTAL__";
const DEFAULT_VIEWPORT_SIZE = { height: 1, width: 1 };
export const DEFAULT_MODAL_GLASS_SETTINGS: GlassModalGlassSettings = {
  lens: {
    radius: 22,
    scaleX: 40,
    scaleY: 40,
    chroma: 1.20,
    depth: 20,
    dome: 100,
    splay: 0.72,
    glow: 1.15,
    edge: 0.90,
    blur: 12,
    mapSize: 512
  },
  tint: "clear",
  surfaceBlur: 0,
  surfaceTone: "clear"
};

function getPortalElement(portalId: string): HTMLElement | null {
  if (typeof document === "undefined") return null;

  const selector = `#${portalId.replace(/^#/, "")}`;
  const existing = document.querySelector<HTMLElement>(selector);
  if (existing) return existing;

  const portal = document.createElement("div");
  portal.id = portalId.replace(/^#/, "");
  document.body.appendChild(portal);

  return portal;
}

function useLockedBodyScroll(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof document === "undefined") return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [locked]);
}

const CloseIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20">
    <path d="M5 5l10 10M15 5L5 15" />
  </svg>
);

const TABBABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]'
].join(", ");

function getTabbableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)).filter(
    (element) =>
      element.tabIndex !== -1 &&
      !element.closest('[aria-hidden="true"]') &&
      (element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0)
  );
}

const GlassModal = ({
  children,
  className,
  closeLabel = "Close modal",
  dismissible = true,
  engineMode = "auto",
  footer,
  glassDrawSource,
  glassLens,
  glassSettings,
  glassSource,
  glassSourceSelector,
  glassSurfaceBlur,
  glassSurfaceTone,
  glassTint,
  header,
  initialFocusRef,
  isVisible,
  maxWidth = "calc(100vw - 32px)",
  onClose,
  portalId = DEFAULT_PORTAL_ID,
  renderer,
  stackedOffset,
  style,
  width = 380
}: GlassModalProps) => {
  useGlobalCssOnce("lgds-modal", modalGlobalCss);
  const theme = useGlassTheme();
  const titleId = useId();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const surfaceWrapRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(isVisible);
  const [scale, setScale] = useState(1);
  const [surfaceRect, setSurfaceRect] = useState({ height: 0, left: 0, top: 0, width: 0 });
  const [viewportSize, setViewportSize] = useState(DEFAULT_VIEWPORT_SIZE);
  const [canvasSourceVersion, setCanvasSourceVersion] = useState(0);
  const canDismiss = dismissible && onClose;

  useLockedBodyScroll(visible);

  useEffect(() => {
    setPortalElement(getPortalElement(portalId));
  }, [portalId]);

  const restorePreviousFocus = useCallback(() => {
    const target = previousFocusRef.current;
    previousFocusRef.current = null;
    if (target && document.contains(target)) {
      target.focus({ preventScroll: true });
    }
  }, []);

  useEffect(() => {
    if (isVisible) {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setVisible(true);
      window.setTimeout(() => {
        const focusTarget = initialFocusRef?.current ?? surfaceRef.current;
        focusTarget?.focus({ preventScroll: true });
      }, 0);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setVisible(false);
      restorePreviousFocus();
    }, EXIT_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [initialFocusRef, isVisible, restorePreviousFocus]);

  useEffect(() => () => restorePreviousFocus(), [restorePreviousFocus]);

  useEffect(() => {
    if (!visible || !surfaceWrapRef.current) return undefined;

    const surfaceWrap = surfaceWrapRef.current;
    const updateSize = () => {
      const rect = surfaceWrap.getBoundingClientRect();
      setSurfaceRect({ height: rect.height, left: rect.left, top: rect.top, width: rect.width });
      setViewportSize({
        height: window.innerHeight || rect.height || DEFAULT_VIEWPORT_SIZE.height,
        width: window.innerWidth || rect.width || DEFAULT_VIEWPORT_SIZE.width,
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(surfaceWrap);
    window.addEventListener("resize", updateSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [visible]);

  const dismiss = useCallback(() => {
    if (dismissible) {
      onClose?.();
    } else {
      setScale(0.98);
      window.setTimeout(() => setScale(1), 80);
    }
  }, [dismissible, onClose]);

  const trapTabKey = useCallback((event: Pick<globalThis.KeyboardEvent, "preventDefault" | "shiftKey">) => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const tabbable = getTabbableElements(surface);
    if (tabbable.length === 0) {
      event.preventDefault();
      surface.focus({ preventScroll: true });
      return;
    }

    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const activeIndex = activeElement ? tabbable.indexOf(activeElement) : -1;

    if (event.shiftKey) {
      if (activeIndex <= 0) {
        event.preventDefault();
        tabbable[tabbable.length - 1].focus({ preventScroll: true });
      }
    } else if (activeIndex === -1 || activeIndex === tabbable.length - 1) {
      event.preventDefault();
      tabbable[0].focus({ preventScroll: true });
    }
  }, []);

  useEffect(() => {
    if (!isVisible) return undefined;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        dismiss();
      } else if (event.key === "Tab") {
        trapTabKey(event);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dismiss, isVisible, trapTabKey]);

  const handleSurfaceKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") return;
    if (event.key === "Tab") trapTabKey(event);
    event.stopPropagation();
  };

  const modalLens = useMemo(
    () => ({
      ...DEFAULT_MODAL_GLASS_SETTINGS.lens,
      ...glassSettings?.lens,
      width: Math.max(1, surfaceRect.width),
      height: Math.max(1, surfaceRect.height),
      ...glassLens
    }),
    [glassLens, glassSettings?.lens, surfaceRect.height, surfaceRect.width]
  );
  const drawSource = useMemo<GlassCanvasSource>(
    () =>
      glassDrawSource ??
      createDocumentCanvasSource({
        onImageLoad: () => setCanvasSourceVersion((version) => version + 1),
        portalId,
        selector: glassSourceSelector
      }),
    [canvasSourceVersion, glassDrawSource, glassSourceSelector, portalId]
  );

  if (!portalElement || !visible) return null;

  const hasHeader = header !== undefined && header !== null;
  const labelledBy = typeof header === "string" ? titleId : undefined;
  const resolvedWidth = typeof width === "number" ? `${width}px` : String(width);
  const resolvedMaxWidth = typeof maxWidth === "number" ? `${maxWidth}px` : String(maxWidth);
  const canRenderGlass = surfaceRect.width > 0 && surfaceRect.height > 0;
  const animationState = isVisible ? "open" : "closed";
  const modalScale = stackedOffset ? 0.94 : scale;
  const resolvedGlassTint = glassTint ?? glassSettings?.tint ?? DEFAULT_MODAL_GLASS_SETTINGS.tint;
  const resolvedGlassSurfaceBlur =
    glassSurfaceBlur ?? glassSettings?.surfaceBlur ?? DEFAULT_MODAL_GLASS_SETTINGS.surfaceBlur;
  const resolvedGlassSurfaceTone =
    glassSurfaceTone ?? glassSettings?.surfaceTone ?? DEFAULT_MODAL_GLASS_SETTINGS.surfaceTone;
  const glassSourceChildren = glassSource ?? (
    <DocumentGlassSource
      portalId={portalId}
      refreshKey={`${viewportSize.width}x${viewportSize.height}:${surfaceRect.left}:${surfaceRect.top}`}
      selector={glassSourceSelector}
    />
  );

  return createPortal(
    <ModalRoot $animationState={animationState} className={className}>
      {/*
        When dismissible, the backdrop is an exposed button with an accessible
        name (kept out of the tab order since the close button already covers
        keyboard dismissal). When not dismissible it is hidden from assistive
        technology and unfocusable, so aria-hidden never lands on a focusable
        element.
      */}
      <Backdrop
        $dismissible={Boolean(canDismiss)}
        aria-hidden={canDismiss ? undefined : true}
        aria-label={canDismiss ? closeLabel : undefined}
        onClick={dismiss}
        tabIndex={-1}
      />
      <SurfaceWrap $maxWidth={resolvedMaxWidth} $width={resolvedWidth} ref={surfaceWrapRef}>
        <Surface
          $animationState={animationState}
          $hasHeader={hasHeader}
          aria-labelledby={labelledBy}
          aria-modal="true"
          onKeyDown={handleSurfaceKeyDown}
          ref={surfaceRef}
          role="dialog"
          style={
            {
              "--lgds-modal-radius": `${modalLens.radius}px`,
              "--lgds-modal-scale": modalScale,
              "--lgds-modal-text": theme.component.modalText,
              ...style
            } as CSSProperties
          }
          tabIndex={-1}
        >
          <GlassLayer aria-hidden="true">
            {canRenderGlass && (
              <GlassNode
                className={glassNodeClassName}
                contentClassName={glassContentClassName}
                drawSource={drawSource}
                engineMode={engineMode}
                lens={modalLens}
                lensX={surfaceRect.left}
                lensY={surfaceRect.top}
                renderer={renderer}
                sourceChildren={glassSourceChildren}
                sourceHeight={viewportSize.height}
                sourceWidth={viewportSize.width}
                surfaceClassName={glassSurfaceClassName}
                surfaceBlur={resolvedGlassSurfaceBlur}
                surfaceTone={resolvedGlassSurfaceTone}
                tint={resolvedGlassTint}
              />
            )}
          </GlassLayer>
          <ContentContainer $animationState={animationState}>
            {hasHeader && (
              <Header>
                {typeof header === "string" ? <Title id={titleId}>{header}</Title> : header}
                {dismissible && (
                  <CloseButton aria-label={closeLabel} onClick={dismiss}>
                    <CloseIcon />
                  </CloseButton>
                )}
              </Header>
            )}
            <Body $hasHeader={hasHeader}>
              {!hasHeader && dismissible && (
                <CloseButton aria-label={closeLabel} onClick={dismiss}>
                  <CloseIcon />
                </CloseButton>
              )}
              {children}
            </Body>
            {footer && <Footer>{footer}</Footer>}
          </ContentContainer>
        </Surface>
      </SurfaceWrap>
    </ModalRoot>,
    portalElement
  );
};

GlassModal.displayName = "GlassModal";

export default GlassModal;

function DocumentGlassSource({
  portalId,
  refreshKey,
  selector
}: {
  portalId: string;
  refreshKey: string;
  selector?: string;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof document === "undefined") return undefined;

    const source = getSourceElement(selector, portalId);
    if (!source) return undefined;

    const clone = source.cloneNode(true) as HTMLElement;
    const scrollX = window.scrollX || document.documentElement.scrollLeft || 0;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;

    clone.removeAttribute("id");
    clone.setAttribute("aria-hidden", "true");
    clone.style.pointerEvents = "none";
    clone.style.transform = `translate3d(${-scrollX}px, ${-scrollY}px, 0)`;
    clone.style.transformOrigin = "top left";
    clone.style.width = `${Math.max(document.documentElement.scrollWidth, window.innerWidth)}px`;
    clone.style.minHeight = `${Math.max(document.documentElement.scrollHeight, window.innerHeight)}px`;

    const portalClone = clone.querySelector(`#${portalId.replace(/^#/, "")}`);
    portalClone?.remove();

    host.replaceChildren(clone);

    return () => host.replaceChildren();
  }, [portalId, refreshKey, selector]);

  return <DocumentGlassSourceHost ref={hostRef} />;
}

function getSourceElement(selector: string | undefined, portalId: string): HTMLElement | null {
  if (typeof document === "undefined") return null;

  const candidates = [
    selector,
    "[data-lgds-glass-source]",
    "#root",
    "#__next",
    "body"
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const element = document.querySelector<HTMLElement>(candidate);
    if (element && element.id !== portalId.replace(/^#/, "")) return element;
  }

  return document.body;
}

const canvasImageCache = new Map<string, HTMLImageElement>();

function createDocumentCanvasSource({
  onImageLoad,
  portalId,
  selector
}: {
  onImageLoad?: () => void;
  portalId: string;
  selector?: string;
}): GlassCanvasSource {
  return ({ ctx, metrics }) => {
    if (typeof document === "undefined") return;

    const source = getSourceElement(selector, portalId) ?? document.body;
    const viewportWidth = metrics.sourceWidth;
    const viewportHeight = metrics.sourceHeight;

    ctx.fillStyle = getCanvasBackgroundColor(source);
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);

    drawElementBackground(ctx, source, viewportWidth, viewportHeight, onImageLoad);

    const elements = Array.from(source.querySelectorAll<HTMLElement>("*"));
    for (const element of elements) {
      if (element.id === portalId.replace(/^#/, "")) continue;
      drawElementBackground(ctx, element, viewportWidth, viewportHeight, onImageLoad);
    }
  };
}

function drawElementBackground(
  ctx: CanvasRenderingContext2D,
  element: HTMLElement,
  viewportWidth: number,
  viewportHeight: number,
  onImageLoad?: () => void
) {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) return;
  if (rect.right < 0 || rect.bottom < 0 || rect.left > viewportWidth || rect.top > viewportHeight) return;

  const backgroundColor = style.backgroundColor.trim();
  if (backgroundColor && !isTransparentCssColor(backgroundColor)) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
  }

  const imageUrl = getFirstCssBackgroundImageUrl(style.backgroundImage);
  if (!imageUrl) return;

  const image = getCachedCanvasImage(imageUrl, onImageLoad);
  if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;

  try {
    drawBackgroundImage(ctx, image, rect, style);
  } catch {
    // Cross-origin or unsupported images cannot be sampled into canvas.
  }
}

function drawBackgroundImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rect: DOMRect,
  style: CSSStyleDeclaration
) {
  const [sizeX = "auto", sizeY = "auto"] = style.backgroundSize.split(/\s+/);
  const position = style.backgroundPosition.split(/\s+/);
  const positionX = position[0] ?? "50%";
  const positionY = position[1] ?? positionX;
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const rectRatio = rect.width / rect.height;
  let drawWidth = image.naturalWidth;
  let drawHeight = image.naturalHeight;

  if (sizeX === "cover") {
    if (rectRatio > imageRatio) {
      drawWidth = rect.width;
      drawHeight = rect.width / imageRatio;
    } else {
      drawHeight = rect.height;
      drawWidth = rect.height * imageRatio;
    }
  } else if (sizeX === "contain") {
    if (rectRatio > imageRatio) {
      drawHeight = rect.height;
      drawWidth = rect.height * imageRatio;
    } else {
      drawWidth = rect.width;
      drawHeight = rect.width / imageRatio;
    }
  } else {
    drawWidth = resolveCssBackgroundSize(sizeX, rect.width, image.naturalWidth);
    drawHeight = sizeY === "auto"
      ? drawWidth / imageRatio
      : resolveCssBackgroundSize(sizeY, rect.height, image.naturalHeight);
  }

  const x = rect.left + resolveCssBackgroundPosition(positionX, rect.width, drawWidth);
  const y = rect.top + resolveCssBackgroundPosition(positionY, rect.height, drawHeight);

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.left, rect.top, rect.width, rect.height);
  ctx.clip();
  ctx.drawImage(image, x, y, drawWidth, drawHeight);
  ctx.restore();
}

function resolveCssBackgroundSize(value: string, containerSize: number, imageSize: number) {
  if (!value || value === "auto") return imageSize;
  if (value.endsWith("%")) return (Number.parseFloat(value) / 100) * containerSize;
  if (value.endsWith("px")) return Number.parseFloat(value);
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : imageSize;
}

function resolveCssBackgroundPosition(value: string, containerSize: number, imageSize: number) {
  if (value === "left" || value === "top") return 0;
  if (value === "center") return (containerSize - imageSize) / 2;
  if (value === "right" || value === "bottom") return containerSize - imageSize;
  if (value.endsWith("%")) return ((containerSize - imageSize) * Number.parseFloat(value)) / 100;
  if (value.endsWith("px")) return Number.parseFloat(value);
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getCachedCanvasImage(url: string, onImageLoad?: () => void): HTMLImageElement {
  const cached = canvasImageCache.get(url);
  if (cached) {
    if (!cached.complete && onImageLoad) cached.addEventListener("load", onImageLoad, { once: true });
    return cached;
  }

  const image = new Image();
  image.crossOrigin = "anonymous";
  if (onImageLoad) image.addEventListener("load", onImageLoad, { once: true });
  image.src = url;
  canvasImageCache.set(url, image);

  return image;
}

function getFirstCssBackgroundImageUrl(backgroundImage: string): string | null {
  const match = backgroundImage.match(/url\((["']?)(.*?)\1\)/);
  return match?.[2] ?? null;
}

