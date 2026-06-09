# @liquid-glass/design-system

Component library for trying `liquid-glass` as a design-system aesthetic.

The structure follows the Hillside reference:

- `src/index.ts` exports the public package surface.
- `src/components/Common/index.ts` groups common components.
- Each component owns `index.tsx`, `styles.ts`, and `types.ts`.
- `src/constants`, `src/contexts`, `src/hooks`, and `src/lib` hold shared system code.

The first component is `GlassSlider`.

