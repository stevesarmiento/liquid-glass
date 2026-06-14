# Liquid Glass Workspace

[![CI](https://github.com/stevesarmiento/liquid-glass/actions/workflows/ci.yml/badge.svg)](https://github.com/stevesarmiento/liquid-glass/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

This is no longer just a bundle-capture research repo. It is a research-to-implementation workspace for a reusable liquid-glass rendering system: public artifact analysis, a Rust math core, a publishable TypeScript package, React primitives, design-system experiments, docs, and visual playgrounds.

The original investigation started from the public resources served by:

`https://aave.com/design/building-glass-for-the-web`

The implementation work now lives alongside that research so the math, rendering paths, and component behavior can be tested as real package code.

## Status

This project is early and moving quickly. The core package is usable for experimentation, but APIs and rendering internals can change before a stable 1.0 release.

## What Is Here

- `packages/liquid-glass`: publishable package with the engine boundary, TypeScript fallback, optional Rust/WASM engine, DOM/SVG scene controller, canvas/WebGL renderers, React primitives, and material interaction hooks.
- `crates/core`: deterministic Rust lens math, geometry, displacement-map generation, merged-map logic, and WASM exports.
- `packages/design-system`: private component package for trying the glass aesthetic in real controls such as buttons, sliders, switches, dropdowns, and modals.
- `packages/playground`: Vite/React playground for visual iteration across scene lenses, component-local glass, interaction states, and performance behavior.
- `packages/docs`: Vite/React docs app for package-facing examples and reference material.
- `docs`: architecture notes, adapter contracts, and reverse-engineering notes.
- `prototype`: early DOM/SVG prototype served as a static page.
- `scripts`: public bundle capture, prettification, source-map extraction, search, summarization, and prototype serving tools.
- `artifacts`: captured and prettified public web artifacts used by the research notes.
- `references`: external design-system/reference repositories used for comparison while shaping package structure.

## Package Capabilities

`liquid-glass` currently covers several layers:

- deterministic lens normalization, geometry, and displacement-map generation
- TypeScript and Rust/WASM engine modes, with automatic fallback
- DOM/SVG filtering for live HTML scenes
- WebGL2 and CPU canvas renderers for image/canvas-backed scenes
- component-local rendering via `GlassNode`, `GlassSurface`, and local canvas/WebGL helpers
- React scene and primitive exports from `liquid-glass/react`
- material interaction hooks for press, grab, deformation, hover tint, spring motion, and pointer light effects
- shared map caching, render gating, adaptive quality, and runtime performance counters

See [`packages/liquid-glass/README.md`](packages/liquid-glass/README.md) for API usage examples.

## Requirements

Install JavaScript dependencies with Bun:

```sh
bun install
```

Contributors who build or test the Rust/WASM engine also need Rust, the WASM target, and `wasm-pack`:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --version 0.13.1 --locked
```

Consumers of the built `liquid-glass` package do not need Rust tooling.

## Common Workflows

Build the TypeScript packages:

```sh
bun run build
```

Build the Rust/WASM engine into `packages/liquid-glass/wasm`:

```sh
bun run build:wasm
```

Build both:

```sh
bun run build:all
```

Run tests. Build WASM first if you want parity tests to exercise the WASM path:

```sh
bun run build:wasm
bun run test
```

Run typechecking and formatting checks:

```sh
bun run typecheck
bun run format:check
```

Start the visual playground:

```sh
bun run playground
```

Then open `http://127.0.0.1:5173`.

Start the docs app:

```sh
bun run docs
```

Then open `http://127.0.0.1:5174`.

Run the early prototype:

```sh
bun run prototype
```

Then open `http://localhost:4173/prototype/`.

## Research Tools

The public-artifact research workflow is still available.

Capture public bundles:

```sh
bun run download
```

The raw page, JS chunks, CSS chunks, and any public source maps are written under `artifacts/raw/`.

Prettify captured files:

```sh
bun run prettify
```

Formatted files are written under `artifacts/prettified/`.

Extract public source maps:

```sh
bun run extract:sourcemaps
```

If a public `.map` file contains `sourcesContent`, original source files are unpacked under `artifacts/sourcemaps/`. Most production sites do not publish these maps.

Search captured artifacts for implementation signals:

```sh
bun run search -- feDisplacementMap generateLensMap refractionTarget
```

Summarize the capture:

```sh
bun run summarize
```

Reverse-engineering notes are in [`docs/reverse-engineering.md`](docs/reverse-engineering.md).

## Architecture Notes

- [`docs/architecture.md`](docs/architecture.md) describes the engine boundary, rendering layers, performance architecture, and deferred work.
- [`docs/adapters.md`](docs/adapters.md) sketches future native adapter contracts for iOS, Android, React Native, and WebGL consumers.
- [`packages/liquid-glass/README.md`](packages/liquid-glass/README.md) is the package-level API guide.
- [`packages/design-system/README.md`](packages/design-system/README.md) documents the private design-system package structure.

## Release And CI

Releases use [changesets](https://github.com/changesets/changesets):

```sh
bun run changeset
bun run version
bun run release
```

Only `liquid-glass` is publishable. Workspace apps and `@liquid-glass/design-system` are private.

CI runs on every push to `main` and every pull request. It installs Bun and Rust, runs `cargo test`, builds WASM, builds packages, typechecks, runs tests, and checks Prettier formatting.

## Open Source

- License: [`MIT`](LICENSE)
- Contributions: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Code of conduct: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- Support: [`SUPPORT.md`](SUPPORT.md)
- Security reports: [`SECURITY.md`](SECURITY.md)

GitHub issue templates, a pull request template, and Dependabot config are included for public collaboration.

## Research Boundary

The capture tools download only resources that the public page references. This repo is for studying public web artifacts and turning the observed techniques into original package code. It does not bypass authentication, access controls, or hidden/private source.
