# Learnings

## 2026-04-04 Session Start
- Project is completely greenfield: no packages, no apps, only docs/ and README.md
- Using jujutsu (jj) for version control (per plan's commit strategy)
- pnpm 9 + Turborepo 2 + TypeScript 5 + Biome + Vitest stack
- Critical: api.md is the FINAL authority for all enum values, interfaces, and parameters
- shared-dev-plan.md is the TS expression of api.md

## 2026-04-04 Wave 1 Complete (Tasks 1 + 2)
- Monorepo: pnpm workspace + Turborepo 2 + Biome 1.9.4 + Vitest 3.2.4 + TypeScript 5.7.2
- apps/server uses tsup for build (not tsc), apps/client uses Vite 5.4.21
- Biome lint must NOT use `biome check .` — it scans .turbo/ cache and dist/ files
- FIX: Use `biome check packages/*/src packages/*/test apps/*/src` to only lint source
- Biome VCS ignore doesn't work with jujutsu — disable `vcs.enabled` and use explicit paths
- Protocol package: 16 enums, 9 interfaces (+ 2 helper maps), 7 commands, 38 events, 7 timer entries
- api.md is confirmed as FINAL AUTHORITY — all enum values match exactly
- Protocol has ZERO runtime dependencies (pure TypeScript types)
- packages/protocol tsconfig uses `verbatimModuleSyntax: true` and `Bundler` module resolution
- Other packages use `NodeNext` module resolution (from tsconfig.base.json)

## 2026-04-04 Config package task
- packages/config now owns typed config contracts, bundled game-params.json, deep-freezing loadConfig, and protocol-enum-based validateConfig.
- api.md remained the authority for documented values; undocumented tuning defaults were recorded in packages/config/data/TUNING_NOTES.md.
- @detonator/protocol had to be built first so its dist exports were consumable from packages/config; tests use a local Vitest alias to the protocol source.

## 2026-04-04 Wave 2 Complete (Tasks 3 + 4)
- Config package: types.ts (288 lines), game-params.json (89 lines), loadConfig.ts (deep freeze), validateConfig.ts (enum validation)
- Schema package: 8 Colyseus Schema classes, all with correct @type() field counts per shared-dev-plan §6.4
- KEY FIX: packages/protocol tsconfig had `noEmit: true` → produced empty dist/index.d.ts → config/schema couldn't import. Changed to NodeNext with proper emit.
- Protocol imports now need `.js` extensions for NodeNext module resolution
- Each package needs its own `vitest.config.ts` with alias for `@detonator/protocol` → `../protocol/src/index.ts`
- Config needs `@types/node` devDependency for `node:fs/promises` and `URL`/`import.meta.url`
- Config tsconfig needs `"types": ["node"]` for @types/node to work
- Schema uses `protocol-shim.d.ts` and `config-shim.d.ts` for Vitest module resolution (Bundler mode)
- Schema uses `as Facing8` / `as PlayerLifeState` casts for enum default values in @type() fields
- game-params.json values match api.md exactly (all documented params)
- TUNING_NOTES.md tracks 5 undocumented values with their defaults and rationale

## 2026-04-04 Schema utils task
- Added pure schema helpers under `packages/schema/src/utils/` for flat-grid indexing, `"x,y"` cell keys, checkpoint creation/collection, schema map upserts, and floor-reset operations.
- `resetPlayersForNewFloor()` intentionally only resets `x`, `y`, `facing`, `lifeState`, `respawnAt`, and `exp`; it preserves `sessionId`, `displayName`, `level`, and `pendingRewardCount`.
- Serialization coverage now lives in `packages/schema/test/serialization.test.ts`, while helper behavior is validated in `packages/schema/test/schema-utils.test.ts`.

## 2026-04-04 Config data task
- Added bundled `items.json`, `skills.json`, `stages.json`, and `rewards.json` under `packages/config/data/` and exposed dedicated JSON loader functions plus `loadBundledConfig()`.
- `validateConfig()` now enforces complete item/skill enum coverage, floor/stage uniqueness and referential integrity, reward pool references, and item `effectRef` compatibility by effect kind.
- The config package uses pure JSON data files; unresolved item timings were concretized from existing `game-params.json` defaults and mirrored in `TUNING_NOTES.md`.

## 2026-04-04 Rules-core foundation task
- rules-core uses NodeNext source imports with .js extensions and needs its own vitest aliases for both @detonator/protocol and @detonator/config.
- For package-local typecheck/build, rules-core tsconfig resolves @detonator/protocol and @detonator/config to their dist/index.d.ts outputs to avoid pulling sibling source trees under rootDir.
- Adjacent mine count recomputation should report stale coords for Safe cells only; mine cells themselves are not part of the visible number update set.
- Frontline target selection was implemented as random seed pick + 8-neighbor connected expansion constrained by x-axis widthCap, then a regenerated frontier that excludes previously skipped frontline cells in the same erosion phase.
- Verified rules-core foundation already covers DTO exports, Mulberry32 seeded RNG, grid helpers, movement helpers, NodeNext `.js` source imports, and Vitest aliases for both sibling packages.
- rules-core verification baseline on 2026-04-04: `pnpm --filter @detonator/rules-core test` passes 10 files / 36 tests, `pnpm --filter @detonator/rules-core build` succeeds, and lsp diagnostics are clean across src + test files.

## 2026-04-04 Rules-core skill/inventory task
- rules-core can consume bundled config JSON directly from sibling package data with `import ... with { type: "json" }`, which avoids adding Node type dependencies just to read config data at build time.
- Skill modifier aggregation is safest when keyed by `SkillType` totals first, then converted by each skill definition's `valueRoll.unit`; percent-based effects must be normalized to ratios only after summing stack effect values.
- Inventory mutation helpers must stay immutable and should only stack when the incoming quantity still fits within `maxStack`; otherwise they must fall back to the first empty slot.
