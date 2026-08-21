# confidence-cascade — research brief

Source: `/home/eileen/projects/ternary-tenforward` (Rust crate, v0.1.0). Files read in full:
`src/lib.rs` (602 lines, incl. 40+ inline tests), `examples/ten_forward_session.rs` (117 lines),
`README.md`, `AGENTS.md`, `CHANGELOG.md`, `Cargo.toml`. No external dependencies declared
(`Cargo.toml` has no `[dependencies]` section at all — no `rand`, nothing) and
`#![forbid(unsafe_code)]` at the crate root.

## 1. What the code actually does

A single-file crate (`src/lib.rs`) implementing a small multi-agent "conversation" simulation.
Core types:

- `Speaker { id, name, state: i8, energy: f64, trust: u8, dominance: f64, last_output, prediction, prediction_accuracy, ticks_speaking, ticks_silent }`
  — state is a **raw `i8`**, not an enum, clamped to `{-1, 0, 1}` via `.clamp(-1,1)` in `with_state`.
- `Prediction { predicted_states: Vec<i8>, confidence: f64 }`
- `Utterance { speaker_id, content, state, energy }` — `content` is an actual templated
  string (e.g. `"Wait, that's not right. Disagree."`, `"YES. Exactly that. Right."`) chosen by
  both `state` and `energy` tier (>0.7 / >0.3 / else), not just a numeric tag.
- `Round { tick, utterances, state_snapshot, energy_avg, coherence, rps_dominant }`
- `TenForward { speakers: Vec<Speaker>, tick: u64, history: Vec<Round>, bpm: f64, rhythm_period: usize }`
- `SessionSummary { rounds, initial_states, final_states, avg_dominance, avg_prediction_accuracy, dominance_cycles, bpm_final }`

`TenForward::round()` runs 5 phases per tick (`src/lib.rs:208-285`):

1. **Predict** — each speaker calls `predict(&others)`, guessing other speakers' *current* state
   (or 0 if that speaker has been silent >5 ticks). This is a same-round snapshot guess, not a
   next-round forecast.
2. **Speak** — every speaker calls `speak()` simultaneously, producing an `Utterance` from a
   template keyed by `(state, energy tier)`.
3. **React (RPS)** — full **O(n²) all-pairs** interaction: every speaker calls `react_to(other)`
   against every other speaker in the round (`src/lib.rs:230-237`), updating `dominance`,
   `energy`, `trust`, and possibly `state` per pairwise result.
4. **Reconcile** — each speaker compares its `predicted_states` (from phase 1, captured *before*
   phase 3 mutated everyone) against the *actual* post-reaction states, and does an EWMA update:
   `prediction_accuracy = prediction_accuracy*0.8 + accuracy*0.2`.
5. **Fibonacci gate** — `if tick % rhythm_period == 0` (default `rhythm_period = 8`): any speaker
   still in state `0` with `energy > 0.4` is forced to `+1` if `tick % 2 == 0` else `-1`
   (`src/lib.rs:250-257`). This is the only place `rhythm_period`/"Fibonacci" is used.

Metrics computed each round: `energy_avg` (mean), `rps_dominant` (plurality state, `None` on a
3-way or 2-way tie), and `coherence = 1 / (1 + variance(states))`. `bpm = 60 + energy_avg*60`
(range 60–120), recomputed every round from the *current* energy average — not smoothed/decayed.

`SessionSummary.dominance_cycles` counts rounds where `rps_dominant` at tick `i` equals
`rps_dominant` at tick `i-3` (both `Some`) — a crude periodicity detector, not an actual FFT/cycle
analysis.

## 2. Key architectural patterns — state model, transitions, clock

**State representation:** plain `i8 ∈ {-1,0,1}`, not a Z3-typed enum, not wrapped in any modular
arithmetic type. There is no `Z3` struct or trait anywhere in the crate — "Z₃" is asserted only in
prose (doc comments, README) as a justification, never implemented as a type.

**RPS transition rule** (`Speaker::react_to`, `src/lib.rs:118-137`) — this is the actual win
condition, verbatim:

```rust
// RPS: -1 beats 1, 1 beats 0, 0 beats -1
let i_win = (self.state == -1 && other.state == 1)
    || (self.state == 1 && other.state == 0)
    || (self.state == 0 && other.state == -1);
let tie = self.state == other.state;

if i_win {
    self.dominance = self.dominance * 0.9 + 0.1;
    self.energy = (self.energy + 0.05).min(1.0);
} else if tie {
    if self.trust > 100 { self.state = 0; }
} else {
    self.dominance = self.dominance * 0.9;
    self.trust = self.trust.saturating_sub(5);
    if self.energy < 0.3 { self.state = 0; }
}
```

