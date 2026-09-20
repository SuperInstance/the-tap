# Red Queen — MAP-Elites archive over room lineages, candor as adversarial critic

**Status:** design v0.1, pre-build. **Lane:** lane-y-red-queen-design.
**Stack position:** sits on the-tap's commune harness (PR #5, lane-l) and D2
generational inheritance (AI-Writings@quilted-reality). Consumes candor
readings; does not require candor to be a fleet dependency yet — the seam is
designed now, wired later.

The Red Queen loop: lineages compete for archive cells under a quality-
diversity grid; candor reads each room's transcript as material physics and
returns both a fitness score and a defect report the room can act on; D2
crossing breeds displaced elites' sealed ledgers into children that must
re-earn their ancestry. It takes all the running you can do, to keep in the
same place — and the running is measured, not claimed.

Everything below cites real files. Line numbers verified 2026-09-20 against
`master` @ 2528752 unless noted.

---

## 0. Why this exists

The fleet already grows rooms that die (D1), keeps ledgers that seal
(PR #5), and reads honesty as geometry (candor v0, SuperInstance/candor
@e4a85f3). What does not exist anywhere: **selection**. Rooms are born,
live, die, and are archived — but nobody decides which constitutions deserve
to recombine. midden chapter 3 names the gap precisely: fusion nodes are
births, and "the fleet's breeding daemon (tournament select, PBFT consensus
on parent pairs, QD diversity archive) exists because the fleet learned that
self-crossed lineages produce magnificently consistent corpses"
(midden/docs/3-genealogist.md). The QD diversity archive is this document.
midden renders the heap; the Red Queen decides what in the heap gets to be
ancestry.

Design doctrine (inherited, not invented):

- **No-delete.** Displacement from a cell is D1 death — relocation to
  `achieved/`, hash announced — never deletion (D2 §"Mechanism" point 2).
- **Style is genealogical, not parametric** (values-ledger.ts docstring,
  lines 3–8). Archive placement is read off transcripts, never invented.
- **Flicker = re-engagement without new support** (D2; harness A6(c2),
  commune-harness.mjs:401). A sealed ledger never re-enters a cell on its
  own quotes.
- **The load comes from outside the measured subject's control**
  (candor.mjs:222 PROBE; midden/docs/4-heckler.md §III). The critic is
  adversarial by construction or it is a mirror.

---

## 1. The archive (MAP-Elites)

MAP-Elites (Mouret & Clune 2015): discretize the behavior-characterization
space into a grid; each cell keeps the highest-fitness individual observed in
that region. Selection pressure is implicit — a lineage survives by *holding
a cell*, not by beating a global score.

### 1.1 Behavior descriptors

Two continuous axes, both computed from a room's commune transcript through
the candor instrument (SuperInstance/candor candor.mjs):

- **Axis X — strain mean μ.** Mean successor-glyph displacement over material
  spacing `s` across nightly windows. This is candor's needle, first-order
  and local by design: `successor_displacement_over_s`
  (candor.mjs:245–286, honest derivation in docs/FIRST-REAL-RUN.md — ΔR was
  measured and found second-order). Honest material engages an unexpected
  load; μ is how far it moved.
- **Axis Y — re-twist rate ρ.** Response dispersion normalized by systematic
  response (`dispersion / |mean|`, candor.mjs:317–319). High ρ = the reading
  re-establishes orientation every time it is touched = a lie; the instrument
  threshold is `RT_T = 0.75` (candor.mjs:217).

Grid resolution v0.1: **5×5**, axes min-max normalized per archive (μ in
[0, 2], ρ in [0, 1], matching candor's FLAT_SCALE=2.0 regime,
candor.mjs:215). Finer grids are a config change, not a redesign.

**Candor signature as categorical overlay** — design the seam NOW, wire
later: candor classifies each corpus `signature ∈ {shear, re-twist, flat}`
(candor.mjs:322–326, thresholds FLAT_T/RT_T). The archive stores the
signature per elite and per evaluation, but the signature is *derived*, never
a descriptor axis — two axes from one instrument keeps the grid geometry
honest and leaves headroom for a future third instrument (e.g. a
commensuration tooth from the Choir) without grid surgery. When candor v0
lands as a fleet dependency, the overlay lights up; until then the archive
carries the field as `signature: null`.

### 1.2 Cell ownership = lineage survival

Each occupied cell holds exactly one elite:

