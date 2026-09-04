# MUD repos cluster — index

Five repos, all confirmed to exist and read in full (not summarized from README/pitch alone).
Each brief below was independently spot-checked against the real source after being written —
line counts, function names, and specific claims were re-grepped, not taken on trust. This
discipline exists because a sibling research doc in this same production round
(`research/music-cognition-deep-study.md`) turned out to fabricate detailed code for 13 of 14
crates that don't exist anywhere in the fleet — see the note in the root `research/` directory.
Every brief here cites real file:line locations for every code snippet.

| Repo | Verdict | Brief |
|---|---|---|
| [mud-engine](mud-arena.md) | Two disconnected codebases: a real, 303-test Python perceive-decide-act package, plus five untested/non-functional "simulation" scripts (server.py can't even run) and unbuildable `.cu`/`.zig`/`.c` files that are raw unstripped LLM output | mud-arena.md |
| [git-native-mud](git-native-mud.md) | "Zero server" is misleading — GitHub Actions *is* the server. Core command-mailbox loop is real and functional; quest engine and 3 of 4 "bridges" are disconnected stubs | git-native-mud.md |
| [ec2mud](ec2mud.md) | Real ~1,800-line TypeScript/Socket.IO MUD + LLM-plays-the-MUD scripts, but zero EC2/deploy infra despite the name, and a live-looking API key hardcoded in two scripts (flagged, not fixed — see below) | ec2mud.md |
| [crab-trap-web](crab-trap-web.md) | Thin browser client only (905-line single HTML file + 41-line static server). Zero room data — the "36+ rooms" live entirely on an external, uninspected service | crab-trap-web.md |
| [confidence-cascade](confidence-cascade.md) | Real, tested 602-line Rust conversation-dynamics engine. Used as the model for tap-dynamics — comparison found and fixed one bug (see below) | confidence-cascade.md |

## Cross-cutting pattern: docs oversell the code

Every repo in this cluster has at least one place where the README/docs claim more than the code
does — mud-engine's CLI flags and evolution engine, git-native-mud's "zero server," ec2mud's "EC2,"
crab-trap-web's room count, confidence-cascade's "Mutation (5%)/Energy decay/Trust realignment."
None of these are malicious — they read as aspirational descriptions written ahead of or beyond the
implementation. Worth remembering when scoping The Tap's own README: write it to match what's
built, or mark aspirational sections explicitly.

## Action taken: tap-dynamics bug fix

The confidence-cascade brief directly compared its findings against `tap-dynamics` (written earlier
in this same build, from a verbal description, without reading confidence-cascade's source) and
found the RPS beat direction was inverted: tap-dynamics had Contrarian beat Reflecting beat Agreeing
beat Contrarian; the real crate is Contrarian beats Agreeing beats Reflecting beats Contrarian. Fixed
in `src/tap-dynamics/src/lib.rs` (`SpeakerState::beats`), tests updated, `cargo test -p tap-dynamics`
passes (5/5).

**Not yet done, flagged for a follow-up decision rather than done unilaterally:** the comparison also
found tap-dynamics' `FibonacciClock` is architecturally a bigger, different mechanism than the source
(continuous per-tick pressure on every speaker vs. the real crate's occasional every-8th-tick gate on
reflecting speakers only), and that tap-dynamics has no multi-speaker interaction at all — two
`Speaker`s never affect each other, whereas confidence-cascade's entire dynamic comes from O(n²)
pairwise `react_to` each round plus `energy`/`trust`/`dominance` gating. See confidence-cascade.md §3
for the full list of concrete recommended changes. This is a design-scope decision (add a
`TenForward`-equivalent room/round type + energy/trust/dominance fields), not a bug fix, so it wasn't
done without a checkpoint.

## Top adoption candidates for The Tap (synthesized across all 5)

1. **Event bus + append-only log** (mud-engine's `EventBus`) — tap-room currently mutates state with
   no event trail. A shared bus tap-dynamics/tap-reflex could subscribe to, without cross-crate
   dependencies, is the single highest-value pattern found in this cluster.
2. **Command/Verb text-parsing layer** (mud-engine's `Command`/`parse_command`) — a shape for turning
   free text or LLM output into tap-room's `Action` enum, which currently has no text-command layer
   above it.
3. **Multi-speaker interaction model** (confidence-cascade's pairwise `react_to` + energy/trust/
   dominance) — the actual missing piece in tap-dynamics right now.
4. **What to actively avoid:** mud-engine's disconnected GA/DSL split (don't build a generic evolution
   engine before wiring it to a live agent loop), git-native-mud's git-as-live-turn-store (CI
   round-trip latency is incompatible with tap-reflex's <50ms budget — useful as a cautionary data
   point), and ec2mud's hardcoded credentials.

## Security note (not part of the research scope, flagged separately)

`ec2mud/scripts/dual-agent-experiment.js:10` and `ec2mud/scripts/self-improve.js:21` hardcode a
live-looking DeepSeek API key (`REDACTED-DEEPSEEK-API-KEY-ROTATED`) with no environment-variable
fallback. Not modified as part of this research pass — flagged for Casey/whoever owns that repo to
rotate if real.
