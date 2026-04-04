# Decisions

## 2026-04-04 Session Start
- Using main worktree at /home/nozyjp/univActivities/club/rcc/orientation2026/detonator
- No worktree creation needed (single worktree workflow)

## 2026-04-04 Config data task
- Stage authoring for floors 2-10 was kept intentionally minimal-but-non-empty (board profile + hole/CP/spawn seeds) to satisfy plan requirements without inventing full encounter tuning.
- Bundled data loading was added in `packages/config` rather than forcing every consumer to assemble JSON imports manually.
