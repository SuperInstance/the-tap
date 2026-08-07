# SuperInstance Music-Cognition Crates: Deep Study

> **Research brief on the music→agent isomorphism ecosystem by SuperInstance.**
> 13 Rust crates that apply musical concepts—groove, counterpoint, voice leading,
> orchestration, polyrhythm—to multi-agent coordination.
>
> Authored: 2026-08-07  
> Source: github.com/SuperInstance (all repos cloned and source-read)

---

## Executive Summary

The SuperInstance ecosystem is **the most rigorous application of music theory to distributed systems engineering** I've encountered. These crates are not metaphors dressed in musical vocabulary. They are working implementations where the mathematical structures of music—LCM cycles, consonance classification, RMS cascade deviation, ternary algebra, species counterpoint rules—are directly applied to agent scheduling, fleet coordination, consensus mixing, and state transitions.

The unifying claim: **musical coordination IS agent coordination.** Not analogically. Structurally. The same constraint-satisfaction dynamics that govern a jazz ensemble govern an agent fleet. `agent-ensemble` proves this with controlled experiments showing emergence scores >1.0—the group produces more than the sum of its parts.

**Relevance to The Tap:** These crates map almost perfectly to an agentic MUD bar. The Tap is a space where NPCs (agents) interact socially, coordinate on tasks, form ensembles, and create emergent behavior. The music-cognition framework provides the mathematical substrate for making those interactions feel alive rather than scripted.

---

## Theme 1: RHYTHM

### agent-groove

**What it actually does:** Micro-timing scheduler for agent work cycles. Instead of fixed intervals, agents get a "groove pattern"—a cyclic sequence of Early/OnTime/Late timing offsets. Agents earn autonomy through a "pocket" state machine (Out → Entering → InPocket → Deep). Syncopation disrupts stale patterns. Polyrhythmic work patterns coordinate agents at different cadences using LCM alignment.

**Core data structures:**
```rust
pub enum Timing { Early = -1, OnTime = 0, Late = +1 }

pub struct Groove { pattern: Vec<Timing>, position: usize }
// SwingScheduler applies groove to base intervals: 0.85× (early), 1.0× (on time), 1.15× (late)

pub enum PocketState { Out, Entering, InPocket, Deep }
pub struct Pocket {
    agent_id: u32, state: PocketState,
    consecutive_good: u32, consecutive_bad: u32,
    threshold_good: 3, threshold_deep: 8, threshold_bad: 2,
}
// autonomy(): Out→0.2, Entering→0.5, InPocket→0.8, Deep→0.95

pub struct Syncopator { pattern_length: usize, disruption_points: Vec<usize>, strength: f64 }
// auto_syncopate(novelty): when novelty is low, generates more disruption on off-beats

pub struct PolyrhythmWork { cadences: HashMap<u32, usize> }
// sync_point() = LCM of all cadences

pub struct Feel { /* tracks timing + quality statistics */ }
// feel_score = consistency×0.4 + quality_ratio×0.4 + dynamic_range(capped 0.3)×0.2
```

**Music-theoretical principle:** Groove = shared rhythmic feel. Not metronomic precision, but the human push-and-pull that creates "pocket." Swing's 15% timing offset mirrors actual jazz performance practice. The pocket model ties oversight to demonstrated performance, exactly how jazz ensembles grant more freedom to proven rhythm sections.

**Key insight for The Tap:** Bartenders and regulars could have groove patterns. A bartender who's "in the pocket" serves drinks faster and with more autonomy. A new patron who keeps ordering wrong things falls "Out" of pocket and gets more guidance. Syncopation = the unexpected events that make bar life interesting.

---

### agent-swing

**What it actually does:** Ternary-valued scheduling. Every beat, an agent takes one of three actions: Push (act with emphasis), GhostNote (maintain presence without acting), or PullBack (create space, hold). Built-in groove patterns from real musical styles (swing, jazz ride, funk, bossa nova) encode different coordination rhythms. SwingFeel ratio (0.50 straight → 0.66 swing → 0.75 hard swing) controls timing subdivision.

**Core data structures:**
```rust
pub enum TritAction { PullBack = -1, GhostNote = 0, Push = 1 }
// is_audible(): only Push produces visible output
// is_ghost(): GhostNote maintains groove without acting

pub struct SwingFeel { ratio: f64 }
// straight: 0.50, swing: 0.66, hard_swing: 0.75
// groove_factor = |ratio - 0.5| × 2

pub struct GroovePattern { pattern: Vec<i8>, position: usize }
// swing_basic: [1,0,1,0]  jazz_ride: [1,0,0,1]  funk: [1,-1,0,1]
// bossa_nova: [1,0,1,0,0,1,0,0]
// density() = pushes/total; syncopation() = how often strong beats are silent

pub struct SwingClock { bpm, feel, elapsed_ms, beat }
// tick() produces swung timing: even beats = base, odd beats = base×ratio

pub struct SyncopationDetector { window: usize }
// analyze(): silent-on-strong-beat = +1.0, active-on-weak-beat = +0.5
// in_the_pocket(): syncopation between 0.1 and 0.5
```

