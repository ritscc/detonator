# Test Reports

Scalable report archive for test planning, gap analysis, and human judgment records.

## Directory Convention

```
docs/reports/
├── README.md                    ← This file
├── test-phase-a/                ← Phase A: Existing test verification & supplementation
│   ├── master/
│   │   └── YYYY-MM-DD-gap-analysis.md    ← Master synthesis report
│   ├── protocol/
│   │   └── YYYY-MM-DD-protocol.md
│   ├── config/
│   │   └── YYYY-MM-DD-config.md
│   ├── schema/
│   │   └── YYYY-MM-DD-schema.md
│   └── rules-core/
│       └── YYYY-MM-DD-rules-core.md
├── test-phase-b/                ← Phase B: TDD for unimplemented logic (detonate/explosion/erosion/...)
│   ├── master/
│   └── <module>/
├── test-phase-c/                ← Phase C: Server/Client integration tests
│   ...
└── regression/                  ← Regression reports for past bugs / misinterpretations
```

## Report Sections (Standard Template)

Each module report MUST contain:

1. **Scope** — What was analyzed, what was not
2. **Authority Chain** — Which docs were used as oracle (api.md §X.Y format)
3. **Existing Coverage Inventory** — Every existing test file + what it covers
4. **Gap Analysis** — Categorized by:
   - 🟢 Covered adequately
   - 🟡 Partially covered (missing boundary/invalid/negative cases)
   - 🔴 Not covered at all
5. **Contradiction Report** ⚠️ — Spec vs implementation conflicts requiring human decision
6. **Ambiguity Report** ❓ — Unclear specs needing human interpretation
7. **Supplementation Plan** — Concrete list of tests to add (with rule_id)
8. **Decision Log** — Human judgments recorded with date + rationale

## Decision Log Format

When human judgment is required, record as:

```markdown
### Decision #N: [Short Title]
- **Date**: YYYY-MM-DD
- **Category**: contradiction | ambiguity | scope | priority
- **Options**:
  - A: [Option A] → [Impact]
  - B: [Option B] → [Impact]
- **Human Decision**: A or B (with rationale)
- **Applied To**: Which test(s) were affected
```
