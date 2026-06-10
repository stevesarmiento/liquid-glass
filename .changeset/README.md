# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).

- Run `bun run changeset` to record a change (pick the bump type and describe it).
- Run `bun run version` to apply pending changesets (bumps versions, writes changelogs).
- Run `bun run release` to build and publish (`changeset publish`).

Only publishable packages are versioned; private packages (`@liquid-glass/design-system`,
`liquid-glass-docs`, `liquid-glass-playground`) are excluded via `privatePackages` in
`config.json`. Currently the only publishable package is `liquid-glass`.