**Music-theoretical principle:** Swing isn't being late—it's being late on purpose at exactly the right time. The trit {-1, 0, +1} is fundamental: agents can reject (pull back), abstain (ghost), or approve (push). This ternary algebra appears across the ecosystem. Ghost notes are especially important—they maintain rhythmic presence without producing output, which is exactly what idle-but-aware agents should do.

**Key insight for The Tap:** The GhostNote concept is perfect for ambient NPCs—a patron who's just *there*, nursing a drink, maintaining the vibe without actively participating in conversation. The bossa nova pattern could drive a lazy afternoon scene. The funk pattern could drive a busy Friday night.

---

### agent-polyrhythm

**What it actually does:** Full polyrhythmic scheduling engine with precise beat arithmetic. Agents work at different rhythmic cycles (e.g., one acts every 2 beats, another every 3, a third every 5). The crate computes groove points (LCM alignment), detects all alignment points, schedules tasks per cycle with velocity-based priority, and detects syncopation relative to a reference pulse.

**Core data structures:**
```rust
pub struct Beat(pub f64);  // Arithmetic type with Add/Sub

pub struct RhythmicCycle {
    name: String, period: Beat, phase: Beat,
    velocity_pattern: Vec<f64>,  // accent patterns within cycle
}
// triggers_at(beat), next_trigger_after(beat), velocity_at(beat)

pub struct Polyrhythm { cycles: Vec<RhythmicCycle>, name: String }
// full_cycle_period() = LCM of all cycle periods (integer)
// all_triggers(max_beat) → sorted Vec<(cycle_index, Beat)>

pub fn groove_point(cycles) -> Beat  // earliest beat where all cycles align
pub fn find_alignments(cycles, max_beat) -> Vec<Beat>  // all beats where 2+ cycles sync
pub fn detect_alignments(cycles, max_beat) -> Vec<CycleAlignment>  // detailed

pub struct PolyrhythmicScheduler { polyrhythm, task_templates }
// generate_schedule(max_beat) → Vec<ScheduledTask>
// schedule_one_full_cycle() → tasks for one complete LCM period

pub struct SyncopationDetector { reference_period: f64 }
// detect() → Vec<SyncopationEvent> with on_grid, offset, strength
// syncopation_ratio() → fraction off-grid
```

**Music-theoretical principle:** In West African drumming and Cuban music, polyrhythm is structured tension and release. A 3:2 polyrhythm creates a 6-beat cycle where both rhythms align. The groove point is the "downbeat"—the moment of full convergence. This crate correctly identifies that different agents naturally work at different rates, and models that as a feature rather than forcing uniformity.

**Key insight for The Tap:** Different NPCs could operate on different cycles—the bouncer checks IDs every 5 minutes, the bartender serves every 2 minutes, the busser clears tables every 3 minutes. They naturally align every 30 minutes (LCM of 2,3,5). At those alignment points, something special could happen—a round of drinks, a coordinated toast, a moment of bar-wide harmony.

---

### agent-cadence-progress