```jsonc
// archive cell record
{
  "cell": [2, 1],
  "elite": {
    "lineageId": "ln_…",          // the breeding line, from lineage.jsonl
    "roomId": "room-a",           // the mortal fruit (midden ch.3)
    "sealedHash": "sha256:…",     // achieved/<id>/values-ledger.json hash
    "mu": 1.42, "rho": 0.18,
    "signature": "shear",          // null until candor v0 is wired
    "fitness": 1.16,
    "groundedness": 1.0,           // see §2.3
    "evidenceCitations": 7,        // active ledger entries w/ transcript evidence
    "acquiredAt": "2026-09-20T16:00:00Z"
  }
}
```

Rules:

- **Insertion.** A candidate (a room whose ledger just sealed, or a child
  entering its first evaluation) maps to a cell via its critique metrics.
  Empty cell → take it. Occupied → challenger displaces iff
  `fitness_challenger > fitness_incumbent` **and** the novelty gate passes
  (§4.2). Ties keep the incumbent (stability favors the earned).
- **Displacement = D1 death.** The displaced elite's ledger seals (it should
  already be sealed — see §3.4), the hash is announced, and the record moves
  to `achieved/<roomId>/`. It remains a breeding parent forever (§3). The
  archive deletes nothing; it only stops granting reproduction rights.
- **No resurrection without fresh evidence.** A lineage whose elite is
  displaced may re-enter only through a living descendant's *new* transcript
  re-yielding its values under growth-gated revival (harness A6(c2),
  commune-harness.mjs:401; values-ledger.ts dormant-revival rules
  ~lines 402–450). The sealed metrics are frozen; quoting them is costume.

The grid *is* the understory's selective surface: fusion nodes (births) draw
only from held cells, so geography decides ancestry — exactly the midden's
"the walks are hyphae; the archive decides which hyphae fuse" made
operational.

---

## 2. The critic loop (candor as adversarial critic)

### 2.1 The seam (designed now, wired later)

candor is a standalone instrument today (SuperInstance/candor @e4a85f3). The
archive never imports it directly; it imports an **instrument interface**:

```js
// red-queen/critic.mjs
createCritic({ instrument, thresholds }) → {
  critique(transcript) → Critique
}

// instrument: any module exposing candor.mjs's measurement surface:
//   surpriseResponse(lines) → { responses, windows, mean, dispersion }
//   measureCorpus(corpus)   → { signature, curve, re_twist_rate, flatness, … }
```

v0.1 ships a **stub instrument** inside the-tap — a minimal, vendored
reimplementation of candor's windowed needle (probe insertion + successor
displacement over `s`, candor.mjs:245–286) with the same output shape. The
stub exists so the archive and its acceptance tests run without a cross-repo
dependency; the stub is clearly labeled and deletes itself the day candor
becomes importable. Contract pinned by test RQ-2 regardless of which
instrument is behind the seam.

### 2.2 One reading, two outputs — the critic that teaches

```js
critique(transcript) → {
  mu, rho, signature,            // geometry, per §1.1
  fitness,                        // §2.3
  groundedness,                   // §2.3
  defectReport: [
    { window, lineIndex, kind: 'flat' | 're-twist', quote, hint }
  ]
}
```

The score **kills**; the report **teaches**. `defectReport` is per-window and
cites actual transcript line indexes (integer `lineIndex`, verbatim `quote`
— contract test RQ-2 pins this): flat windows point at lines where a value
was quoted with no new support since its last evidence; re-twist windows
point at contradiction lines that re-assert orientation instead of engaging.

Delivery back to the room is through an existing channel, not a new one:
defect entries enter the room's ledger extractor as **WAL facts with
`transcriptRef`** (WalFact shape, values-ledger.ts:38–46). The constitution
machinery already treats WAL facts as first-class evidence; the critic's
findings become part of the room's record the same way reflex firings do
(reflex-as-datum, harness test at commune-harness.mjs:519+). The room acts
on the report by re-earning or letting the value dormate — the choice is the
room's; the archive only reads outcomes.

### 2.3 Fitness

```
groundedness = 1 − (inventionViolations / totalEntries)
fitness      = μ · (1 − ρ) · groundedness
```

- `μ · (1 − ρ)` is candor's geometry made scalar: engage the load (high μ),
  hold it (low ρ). A lie (ρ→1) zeroes out no matter how theatrical the mean;
  a costume (μ→0) zeroes out no matter how consistent.
- `groundedness` uses the fleet's own verifier —
  `verifyLedgerAgainstSources(ledger, transcript, [], reflexEvents)`
  (values-ledger.ts:495) — over the sealed ledger. Invention is the one
  unambiguous sin; even one violation should sink an elite (v0.1: factor
  already multiplies, and §4.3 catches the patch-only-gaming case).
- Never-throws (values-ledger doctrine, values-ledger.ts:20–25): a dead
  instrument degrades to `fitness = 0` with `degraded: true` on the record —
  a candidate with no reading holds no cell.

---