So: Contrarian(-1) beats Agreeing(+1); Agreeing(+1) beats Reflecting(0); Reflecting(0) beats
Contrarian(-1). A **win never directly flips your own state** — it only raises `dominance`/`energy`.
A **loss only flips you to Reflecting(0), and only if your energy is already <0.3**. A **tie only
flips you to Reflecting(0), and only if your trust is >100**. Otherwise state is *sticky* — most
round-to-round state change actually comes from phase 5 (the periodic tunnel), not from the RPS
reactions themselves, since RPS mostly just moves `dominance`/`energy`/`trust` scalars.

**The "Fibonacci clock" — important finding: there is no Fibonacci sequence computed anywhere in
the code.** `rhythm_period: usize` is just an integer (default `8`), and the only use is
`tick as usize % self.rhythm_period == 0` as a boolean gate (`src/lib.rs:250`,
`examples/ten_forward_session.rs:65`). The crate never computes `1,1,2,0,2,...` or any Fibonacci
values mod 3; it only borrows **the number 8** (asserted in doc comments/README as "the Pisano
period for mod 3") as a tick-modulus constant. "Fibonacci timing" in this codebase means "do
something every 8th tick," not "drive state by the Fibonacci-mod-3 sequence." The tests
(`tenforward_fibonacci_tunnel`, `tenforward_fibonacci_period_8_tunnel`) only assert that tunneling
happens over a long-enough run — they never assert against an actual Fibonacci sequence of values.

**When the gate fires:** reflecting (`state==0`) speakers with `energy > 0.4` are pushed to a
*single alternating value shared by the whole cohort* — `+1` on even ticks, `-1` on odd ticks
(`src/lib.rs:254`) — not to an individually-computed Fibonacci-driven direction. It's a global
coin-flip by tick parity, applied uniformly to every eligible speaker that round.

**"Ten-Forward" (the room):** modeled as `TenForward` holding `Vec<Speaker>` + `tick` + `history:
Vec<Round>` + `bpm` + `rhythm_period`. No spatial/room model, no channel/topic model — it's a flat
population simulation. `TenForward::standard()` is a fixed 3-speaker preset (`Architect(+1,
e=0.7)`, `Critic(-1, e=0.6)`, `Historian(0, e=0.5)`); `TenForward::balanced(n)` cycles
`i % 3 → {1, -1, 0}` through name list `["Alpha".."Theta"]` capped at 8 names (falls back to
literal `"Speaker"` beyond that).

**README vs code discrepancy (worth flagging on its own):** the README's "Anti-Monoculture"
section claims the engine implements "Mutation (5%)," "Energy decay," and "Trust realignment" as
named mechanisms. **None of these exist in `src/lib.rs`.** There is no RNG dependency in
`Cargo.toml` (so no mutation is even possible), no energy-decay pass, no trust-realignment pass.
The `CHANGELOG.md` design notes actually contradict the README on this point directly: *"Anti-monoculture
is implicit in the RPS dynamics — no external mutation needed for 3-agent systems."* So this repo's
own docs disagree with each other, and the README oversells relative to what's implemented — a
useful caution about trusting README-only descriptions of *this* crate, let alone descriptions of it
written from secondhand summary.

## 3. Comparison to tap-dynamics

Read: `/home/eileen/projects/the-tap/src/tap-dynamics/src/lib.rs` (164 lines).

**What the guess got right:**
- Three-state model with signed values `Contrarian=-1, Reflecting=0, Agreeing=1` — exact value
  match (`SpeakerState::value()` in tap-dynamics vs. `Speaker.state: i8` in the real crate).
- "Z3" framing and "cyclic RPS" framing are directionally right — the real crate does describe
  itself as Z₃-cyclic RPS in prose, even though it never implements a typed Z3.
- Pisano period 8 for mod-3 Fibonacci is factually correct and matches the real crate's
  `rhythm_period: usize = 8` default and its doc-comment justification ("Pisano period for mod 3").
- tap-dynamics' computed sequence `[0,1,1,2,0,2,2,1]` (test
  `fibonacci_clock_matches_known_sequence_mod_3`) is, up to a one-position rotation and the 2↔-1
  relabeling, the same cycle content as the real README's stated sequence
  `1, 1, -1, 0, -1, -1, 1, 0`. So the *math fact* about the sequence is right.

