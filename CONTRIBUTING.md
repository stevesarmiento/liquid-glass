# Contributing

Thanks for taking the time to improve Liquid Glass. This repo mixes research notes, package code, Rust/WASM engine work, and visual demos, so small, focused pull requests are easiest to review.

## Development Setup

Install dependencies:

```sh
bun install
```

If you are changing the Rust/WASM engine, install the WASM target and `wasm-pack`:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --version 0.13.1 --locked
```

## Useful Commands

```sh
bun run build
bun run build:wasm
bun run test
bun run typecheck
bun run format:check
bun run playground
bun run docs
```

Build WASM before running the full test suite when you want TypeScript/WASM parity tests to exercise the generated engine path:

```sh
bun run build:wasm
bun run test
```

## Pull Requests

- Keep changes scoped to one concern.
- Include tests for engine math, renderer behavior, hooks, or component interactions when behavior changes.
- Run `bun run typecheck`, `bun run test`, and `bun run format:check` before opening a PR.
- Add a changeset for package-facing changes:

```sh
bun run changeset
```

- Update docs or examples when changing public APIs.
- Do not commit local build noise, screenshots, profiler output, or generated artifacts unless the change specifically requires them.

## Research Boundary

The research tools in `scripts/` only fetch public resources referenced by public pages. Contributions should not include private source, bypassed access controls, credentials, or material copied from non-public systems.

When translating observed behavior into this codebase, prefer original implementations with clear tests and documentation.

## Code Style

- TypeScript is formatted with Prettier.
- Rust should stay `cargo fmt` friendly.
- Public package APIs should be typed and documented in the package README when they are intended for consumers.
- Renderer code should preserve the engine boundary: deterministic math belongs in `crates/core` and `packages/liquid-glass/src/engine`; browser orchestration belongs in `packages/liquid-glass/src/web` and React-specific behavior in `packages/liquid-glass/src/react`.