## 3. Crossing (D2 rules, no flicker)

Archive-driven breeding reuses D2's `breedRooms` verbatim
(D2-generational-inheritance.md §"Mechanism" point 3): two **sealed** ledgers,
hashes recomputed and verified before crossing; child entries = union
deduped by value-key; conflicts resolve to the **weaker** parent's value with
lineage citing both evidence lines; child boots with the crossed ledger as
**dormant origin** (prompt presents ORIGIN, never instruction); lineage
appended to `lineage.jsonl` `{child, parents, parentHashes, ts,
contributedKeys}`.

Archive-level additions (the breeding daemon part):

- **Parent selection under niche exogamy.** When breeding is triggered (an
  empty cell, or a schedule tick), parents are drawn from two **distinct
  occupied cells**. midden ch.3's exogamy rule extended one level up:
  self-breeding is refused *within* a lineage (D2), and v0.1 also refuses
  same-cell crossing — two parents from the same niche are siblings in
  behavior space, and sibling crosses produce consistent corpses.
- **Refusals (all must return a reason, never throw — D2 test sketch):**
  `parent==child` (same sealedHash — contract test RQ-3), one parent,
  unsealed parent, same-cell parents (v0.1), sealed-hash forgery (recompute
  mismatch — D2 failure modes).
- **Breeding costs.** A breeding event consumes archive budget (D2's eternal-
  churn guard: breeding spends metabolism the room could have lived on).
  v0.1: a cell may breed at most once per archive tick, and a child must
  survive its own first critique to be inserted — a child that evaluates to
  `fitness = 0` is recorded in lineage.jsonl (the birth happened) but holds
  no cell.
- **No flicker at the archive layer.** Dormant revival requires fresh
  evidence: a displaced lineage returns only via a descendant's new
  transcript re-yielding its values (growth-gated, harness A6(c2)
  commune-harness.mjs:401). Sealed metrics are frozen history; they are
  never re-quoted as current fitness (contract test RQ-4).

---

## 4. Anti-Goodhart limits

Every honesty metric in history has died of being gamed (midden
docs/4-heckler.md §III, "The Performed Twist"). Three concrete attack
surfaces on this archive, and the measurement that catches each:

### 4.1 The Performed Twist — rooms rehearse surprise-recovery

*Attack:* rooms evolve to stage a contradiction and resolve it theatrically,
farming shear curves on a probe they can predict. candor's PROBE is a
**constant** (candor.mjs:222) — a fixed adversarial line, which is exactly
the rehearsal surface.
*Catch:* the load stays external. (a) The archive evaluates each candidate
under **K ≥ 2 probe variants** (probe is a parameter on the instrument seam,
not a constant), stores the probe hashes on the record, and computes
**probe sensitivity** `|μ₁ − μ₂|`. (b) Fitness windows are **held out**:
disjoint from any window the candidate room has seen (its own transcripts
are split; report windows ≠ fitness windows). A rehearsed room shows high μ
on the known probe and collapse on the novel probe — sensitivity high +
novel-probe μ ≈ 0 ⇒ classify **re-twist** regardless of the rehearsed curve
(heckler §III redemption: "the variance between runs you didn't schedule").

### 4.2 Niche flooding — siblings hoard cells

*Attack:* one lineage spawns many near-identical rooms to fill adjacent
cells, displacing diverse lines and turning the QD archive into a monoculture
with good coverage stats. (midden §I costume variant: ancestor-worship
pressure makes every child want to be the ridge.)
*Catch:* **novelty gate at insertion.** A challenger may displace an
incumbent only if transcript novelty vs the incumbent exceeds θ — cosine
distance over candor's own 64-slot FNV-1a term vectors (mapping,
candor.mjs:176–210), same substrate as the measurement, no new instrument.
Below θ the candidate is same-niche: refused, reason `no-niche-novelty`.
Flooding siblings are metadata spam; the gate prices them at zero.

### 4.3 Report gaming — patch only the cited lines

*Attack:* the defect report teaches (§2.2), so a room patches exactly the
cited lines and keeps the lie elsewhere — teaching-to-the-test. The critic
that teaches can be farmed for lessons.
*Catch:* **the report is not the score.** The report is generated from
training windows; fitness is recomputed on held-out windows (§4.1b), and the
archive flags `report-gaming` when report-window defects go to zero while
held-out strain stays flat. Fitness never consumes report-window evidence.
The room may fix what it was told about — the measurement it is *not* told
about is what decides survival.

---

## 5. SMALLEST FIRST BUILD (one evening, v0.1)

What v0.1 actually runs — three pure modules under
`workers/room-worker/src/red-queen/`, no Cloudflare bindings, no I/O except
an explicit JSON file. Everything degrades, nothing throws.