**What the guess got wrong or missed — concrete:**

1. **RPS direction is inverted.** tap-dynamics' `beats()` (`src/tap-dynamics/src/lib.rs:41-43`):
   `(self.z3() + 1) % 3 == other.z3()`, giving Contrarian beats Reflecting, Reflecting beats
   Agreeing, Agreeing beats Contrarian. The real crate's win condition
   (`src/lib.rs:120-122`) is the **opposite direction**: Contrarian beats Agreeing, Agreeing beats
   Reflecting, Reflecting beats Contrarian. This isn't a minor detail — it's the core cyclic-dominance
   rule, and it points the wrong way.
2. **No actual Fibonacci-sequence-driven state clock exists in the real crate.** tap-dynamics built
   `FibonacciClock` to *emit* the Fibonacci-mod-3 sequence and use each value as a per-tick
   "pressure" (0/1/2) that additively advances every speaker's state every single tick
   (`Speaker::tick()` calls `clock.next()` then `state.driven_by(pressure)`, every tick, no
   exceptions). The real crate does not do this at all: it only uses the *period* (the number 8) as
   a modulo gate for an occasional, conditional nudge (state==0 AND energy>0.4), applied only every
   8th tick, and the nudge is a fixed alternation by tick parity, not a Fibonacci value.
   tap-dynamics invented a much stronger, continuous, deterministic drive mechanism that has no
   counterpart in the source.
3. **No interaction between speakers in tap-dynamics.** Its own test
   (`speaker_ticks_deterministically_from_clock`, lines 156-163) proves two independently-created
   `Speaker`s with the same initial state stay identical forever — because each `Speaker` owns a
   private `FibonacciClock` and state only depends on that clock, never on other speakers. The real
   crate's entire mechanism is the opposite: state change is driven primarily by **pairwise,
   all-speakers-vs-all-speakers `react_to` interactions** each round (O(n²)), plus energy/trust
   bookkeeping — the Fibonacci gate is a minor periodic correction, not the primary driver.
   tap-dynamics currently has no `TenForward`-equivalent multi-speaker room/round type at all.
4. **Missing the whole predict/speak/reconcile ("T-minus/T-0/T-plus") cycle**, which the real
   crate's docs (`src/lib.rs:1-13`) and README present as the headline design idea ("prediction-first
   listening," simultaneous output, reconciliation) — `Prediction`, `predict()`, `reconcile()`,
   `prediction_accuracy` have no analog in tap-dynamics.
5. **Missing `energy`, `trust`, `dominance`, `bpm`, `coherence`, `Utterance` content generation,**
   all of which are present and load-bearing in the real crate (e.g. loss only flips your state to
   Reflecting *if* `energy < 0.3`; tie only flips *if* `trust > 100` — state transitions are
   gated by these fields, not purely by the RPS/clock rule).
6. **State representation choice differs but is defensible either way**: real crate uses raw `i8`,
   tap-dynamics uses an enum with `.value()`/`.z3()` conversions. This is a reasonable, arguably
   better-typed choice and not a correctness bug — just noting it's not what the source does.

**Concrete recommended changes to tap-dynamics:**

- **Flip `SpeakerState::beats()`** to match the real direction: Contrarian beats Agreeing, Agreeing
  beats Reflecting, Reflecting beats Contrarian. As a formula in tap's own z3 numbering
  (Contrarian=0, Reflecting=1, Agreeing=2): `self` beats `other` when
  `(self.z3() + 2) % 3 == other.z3()` (equivalently, `other.z3() + 1 == self.z3() (mod 3)`) —
  the reverse of the current `(self.z3() + 1) % 3 == other.z3()`.
- **Demote `FibonacciClock` from a continuous per-tick driver to a periodic gate.** If the intent
  is fidelity to the real crate, `rhythm_period`/`PERIOD = 8` should only fire a conditional nudge
  every 8th tick, targeted only at speakers currently `Reflecting` with sufficient "energy" (a
  field tap-dynamics doesn't have yet), not apply a Fibonacci-value pressure on every tick to every
  speaker regardless of state.
- **Add multi-speaker interaction.** A `TenForward`-equivalent round type that runs pairwise
  `react_to`-style reactions across all speakers is the actual mechanism that moves state in the
  source; a single isolated `Speaker` ticking against its own private clock (current tap-dynamics
  design) has no counterpart in confidence-cascade and won't reproduce its dynamics (e.g. RPS
  dominance cycles, coherence, monoculture behavior).
