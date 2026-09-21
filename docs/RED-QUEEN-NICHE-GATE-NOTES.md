# Red Queen Niche-Gate Tuning Notes

Pre-merge reading notes for PR #6 (MAP-Elites over room lineages, candor as
adversarial critic). Two sources, both cited so the claims can be checked.

## 1. GAME paper (arXiv 2505.06617 — Generational Adversarial MAP-Elites)

GAME = coevolutionary QD that evolves BOTH adversarial sides, alternating
which side is evolved each generation, with vision-embedding behavior
descriptors (no hand-designed cells). Validated on three adversarial domains.

Findings that bear directly on our niche-gate design:

- **Alternation, not simultaneity.** Evolving one side at a time against the
  current archive of the other beat co-evolving both at once. For the Red
  Queen loop this suggests: rotate critic and generator in turns (critic
  generation judges current room archive; generator generation proposes new
  rooms against current critic), rather than scoring every candidate against
  a live-moving critic. A moving critic mid-scoring corrupts cell
  assignment — scores are not comparable across critic versions.
- **Coverage-cost warning for adversary-task cell splits.** GAME's cells are
  defined on behavior descriptors of ONE side's products; splitting cells by
  adversary-task pairs (critic-task × room-task) multiplies cell count by the
  product of both spaces and empties the archive — most adversary-pair cells
  are unreachable stepping stones, not discoverable niches. Keep cells on the
  GENERATOR's behavior space (values-entropy × flicker-rate as designed);
  never cross-product with critic identity. Critic rotation is a *schedule*,
  not a *dimension*.
- **Generational extinction produces novelty.** Periodic extinction events
  (archive collapse of one side) raised archive novelty afterward. This is an
  argument for our displacement = D1 death mechanic being load-bearing, not
  cosmetic — but also a warning: if extinction is too frequent, arms-race
  cycling repeats a small set of archetypes (observed in GAME's battle game).
- **Neutral mutations were the stepping stones.** Highest performers passed
  through phenotypically-neutral lineages first. Implication for our novelty
  gate: near-duplicate candidates (below the Chebyshev cell-distance floor)
  should not be auto-rejected if their parent lineage later proves viable —
  but this is already handled by the settled-cap / dormant-origin mechanics,
  so no design change, only a test-idea: seed a neutral-mutant lineage and
  assert it can reach the viability floor later.
- **Honest limit the authors state:** open-endedness stayed constrained by
  the search spaces they chose. Ours is constrained by transcript evidence
  supply (a room can only accrue values-ledger entries when it is spoken in)
  — the same shape of limit, worth naming in the doc when #6 merges.

## 2. DEI frontier seed (arXiv 2605.27130 — distributed Digital Red Queen)

Asynchronous cross-node champion gossip across heterogeneous LLMs =
inter-model Red Queen. Current PR #6 rotates critics within one node.
Upgrade path (post-merge, not in #6's scope):

- Champion = room lineage with booked receipts; gossip = hash-chained
  champion summaries shared across nodes (WAL constitution channel already
  carries receipts — gossip rides it).
- Selection uses integer weights over champion alarms, the same
  MAXC-min(alarms) rule jev-quilt's ReadingEnsemble already books — reuse,
  don't reinvent.
- Async matters: nodes do not lock-step; a critic from node B judges node A's
  archive against node A's OWN values ledger (value-disjointness static check
  generalizes: different expertise, shared ethos).

## Suggested actions for #6 review (none blocking)

1. Confirm cell dimensions exclude critic identity (generator behavior only).
2. Add one test: score a fixed candidate suite under critic v1 vs critic v2,
   assert cell assignment is stable across critic rotation (alternation
   invariant).
3. Leave adversary-pair cell splits explicitly out of scope, cite this file.