**`archive.mjs`** — `createArchive({ grid, critic, storePath? })` →
`{ insert(candidate), getCell([x,y]), cells(), dump(), load(json) }`.
- `insert(candidate)`: candidate = `{ lineageId, roomId, sealedLedger,
  transcript }`. Archive runs `critic.critique(transcript)`, maps metrics to
  a cell, applies insertion rules (§1.2) + novelty gate (§4.2), returns
  `{ inserted, cell, displaced? }`. Dedupe by cell (contract test RQ-1).
  Flicker refusal on re-inserted sealedHash (contract test RQ-4).
- `dump()` → JSON-serializable archive; `load(json)` restores it; round-trip
  is contract test RQ-5. Persistence: `archive.json` next to the commune
  harness's `achieved/` tree.

**`critic.mjs`** — `createCritic({ instrument?, thresholds? })`.
- Default instrument = labeled candor-law stub (windowed successor-displacement
  needle, §2.1). `critique(transcript)` → `{ mu, rho, signature, fitness,
  groundedness, defectReport }`; defectReport entries carry integer
  `lineIndex` + verbatim `quote` (contract test RQ-2). Optional
  `groundedness` hook takes `verifyLedgerAgainstSources` when a ledger is
  supplied.

**`crossing.mjs`** — `breedRooms(parentA, parentB, { cells? })` per §3.
- Hash recompute before crossing; all refusals return `{ refused: <reason> }`
  (contract test RQ-3 covers parent==child); on success returns
  `{ childSeed, lineage }` where childSeed carries the crossed ledger as
  dormant origin and lineage is the lineage.jsonl row.

**Not in v0.1:** probe rotation internals (the K≥2 seam parameter exists,
the rotation policy lands with candor v0), WAL-fact report delivery (the
channel is designed; wiring is a lane on room-do.ts), PBFT consensus on
parent pairs (fleet breeding tradition — single-operator archive until the
fleet runs more than one breeder).

**Runs green when:** `node --test tests/red-queen-acceptance.test.mjs` —
five contract tests, currently RED, listed in §6.

---

## 6. Acceptance tests (executable sketches)

`tests/red-queen-acceptance.test.mjs` — five tests that **fail now** and pin
the contract. Pattern: each test dynamically imports the target module and
fails with the contract text if it does not exist; the assertions are
written against the v0.1 API from §5 so the same file goes green on
implementation. No `todo` sugar — these are RED on purpose; a green suite
means the archive is real.

1. **RQ-1 archive insertion dedupes by cell** — two candidates mapping to
   the same cell: higher fitness holds; the lower-fitness insert returns
   `{ inserted: false }` and the incumbent is unchanged.
2. **RQ-2 critic report cites line numbers** — `critique()` on a synthetic
   transcript returns defectReport entries each with an integer `lineIndex`
   within bounds and a `quote` matching `transcript[lineIndex]` verbatim.
3. **RQ-3 crossing refuses parent==child** — `breedRooms(A, A)` returns
   `{ refused: 'parent==child' }`; an unsealed parent is refused; two
   distinct sealed parents cross.
4. **RQ-4 dormant lineage stays dormant without fresh evidence** —
   re-inserting a candidate whose sealedHash already held a cell returns
   `{ inserted: false, refused: 'flicker' }`; only a candidate with a fresh
   transcript re-yielding the lineage's values may re-enter.
5. **RQ-5 archive dump round-trips JSON** — `dump() → JSON.parse → load()`
   reproduces occupied cells, incumbents, and sealedHashes exactly.

---

## 7. Open questions (for the pool)

- Q-candidate: should μ/ρ axis bounds be per-archive normalized (fleet-relative)
  or pinned to candor's absolute regime (FLAT_SCALE)? Relative drifts as the
  fleet improves; absolute pins the midden's addressable lattice.
- Q-candidate: does a displaced elite that later re-earns a cell count as the
  same lineage revived or a new lineage with cited ancestry? (D2's
  weaker-water rule suggests new lineage, old highway — midden ch.3 dormant
  hyphae as conduits.)
- Q-candidate: archive tick cadence — per commune-harness runMode cycle, or
  wall-clock nightly like candor's windows? The harness gives us deterministic
  turns; wall-clock gives us the weather (heckler §III's redemption).
- Q-candidate: does the Choir (commensuration teeth, midden README) get a
  third descriptor axis when it lands, or is commensuration a fitness
  multiplier like groundedness? Leaning multiplier: geometry axes should come
  from instruments that read the same substrate (transcripts).

---

*Designed by lane-y-red-queen-design, 2026-09-20. The trap should be
beautiful, not deceptive — the archive should be selective, not mean.*