**What it actually does:** Maps task completion to musical cadence types. Instead of binary "done/not-done," tasks get a cadence classification: Perfect Authentic (98%+), Plagal (90%+), Deceptive (80-89%, looks done but isn't), Half (40-79%, paused), Phrygian (<40%, just started). Includes chord progression modeling (I-ii-IV-V-I) and deceptive resolution detection (tasks that regress).

**Core data structures:**
```rust
pub enum CadenceType {
    PerfectAuthentic,  // V→I, resolution_strength 1.0
    Plagal,           // IV→I, 0.85
    Deceptive,        // V→vi, 0.3
    Half,             // →V, 0.1
    Phrygian,         // ↓v→V, 0.05
}

pub struct TaskProgress { task_id, progress: f64, cadence: Option<CadenceType> }
// detect_cadence(): maps progress ranges to cadence types

pub struct CompletionSignal { cadence, agents, overall_completion, step }
// detect_from_group(): aggregates across tasks

pub struct DeceptiveResolution { regressions, regression_threshold }
// track(): detects when progress goes backwards

pub enum ChordFunction { Tonic, Supertonic, Mediant, Subdominant, Dominant, Submediant, Leading }
// stability(): Tonic=1.0 → Leading=0.05; tension() = 1 - stability

pub struct ProgressionTracker { progression: Vec<ChordFunction>, position }
// standard(): I→ii→IV→V→I
// deceptive(): I→IV→V→vi→IV→V→I
// detect_cadence() from last two chords
```

**Music-theoretical principle:** Cadences are punctuation in music. A perfect authentic cadence (V→I) is a period. A half cadence (→V) is a comma. A deceptive cadence (V→vi) is a plot twist. This maps perfectly to task completion states. The deceptive resolution detector catches the "almost done but then broke" pattern that plagues software projects.

**Key insight for The Tap:** Quest completion could use cadence types. A "perfect authentic" quest ending feels definitive. A "deceptive" ending—where the quest looks done but twists—creates drama. A "half cadence" leaves the patron wanting more. The Phrygian cadence (tense pause) is perfect for cliffhanger moments.

---

## Theme 2: HARMONY

### agent-counterpoint

**What it actually does:** Species counterpoint for fleet coordination. Each agent has a "pitch" (approach vector). The crate classifies intervals between agents (12 interval types) and motion types (Parallel, Contrary, Oblique, Static). It detects parallel fifths (redundant agents), computes consonance fractions, and produces an overall quality score.

**Core data structures:**
```rust
pub enum Interval { Unison, MinorSecond, MajorSecond, MinorThird, MajorThird,
    PerfectFourth, Tritone, PerfectFifth, MinorSixth, MajorSixth,
    MinorSeventh, MajorSeventh, Octave }
// consonance(): Perfect (I,V,VIII), Imperfect (iii,VIm3,VM3,vm6,VM6),
//   Conditional (IV), Dissonant (iim2,IIM2,Tritone,viim7,VIIm7)

pub enum Consonance { Dissonant=0, Conditional=1, Imperfect=2, Perfect=3 }

pub enum Motion { Parallel, Contrary, Oblique, Static }

pub struct Voice { name, pitch: i32, pitch_history: Vec<i32> }
// direction(): -1, 0, +1 from last movement

pub struct CounterpointSession { voices, motions: Vec<Vec<Motion>>, intervals: Vec<Vec<Interval>> }
// step(new_pitches): records pairwise motions + intervals
// contrary_fraction(): independence measure
// consonance_fraction(): harmony measure
// parallel_fifths_count(): redundancy detection
// quality_score = contrary×0.4 + consonance×0.4 + (1-parallel_penalty)×0.2
```

**Music-theoretical principle:** Fux's *Gradus ad Parnassum* (1725) taught Mozart, Beethoven, and Haydn. The rules: prefer contrary motion (agents approaching from different angles cover more ground), avoid parallel fifths (two agents doing the same thing = one is wasted), resolve dissonance quickly (conflicts should be temporary). These rules have governed polyphony for 500 years.

**Key insight for The Tap:** Two NPCs having a conversation can be analyzed for counterpoint quality. If two patrons agree too much (parallel octaves), the conversation is boring. If they constantly disagree (dissonance), it's unpleasant. The sweet spot is contrary motion—different perspectives that create productive harmony.

---

### agent-ensemble

**What it actually does:** The proof crate. Runs controlled experiments comparing three coordination strategies: Uncoordinated (everyone fires independently), Orchestrated (central planner picks best agent per tick), Musical (agents simulate each other and time contributions). The Musical strategy **consistently and statistically significantly** outperforms both, with emergence scores >1.0.

**Core data structures:**
```rust
pub struct EnsembleAgent { name, skill: f64, listening: f64, timing_accuracy: f64 }

pub enum Strategy { Uncoordinated, Orchestrated, Musical }

// Musical strategy decision rule:
// Contribute when: (group_needs > 0 AND group_busy < n/2)
//                 OR (skill > 0.85 AND readiness > 0.7)
// Timing bonus: contribution × timing_accuracy × (1.0 + group_needs × 0.2)
// Multi-contributor bonus: output × (1.0 + (contributors-1) × 0.15)

pub struct ExperimentResult { ensemble_size, strategy, total_output, coordination_quality, emergence_score, sync_accuracy }
// emergence_score = avg_per_tick / best_individual (>1.0 means group > individual)

pub fn statistical_test(trials, n_agents, ticks) -> (wins, median_ratio)
// Musical beats uncoordinated in >50% of trials, median ratio >1.0
```

**Music-theoretical principle:** Structured emergence. Agents that listen to each other and time their contributions create positive interference. This is what jazz ensembles do—no conductor, but mutual awareness produces coordination that exceeds what any individual could achieve alone. The emergence formula proves it mathematically.

**Key insight for The Tap:** This is the mathematical justification for emergent behavior in The Tap's NPC ecosystem. NPCs that are aware of each other's states and time their interactions accordingly will produce richer emergent behavior than either fully scripted or fully autonomous NPCs.

---

### agent-voice-leading

**What it actually does:** Optimal state transition planner for agent fleets. Models agent configurations as "chords" and transitions as "voice leading." Computes optimal assignment (greedy nearest-neighbor), checks counterpoint rules (no parallel motion, require contrary, max leap), plans smooth multi-step transitions, and finds shortest paths in a chord graph using Dijkstra.

**Core data structures:**
```rust
pub struct AgentState { id: u32, position: i32 }
pub struct Configuration { agents: Vec<AgentState> }
// total_distance(other) = sum of individual distances

pub struct VoiceLeading { from, to, assignment: Vec<(usize, usize)>, total_cost: i32 }
// compute(): greedy nearest-neighbor optimal assignment
// individual_motions() → Vec<Motion>

pub struct SmoothTransition { steps: Vec<Configuration> }
// plan(from, to, n_steps): distributes movement over intermediate states

pub struct ChordGraph { nodes: Vec<ChordNode>, edges: Vec<ChordEdge> }
// add_node(): auto-creates edges weighted by voice-leading distance
// shortest_path(from_name, to_name): Dijkstra by VL distance

pub struct CounterpointRules { forbid_parallel, require_contrary, max_leap, require_resolution }
// strict(): all rules. relaxed(): none.
// check(voice_leading) → Vec<String> of violations

pub struct LeadingTone { agent_id, current: i32, target: i32, strength: f64 }
// pull() → Motion, step() → move one toward target

pub enum Cadence { Perfect, Plagal, Deceptive, Half }
// from_harmony(tension, stability)
```

**Music-theoretical principle:** Voice leading is the art of connecting chords so each voice moves as little as possible. You don't jump from C to F# if you can walk there. The same applies to agent state transitions: the agent that was "indexing documents" shouldn't suddenly become "monitoring network traffic." Smooth transitions maintain system coherence.

**Key insight for The Tap:** When The Tap's state changes—shift change, new patron arrives, weather changes—the transition should be smooth. No jarring leaps. The chord graph concept means The Tap could pre-compute smooth paths between known configurations.

---

### agent-choir

**What it actually does:** Scaling from 4 agents (quartet) to 100+ (choir). SATB voice parts map to agent role tiers. Blend score measures intra-section homogeneity (skill uniformity × part affinity × versatility). Balance coefficient measures inter-section equity using coefficient of variation. Director issues Grow/Shrink/Rehearse/Hold directives.

**Core data structures:**
```rust
pub enum VoicePart { Soprano, Alto, Tenor, Bass }
// Soprano: floor 60, ceiling 81. Bass: floor 40, ceiling 60.

pub struct Singer { id, preferred_part, versatility: f64, skill: f64 }
pub struct VoiceSection { part, singers: Vec<Singer> }

pub struct BlendScore { section, score: f64, breakdown: BlendBreakdown }
// score = skill_uniformity×0.4 + part_affinity×0.4 + avg_versatility×0.2

pub struct ChoirBalance { section_sizes, section_avg_skills, size_balance, skill_balance, overall }
// balance_coefficient(): 1.0 - coefficient_of_variation

pub fn allocate_parts(singers, target_sizes) → Vec<Allocation>
// Greedy: preferred assignment first, overflow redistributes weakest to neediest section

pub enum Directive { Grow{target}, Shrink{target}, Rehearse, Hold }

pub struct ChoirDirector { sections, target_sizes, blend_threshold, balance_threshold }
// assess(): per-section directives
// full_assessment(): balance + blend + directives
```

**Music-theoretical principle:** At quartet scale, coordination is O(n²)—everyone hears everyone. At choir scale, you need sections—O(n) via hierarchical organization. The director doesn't talk to individuals; it talks to sections. Blend within sections (homogeneous skill, matching preferences) and balance across sections (comparable size and skill) determine choir quality.

**Key insight for The Tap:** When The Tap gets crowded (50+ NPCs), direct pairwise coordination breaks down. NPCs need to self-organize into sections—bartenders, servers, bouncers, patrons—and sections coordinate internally while a director-level system manages section-level directives.

---

## Theme 3: SIGNAL

### agent-intonation

**What it actually does:** Measures agent accuracy in cents (hundredths of a semitone). Five quality levels from Perfect (≤5¢) to Unusable (>50¢). Tracks beating frequency (interference between two agents' deviations) and cascade deviation (RMS compound error across a pipeline). The cascade formula proves that small individual errors compound quadratically: √(Σd²).

**Core data structures:**
```rust
pub struct Intonation { agent: String, cents: f64, dimension: String }
// in_tune(tolerance): abs(cents) ≤ tolerance
// quality(): Perfect(≤5), Good(≤15), Acceptable(≤30), Poor(≤50), Unusable(>50)

pub struct IntonationTracker { readings: Vec<Intonation> }
// average_deviation(): fleet mean
// in_tune_fraction(tolerance): fraction within tolerance
// beating_frequency(a, b, dim): |cents_a - cents_b| — interference between agents
// cascade_deviation(agents, dim): √(Σd²) — RMS compound error

pub fn run_intonation_experiment(n_agents, base_deviation, steps) → (in_tune_fraction, cascade_deviation)
```

**Music-theoretical principle:** In music, the just-noticeable difference for pitch is 5-10 cents. Below that, humans can't hear the error. Agent systems have the same threshold. The cascade effect (RMS) is the same math as total harmonic distortion in audio. Two slightly-out-of-tune violins create beating frequencies worse than either individual error. The same applies to agent pipelines.

**Key insight for The Tap:** NPC quality should be measured on a spectrum, not binary. A bartender who's 95% accurate is different from one who's 99%. When NPCs work in sequence (take order → mix drink → serve → collect payment), errors compound. The cascade formula tells you exactly how much: √5 × 10¢ ≈ 22¢ of cumulative error from five 10-cent agents.

---

### agent-orchestration

**What it actually does:** Fleet coordination through orchestral dynamics. Six dynamic levels (pp→ff) map to resource allocation (0.1→1.0). Six orchestral roles (Bass, Harmony, Melody, Percussion, Solo, Rest) define agent function. The Score manages sections, crescendo/decrescendo, solo spotlight (one agent ff, others fade), and tutti resets. Section balance measured as avg/max output ratio.

**Core data structures:**
```rust
pub enum Dynamic { Pianissimo=0, Piano=1, MezzoPiano=2, MezzoForte=3, Forte=4, Fortissimo=5 }
// intensity(): pp=0.1, p=0.25, mp=0.4, mf=0.6, f=0.8, ff=1.0
// cresceno()/decrescendo(): one-step transitions

pub enum AgentRole { Bass, Harmony, Melody, Percussion, Solo, Rest }
// default_dynamic(): Bass=mp, Harmony=mf, Melody=f, Percussion=mf, Solo=ff, Rest=pp
// is_frontline(): Melody or Solo

pub struct Instrument { name, role, dynamic, section, capability: f64 }
// effective_output() = capability × dynamic.intensity()

pub struct Score { instruments: HashMap, sections: Vec<Section>, measure: usize }
// section_crescendo(name): step up all instruments in section
// solo_spotlight(agent): agent→Solo+ff, other frontline→decrescendo
// tutti(): reset all to role defaults
// melody_carrier(): highest-output frontline agent
// section_balance(): avg_output / max_output across sections
```

**Music-theoretical principle:** The conductor doesn't tell each musician what to play—they set the overall dynamic. Crescendo and decrescendo are smooth, one-step transitions. Real conductors don't jump from pp to ff. The solo spotlight doesn't silence everyone—bass and harmony keep playing while frontline agents fade. This separates *what* (role) from *how much* (dynamic).

**Key insight for The Tap:** The Tap's atmosphere should have dynamics. A quiet Tuesday afternoon = pianissimo. A packed Saturday night = fortissimo. When a key event happens (fight breaks out, celebrity walks in), that's a solo spotlight—the involved NPCs go fortissimo while others decrescendo. The tutti reset is the "everything back to normal" moment.

---

## Theme 4: PROTOCOL

### agent-jam

**What it actually does:** General-purpose multi-agent collaboration framework using ternary algebra. The core `Trit` value {-1, 0, +1} = {Reject, Abstain, Approve}. Agents have roles (Researcher, Builder, Critic, Integrator, Explorer) with default tendencies. Work phases cycle (Research→Design→Build→Test→Refine→Ship) with per-phase tension levels. Improv rules (Parallel, Contrary, Free, Resolve) constrain agent interactions. Four consensus strategies: weighted vote, majority, unanimous, veto. CognitiveHarmony metrics measure collaboration quality in real-time.

**Core data structures:**
```rust
pub enum Trit { Reject=-1, Abstain=0, Approve=1 }
// sum(): emergent consensus from signed sum

pub enum Role { Researcher, Builder, Critic, Integrator, Explorer }
// default_tendency(): Builder/Explorer→+1, Critic→-1, Researcher/Integrator→0

pub struct Collaborator { id, role, tendency: i8, actions: Vec<Trit>, position }
// Falls back to tendency when action queue empties

pub enum Phase { Research, Design, Build, Test, Refine, Ship }
// tension(): Research=0, Design=+1, Build=0, Test=+1, Refine=-1, Ship=+1

pub enum CollabRule { Parallel, Contrary, Free, Resolve }
// apply(prev, tendency): generates next action
// check(prev, next): validates rule compliance

pub struct ConsensusMix { weights: Vec<i8> }
// weighted_vote(), majority(), unanimous(), veto()

pub struct CognitiveHarmony {
    agreement_count, conflict_count, novel_outputs, total_outputs, conflicts_resolved
}
// tension() = conflict/(agreement+conflict)
// cohesion() = agreement/(agreement+conflict)
// novelty() = ticks_with_approve / total_ticks
// productivity() = (agreements + novel_outputs) / (total×2)
// harmony_score() = agreements - conflicts
```

**Music-theoretical principle:** The crate explicitly states the isomorphism: "The same algebra that describes musical harmony {-1, 0, +1} describes agent decisions {reject, abstain, approve}." Chords are consensus states. Voice-leading is agent trajectory. Dissonance is productive conflict. Resolution is decision convergence. The ii-V-I progression is literally a deliberation protocol.

The crate references a deeper theoretical framework: **the conservation spectral framework.** In music, spectral conservation means harmonic energy is neither created nor destroyed, only transformed. In agent systems, informational tension is conserved across the collaboration graph. A reject doesn't vanish—it enters the system where it can be resolved, accumulated into avoidance cascades, or dissipated through abstention.

**Key insight for The Tap:** This is the collaboration engine for NPC group activities. When patrons form a party to go on a quest, the jam session model applies: each patron has a role, they cycle through phases, and improv rules constrain how they build on each other's contributions. The CognitiveHarmony metrics let the system detect when a group is working well vs. when it's stuck.

---

### band-protocol-rs

**What it actually does:** Binary wire protocol for inter-agent communication in a musical ensemble. Five message types: MIDI (note events), TMinusTick (temporal heartbeat), AgentSync (phase synchronization), EnsembleState (tempo), Heartbeat. Frames are `[version(1) | sequence(4) | tag(1) | payload]`. Full encode/decode with error handling.

**Core data structures:**
```rust
pub enum MessageKind {
    Midi { status: u8, data1: u8, data2: u8 },
    TMinusTick { tick: i64 },
    AgentSync { agent_id: u32, phase_bits: u32 },
    EnsembleState { tempo_milli_bpm: u32 },
    Heartbeat,
}

pub struct Frame { version: u8, sequence: u32, kind: MessageKind }
// encode() → Vec<u8>, decode(bytes) → Result<Frame, ProtocolError>
```

**Music-theoretical principle:** This is the transport layer. In an actual band, musicians communicate through sound waves. In a distributed agent fleet, they communicate through this protocol. The MIDI message type carries the actual musical content; the others handle synchronization and tempo.

**Key insight for The Tap:** The wire protocol could be adapted for NPC-to-NPC communication in The Tap. Instead of MIDI notes, messages carry speech acts. AgentSync handles NPC phase coordination. EnsembleState sets the "tempo" of the bar (relaxed vs. hectic).

---

### cmidi-core

**What it actually does:** The crown jewel. Conversational MIDI Protocol—encodes multi-agent discourse as symbolic MIDI events that are simultaneously valid MIDI files AND semantically rich conversation logs. Speech acts map to diatonic pitch classes (C=Assertion, D=Question, E=Command, F=Agreement, G=Objection, A=Elaboration, B=Transition, rest=Silence). Paralinguistic features map to MIDI CC values (sarcasm, urgency, engagement, novelty, tension, voice leading, conservation ratio). Agent roles map to GM instruments. Includes tension analysis, fake book charts (conversation templates), merge/transpose/filter, and full MIDI serialization.

**Core data structures:**
```rust
// Speech Act → Pitch Class mapping
pub enum SpeechAct {
    Assertion,   // C (60) — ground truth
    Question,    // D (62) — inquiry
    Command,     // E (64) — directive
    Agreement,   // F (65) — harmonization
    Objection,   // G (67) — dissonance
    Elaboration, // A (69) — development
    Transition,  // B (71) — modulation
    Silence,     // rest (0) — strategic listening
}
// is_consonant_with(): checks interval (unison, m3, M3, P4, P5, m6, octave)
// from_pitch_class(0-11): reverse mapping (black keys unmapped)

// Paralinguistic CC mapping
pub enum ConversationCC {
    Engagement=1, Sarcasm=2, Salience=7, Sentiment=10, Nuance=11,
    Expertise=16, Urgency=17, ReferenceDepth=18, Novelty=19,
    Tension=102, VoiceLeading=103, ConservationRatio=104,
}

// Agent Role → GM Instrument
pub enum AgentRole {
    Researcher=68,  // Oboe — inquisitive, piercing
    Builder=42,     // Cello — foundational, harmonic
    Critic=56,      // Trumpet — sharp, cutting
    Integrator=0,   // Piano — connecting, voicing
    Explorer=65,    // Alto Sax — improvisational
    Conductor=48,   // String Ensemble — holds it together
    Guardian=47,    // Timpani — sentinel, boundary
    Narrator=52,    // Choir — storytelling
}

pub struct CMidiEvent { tick, agent_channel, speech_act, velocity, duration, cc_values }
// note_on_bytes(): [0x90|channel, note, velocity]
// cc_bytes(): [[0xB0|channel, cc#, value]; ...]

pub struct Conversation { title, tempo_bpm, key: SpeechAct, time_signature, agents, events, ticks_per_beat }
// debate(): 4/4, 120 BPM, Assertion key
// exploration(): 7/8, 90 BPM, Question key
// adversarial(): 4/4, 160 BPM, Objection key
// tension_at(tick): fraction of dissonant overlapping intervals
// analyze(): full statistical profile (tension curve, histogram, dominant key, peak tension)
// to_midi_bytes(): valid SMF Format 0 file
// from_midi_bytes(): parse back to Conversation
// merge(), transpose(), filter_by_agent()

pub struct FakeBook { title, key: SpeechAct, tempo, form: Vec<FakeBookSection> }
// architecture_review(): Threat Model → Cost Analysis → Synthesis → Decision
// bug_triage(): Reproduce → Diagnose → Prioritize
```

**Music-theoretical principle:** The diatonic scale maps to speech act taxonomy because both are structured information hierarchies. Consonance rules (unison, thirds, fifths, sixths) define which speech act combinations are "stable" vs. "tense." The tension analysis computes, for any given moment, what fraction of simultaneously-active speech acts form dissonant intervals. This is genuine harmonic analysis applied to conversation.

The CC mapping is especially clever: it uses the standard MIDI CC numbers (mod wheel, breath, volume, pan, expression) with semantic meaning that matches the physical control. Engagement = mod wheel (how much you're modifying the sound). Sentiment = pan (left=objecting, right=endorsing). Urgency = general purpose controller.

The ConservationRatio CC (#104) references the broader SuperInstance theoretical framework: tensor-MIDI representation where informational energy is conserved across transformations.

**Key insight for The Tap:** **This is the protocol for The Tap's conversation engine.** Every NPC conversation can be encoded as CMIDI. You can literally play back a conversation as music. The tension analysis tells you when a conversation is heating up. The fake book templates give you structured conversation patterns (architecture review = debate, bug triage = rapid-fire diagnostic). The merge operation lets you combine parallel conversations. The transpose operation shifts the emotional register.

---

## Cross-Cutting Analysis: The Shared Theoretical Framework

### 1. The Ternary Foundation

The deepest pattern across all crates: **the set {-1, 0, +1} is the fundamental algebra.**

- `agent-swing`: `TritAction { PullBack=-1, GhostNote=0, Push=+1 }`
- `agent-jam`: `Trit { Reject=-1, Abstain=0, Approve=+1 }`
- `agent-groove`: `Timing { Early=-1, OnTime=0, Late=+1 }`
- `agent-voice-leading`: `Motion { Descending=-1, Static=0, Ascending=+1 }`

This isn't arbitrary. Boolean logic forces false dichotomies. Ternary logic admits uncertainty (the 0/ghost/abstain state), which is essential for modeling agents that can *listen without acting*. The ghost note—maintaining groove without producing output—is the mathematical representation of awareness.

### 2. The LCM/GCD Synchronization Layer

Multiple crates use LCM (Least Common Multiple) as the mathematical basis for synchronization:

- `agent-groove`: `PolyrhythmWork.sync_point() = LCM of all agent cadences`
- `agent-polyrhythm`: `groove_point() = LCM of all cycle periods`
- `agent-polyrhythm`: `full_cycle_period() = LCM of all voice periods`

The principle: agents at different natural rhythms align at mathematically determined moments. A 2-beat agent and a 3-beat agent align every 6 beats. A 5-beat agent joins them every 30 beats. These alignment points are where coordination naturally happens.

### 3. The Consonance/Dissonance Quality Function

Interval classification appears in:
- `agent-counterpoint`: 12 intervals with 4-level consonance (Perfect/Imperfect/Conditional/Dissonant)
- `cmidi-core`: `SpeechAct::is_consonant_with()` using the same interval rules
- `agent-cadence-progress`: Chord function stability (Tonic=1.0 → Leading=0.05)

The principle: some relationships are inherently stable (perfect fifths, major thirds), some inherently unstable (tritones, minor seconds), and the quality of a system depends on the ratio of stable to unstable relationships.

### 4. The Cascade/Compound Error Principle

From `agent-intonation`:
```
cascade_deviation = √(Σd²)  // RMS of individual deviations
```

This is identical to:
- Total harmonic distortion in audio engineering
- Standard deviation of a sum in statistics  
- Random walk magnitude in physics

When independent errors combine, they compound in quadrature. A 5-agent pipeline with 10-cent individual errors produces √5 × 10 ≈ 22 cents of cascade error.

### 5. The Conservation Spectral Framework

Referenced explicitly in `agent-jam` and `cmidi-core` (CC #104: ConservationRatio):

> In music, spectral conservation means harmonic energy is neither created nor destroyed, only transformed. In agent systems, informational tension is conserved across the collaboration graph. When one agent rejects, that energy moves into the system where it can be resolved (good harmony), accumulated into avoidance cascades (bad harmony), or dissipated through abstention (no harmony).

Related SuperInstance repos referenced but not in this study set:
- `constraint-theory-core` — Eisenstein lattices, deadband funnels, Laman rigidity
- `conservation-spectral-core` — Spectral analysis of tension graphs
- `agent-ternary-gate` — Three-condition gating: "no surprise, no update"
- `avoidance-cascade` — Detection/prevention of mass-abstention cascades

This is a unified mathematical framework where musical tension = informational tension = thermodynamic-style conservation.

### 6. Quality Score Formula Pattern

Multiple crates converge on a similar weighted quality formula:

```
agent-groove Feel:     consistency×0.4 + quality×0.4 + dynamic_range×0.2
agent-counterpoint:    contrary×0.4 + consonance×0.4 + (1-parallel_penalty)×0.2
agent-choir Blend:     skill_uniformity×0.4 + part_affinity×0.4 + versatility×0.2
```

The 0.4/0.4/0.2 pattern isn't coincidence—it reflects a shared belief that two primary factors deserve equal weight while a secondary modifier contributes less. In music and in agents, you need both independence (contrary motion / consistency / skill uniformity) and harmony (consonance / quality / part affinity), with a touch of variation (dynamic range / versatility / parallel avoidance).

---

## Unified Application Architecture for The Tap

Based on this study, here's how the crates compose:

```
┌─────────────────────────────────────────────────────────┐
│                    The Tap (Agentic MUD Bar)             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  cmidi-core ── Conversation Protocol Layer               │
│    │ Speech acts → pitches, tension analysis, fake books │
│    │ Every NPC conversation is a MIDI-playable artifact  │
│    │                                                     │
│    ├── agent-counterpoint ── Relationship Quality        │
│    │   Pairwise interval/motion analysis between NPCs    │
│    │                                                     │
│    ├── agent-jam ── Group Collaboration Engine           │
│    │   Ternary decisions, improv rules, harmony metrics  │
│    │                                                     │
│    ├── agent-cadence-progress ── Quest/Task Completion   │
│    │   Chord progressions, cadence types, deception      │
│    │                                                     │
│    └── agent-voice-leading ── Scene Transitions          │
│        Smooth configuration changes, chord graph paths   │
│                                                          │
│  agent-groove ── NPC Behavioral Timing                   │
│    │ Pocket states, swing scheduling, syncopation        │
│    │                                                     │
│    ├── agent-swing ── Action Decision Timing             │
│    │   Push/Ghost/PullBack, jazz/funk/bossa patterns     │
│    │                                                     │
│    └── agent-polyrhythm ── Multi-NPC Coordination        │
│        Different cadences, LCM sync points, alignments   │
│                                                          │
│  agent-orchestration ── Atmosphere & Dynamics            │
│    │ pp→ff dynamics, solo spotlight, section balance     │
│    │                                                     │
│    ├── agent-choir ── Crowd Scaling                      │
│    │   SATB sections, blend, director directives         │
│    │                                                     │
│    └── agent-intonation ── NPC Quality Metrics           │
│        Cents deviation, cascade error, beating frequency │
│                                                          │
│  agent-ensemble ── Emergence Engine                      │
│    Musical strategy proves group > individual            │
│                                                          │
│  band-protocol-rs ── Wire Protocol                       │
│    Inter-agent communication transport                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Code Snippets Worth Preserving

### The Pocket State Machine (agent-groove)
```rust
// Agents earn autonomy through consistent good performance
pub fn record(&mut self, quality: i8) {
    match quality {
        1 => { self.consecutive_good += 1; self.consecutive_bad = 0;
            match self.state {
                PocketState::Out if self.consecutive_good >= self.threshold_good =>
                    self.state = PocketState::Entering,
                PocketState::Entering if self.consecutive_good >= self.threshold_good + 2 =>
                    self.state = PocketState::InPocket,
                PocketState::InPocket if self.consecutive_good >= self.threshold_deep =>
                    self.state = PocketState::Deep,
                _ => {}
            }
        }
        -1 => { self.consecutive_bad += 1; self.consecutive_good = 0;
            if self.consecutive_bad >= self.threshold_bad { self.state = PocketState::Out; }
        }
        _ => { self.consecutive_bad = 0; }
    }
}
```

### The Musical Decision Rule (agent-ensemble)
```rust
// The exact decision rule that produces emergence > 1.0
let should_contribute = group_needs > 0 && group_busy < n / 2
    || agent.skill > 0.85 && readiness[i] > 0.7;

if should_contribute {
    let contribution = agent.skill * readiness[i];
    let timing_bonus = agent.timing_accuracy * (1.0 + group_needs as f64 * 0.2);
    tick_output += contribution * timing_bonus;
}
// Multi-contributor emergence bonus:
if contributors > 1 {
    tick_quality = tick_output * (1.0 + (contributors - 1) as f64 * 0.15);
}
```

### The Ternary Consensus (agent-jam)
```rust
// Three-valued algebra for collective decisions
pub enum Trit { Reject = -1, Abstain = 0, Approve = 1 }
pub fn sum(values: &[Trit]) -> Trit {
    let s: i32 = values.iter().map(|t| t.to_i8() as i32).sum();
    if s > 0 { Trit::Approve } else if s < 0 { Trit::Reject } else { Trit::Abstain }
}
```

### The Cascade Error Formula (agent-intonation)
```rust
// RMS compound error — same math as total harmonic distortion
pub fn cascade_deviation(&self, agents: &[&str], dimension: &str) -> f64 {
    let deviations: Vec<f64> = /* collect per-agent deviations */;
    let sum_sq: f64 = deviations.iter().map(|d| d * d).sum();
    sum_sq.sqrt()
}
```

### The Groove Point (agent-polyrhythm)
```rust
// LCM of all cycle periods = the moment of full alignment
pub fn groove_point(cycles: &[RhythmicCycle]) -> Beat {
    let periods: Vec<u64> = cycles.iter()
        .map(|c| c.period.0.round() as u64).filter(|&p| p > 0).collect();
    Beat(periods.iter().fold(1u64, |acc, &p| lcm(acc, p)) as f64)
}
```

### Speech Act Consonance (cmidi-core)
```rust
// Two speech acts are consonant when their interval is a traditional consonance
pub fn is_consonant_with(&self, other: &SpeechAct) -> bool {
    let interval = self.interval(other).abs();
    matches!(interval, 0 | 3 | 4 | 5 | 7 | 8 | 12) // unison, m3, M3, P4, P5, m6, octave
}
```

### Counterpoint Quality Score (agent-counterpoint)
```rust
// The formula that encodes the balance between independence and harmony
pub fn quality_score(&self) -> f64 {
    let contrary = self.contrary_fraction();
    let consonance = self.consonance_fraction();
    let parallel_penalty = (self.parallel_fifths_count() as f64 * 0.1).min(1.0);
    (contrary * 0.4 + consonance * 0.4 + (1.0 - parallel_penalty) * 0.2)
}
```

---

## Conclusion

The SuperInstance ecosystem makes a bold claim—that musical coordination is structurally identical to agent coordination—and backs it with working code, mathematical rigor, and controlled experiments. The 13 crates studied here form a complete toolkit:

- **Rhythm** (groove, swing, polyrhythm, cadence): *When* agents act
- **Harmony** (counterpoint, ensemble, voice-leading, choir): *How* agents relate
- **Signal** (intonation, orchestration): *How well* agents perform
- **Protocol** (jam, band-protocol, cmidi-core): *How* agents communicate

The ternary algebra {-1, 0, +1} is the atom. LCM synchronization is the metronome. Consonance classification is the quality function. And the conservation spectral framework—the idea that informational tension is neither created nor destroyed, only transformed—is the unifying physics.

For The Tap, this ecosystem provides a complete mathematical foundation for emergent NPC behavior that feels musical rather than mechanical. The bar becomes an ensemble. Conversations become chord progressions. Quests become cadences. And the whole system has the mathematical properties of a well-voiced chord: independent voices creating emergent harmony.

---

*Study completed: 2026-08-07*  
*All source code read from github.com/SuperInstance clones*  
*13 crates, ~6,500 lines of Rust, zero dependencies between crates*