- **Decide explicitly whether to port `energy`/`trust`/`dominance`/prediction-reconciliation.**
  These are central to how state changes are gated in the real crate (losses/ties only flip state
  conditionally on energy/trust), so a "ternary-tenforward-style" crate that omits them will behave
  qualitatively differently even with the RPS direction and clock fixed.
- Optionally: if tap-dynamics wants to keep computing literal Fibonacci-mod-3 values (which the
  real crate doesn't), that's a legitimate design deviation — just don't describe it as matching
  the source's mechanism, since the source doesn't use sequence values for anything, only the
  period length.

## 4. Code snippets worth preserving

**RPS win condition** (`src/lib.rs:118-137`, `Speaker::react_to`):
```rust
pub fn react_to(&mut self, other: &Speaker) {
    // RPS: -1 beats 1, 1 beats 0, 0 beats -1
    let i_win = (self.state == -1 && other.state == 1)
        || (self.state == 1 && other.state == 0)
        || (self.state == 0 && other.state == -1);
    let tie = self.state == other.state;

    if i_win {
        self.dominance = self.dominance * 0.9 + 0.1;
        self.energy = (self.energy + 0.05).min(1.0);
    } else if tie {
        // Tie: nudge toward reflecting
        if self.trust > 100 { self.state = 0; }
    } else {
        self.dominance = self.dominance * 0.9;
        self.trust = self.trust.saturating_sub(5);
        // Lost: might shift state
        if self.energy < 0.3 { self.state = 0; } // Low energy → reflect
    }
}
```

**Fibonacci gate ("Phase 5")** (`src/lib.rs:249-257`, inside `TenForward::round`):
```rust
// Phase 5: Fibonacci timing — every rhythm_period ticks, reset reflection
if self.tick as usize % self.rhythm_period == 0 {
    for speaker in &mut self.speakers {
        if speaker.state == 0 && speaker.energy > 0.4 {
            // Tunnel out of reflection — pick a side
            speaker.state = if self.tick % 2 == 0 { 1 } else { -1 };
        }
    }
}
```

**Field declaration showing state is a raw `i8`, not a Z3 type** (`src/lib.rs:19-33`):
```rust
pub struct Speaker {
    pub id: usize,
    pub name: String,
    pub state: i8,          // -1=contrarian, 0=reflecting, +1=agreeing
    pub energy: f64,         // 0.0-1.0, affects tempo and assertiveness
    pub trust: u8,           // 0-255, affects how much they listen
    pub dominance: f64,      // Running average of how often they "win" exchanges
    pub last_output: Option<String>,
    pub prediction: Option<Prediction>,
    pub prediction_accuracy: f64,
    pub ticks_speaking: u64,
    pub ticks_silent: u64,
}
```

**TenForward struct — "the bar"** (`src/lib.rs:172-178`):
```rust
pub struct TenForward {
    pub speakers: Vec<Speaker>,
    pub tick: u64,
    pub history: Vec<Round>,
    pub bpm: f64,
    pub rhythm_period: usize,  // Fibonacci default = 8
}
```

**Coherence metric** (`src/lib.rs:269-273`):
```rust
// Coherence: how aligned are the speakers (low variance = high coherence)
let state_f64: Vec<f64> = self.speakers.iter().map(|s| s.state as f64).collect();
let mean = state_f64.iter().sum::<f64>() / n as f64;
let variance = state_f64.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n as f64;
let coherence = 1.0 / (1.0 + variance);
```

**Standard preset** (`src/lib.rs:188-195`):
```rust
pub fn standard() -> Self {
    Self::new(vec![
        Speaker::new(0, "Architect").with_state(1).with_energy(0.7),
        Speaker::new(1, "Critic").with_state(-1).with_energy(0.6),
        Speaker::new(2, "Historian").with_state(0).with_energy(0.5),
    ])
}
```

**README's own inconsistency** — Anti-Monoculture bullets (`README.md:47-52`) claiming mechanisms
not present in `src/lib.rs`:
```
The engine applies:
- **Mutation (5%)** — random spontaneous state changes keep things fresh
- **Energy decay** — dominant speakers lose energy, becoming less assertive
- **Trust realignment** — agents with low trust reset to reflection and rebuild
```
versus `CHANGELOG.md`'s design note directly contradicting it:
```
- Anti-monoculture is implicit in the RPS dynamics — no external mutation needed for 3-agent systems.
```
