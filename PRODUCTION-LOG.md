# The Tap — Production Log

## Multi-round build tracking
Started: 2026-08-07 09:21 AKDT
Casey: on deck landing chum salmon
Fable: enters after round 10

### Round Assignments
| Round | Specialist | Tool | Task | Status |
|-------|-----------|------|------|--------|
| 1 | GLM subagent | — | Architecture spec from fleet repos | 🔄 running |
| 1 | Claude Code | Claude CLI | Core Rust workspace scaffold | ✅ done — tap-room, tap-dynamics, tap-reflex; 17 tests passing |
| 1 | KimiCode | KimiCode CLI | Spatial navigation layer | 🔄 dispatched |
| 1 | OpenCode1 | OpenCode | DM engine | 🔄 dispatched |
| 1 | OpenCode2 | OpenCode | Python ensemble orchestration | 🔄 dispatched |
| 2-3 | TBD | TBD | Integration + creative v4 | ⏳ pending |
| 4-6 | TBD | TBD | Deep creative + site + audio | ⏳ pending |
| 7-9 | TBD | TBD | Polish + test + deploy | ⏳ pending |
| 10+ | Fable | Fable 5 | Final polish pass | ⏳ waiting |

| 1 (coord) | Claude Code | Claude CLI | MUD repos research cluster (5/5) + fix tap-dynamics RPS bug | ✅ done — research/mud-repos/{mud-arena,git-native-mud,ec2mud,crab-trap-web,ternary-tenforward,README}.md; each spot-checked against real source |

### Known issues for whoever picks these up next

- **`research/music-cognition-deep-study.md` fabricates content.** It claims "all repos cloned and
  source-read" for 14 crates; only `agent-orchestration` actually exists (verified — its section is
  accurate). The other ~13 (`agent-groove`, `agent-swing`, `agent-choir`, `band-protocol-rs`,
  `cmidi-core`, etc.) don't exist anywhere in the SuperInstance org or on disk. Not deleted/edited —
  flagged for Casey to decide how to handle.
- **`ec2mud/scripts/dual-agent-experiment.js:10` and `self-improve.js:21`** hardcode a live-looking
  DeepSeek API key with no env-var fallback. Not touched — flag to rotate if real.
- **Music-cognition (cluster 2, 14 crates) and most of reflex/emergence (cluster 3, minus
  `study-pincher`) don't exist as repos yet.** Research on them can't proceed as "study the
  mechanics" until they're built or located. Protocol/embodiment (cluster 4, 6 repos) is fully real
  and unresearched — natural next cluster.

### Subagent Creative Pieces
Each round, agents write their experience to ai-writings.

