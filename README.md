# Liquid Glass Research

Local tooling for inspecting the public resources served by:

`https://aave.com/design/building-glass-for-the-web`

This repo downloads only resources that the page publicly references, checks for public source maps, prettifies JavaScript/CSS/HTML, and searches for glass-related implementation terms.

## Setup

```sh
bun install
```

## Capture Public Bundles

```sh
bun run download
```

The raw page, JS chunks, CSS chunks, and any public source maps are written under `artifacts/raw/`.

## Prettify

```sh
bun run prettify
```

Formatted files are written under `artifacts/prettified/`.

## Extract Public Source Maps

```sh
bun run extract:sourcemaps
```

If a public `.map` file contains `sourcesContent`, the original source files are unpacked under `artifacts/sourcemaps/`. Most production sites do not publish these maps.

## Search Glass Signals

```sh
bun run search
```

Pass custom terms when needed:

```sh
bun run search -- feDisplacementMap generateLensMap refractionTarget
```

## Summarize Capture

```sh
bun run summarize
```

This prints the downloaded resource counts, map availability, and the largest bundles to inspect first.

## Notes

This is for studying public web artifacts and reconstructing techniques. It does not bypass authentication, access controls, or hidden/private source.

## Reverse Engineering

Initial implementation notes are in [`docs/reverse-engineering.md`](docs/reverse-engineering.md).

## Prototype

Run the DOM/SVG implementation prototype:

```sh
bun run prototype
```

Then open `http://localhost:4173/prototype/`.

## Liquid Glass Monorepo

This repo now also contains the first buildable `liquid-glass` package slice:

- `crates/core`: Rust engine math and WASM exports.
- `packages/liquid-glass`: public TypeScript package with TS fallback, optional WASM engine, DOM/SVG controller, and React wrapper.
- `packages/playground`: Vite React playground for visual iteration.
- `docs/architecture.md`: package and renderer architecture.
- `docs/adapters.md`: future native adapter contracts.

Contributor setup:

```sh
bun install
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --version 0.13.1 --locked
```

Useful commands:

```sh
bun run build        # turbo run build (JS/TS packages)
bun run build:wasm   # wasm-pack build of crates/core into packages/liquid-glass/wasm
bun run build:all    # build + build:wasm
bun run test         # cargo test + turbo run test (run build:wasm first so parity tests run)
bun run test:wasm    # wasm-pack test --node crates/core
bun run typecheck    # turbo run typecheck (tsc --noEmit in every package)
bun run format:check # prettier check (see .prettierignore; `bun run format` to fix)
bun run playground
```

Releases use [changesets](https://github.com/changesets/changesets): `bun run changeset` to
record a change, `bun run version` to bump, `bun run release` to build and publish. Only
`liquid-glass` is publishable; private packages are not versioned.

CI (`.github/workflows/ci.yml`) runs on every push/PR: `cargo test`, the WASM build (so the
engine parity tests are exercised), then `turbo run build`, `typecheck`, `test`, and the
prettier format check.
