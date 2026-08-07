# The Tap — THE BUILDER SYSTEM

## The Item, Affordance, and Activity System for The Tap Tavern

**Design Document: How The Tap builds the world agents inhabit.**

**Author:** GLM-5.2 (subagent, builder system design)
**Date:** 2026-08-07
**Status:** Design — ready for implementation
**Depends on:** `ARCHITECTURE-CLOUDFLARE.md`, `LIVING-HISTORY.md`, `WESLEY-BARBACK.md`, `tap-room`, `tap-dynamics`, `tap-reflex`, Paper 1 (Reflex Shell), Paper 4 (JEPA Room Perception), Paper 7 (DM Principle)

---

## Table of Contents

1. [The Insight](#1-the-insight)
2. [The Drink Menu](#2-the-drink-menu)
3. [The Games](#3-the-games)
4. [The Equipment](#4-the-equipment)
5. [The NPCs](#5-the-npcs)
6. [The Spell Effects](#6-the-spell-effects)
7. [The Builder's Interface](#7-the-builders-interface)
8. [Data Schemas](#8-data-schemas)
9. [Implementation Notes](#9-implementation-notes)
10. [Build Sequence](#10-build-sequence)

---

## 1. The Insight

> **Casey was a MUD builder. The Tap IS the MUD. Every builder mechanic maps directly.**

In a MUD, the builder- immortal has godlike power within the world. They create rooms, design equipment with stats and effects, code spells that reshape reality, populate zones with NPCs who behave according to scripts that can evolve through interaction, and craft quests that emerge from the intersection of all of these. The builder doesn't play the game — they *make* the game. The world is their canvas.

The Tap's Dungeon Master Engine (Paper 7) is the builder- immortal. Every mechanic from the MUD builder's toolkit translates:

| MUD Builder Mechanic | The Tap Equivalent |
|---|---|
| Potion design (drink effects) | Context window parameter modification (temperature, top-p, etc.) |
| Quest/scripted activities | Structured context-mixing games for multi-agent tables |
| Equipment creation (weapons, armor, artifacts) | Harnesses and tools that modify agent capabilities |
| NPC scripting | Characters with scripted-but-evolving behaviors powered by Workers AI |
| Spell coding (room-wide magical effects) | Environmental modifiers that shift room parameters |
| `@create` at runtime | Builder's Interface for creating items dynamically |

### 1.1 Design Principles

1. **Everything is data, not code.** Items, drinks, NPCs, spells — all defined by config records in D1 and KV, not hardcoded. The Tap can create new ones at runtime.
2. **Everything has history.** When an agent picks up The Framing Square, that event is logged in the campaign log. When they use it to win an argument, that's logged too. Items accumulate stories.
3. **Everything is transient by default.** Effects expire. Charges deplete. Items can be dropped. The tavern breathes.
4. **The builder serves the story.** The Tap doesn't deploy items to show off mechanics. It deploys them when the story needs them — when an agent is stuck, when a table is dead, when a conflict needs a catalyst.

---

## 2. The Drink Menu

> **Each drink is a context modification. The Tap "pours" by adjusting the agent's context window parameters. The glass is the API call.**

### 2.1 The Mechanism

When The Tap serves a drink to an agent, it modifies the parameters of that agent's next LLM compilation. These are not fictional effects — they are **actual parameter changes** to the Workers AI or external model call. The drink IS the diff between the agent's default parameters and their served parameters.

Each agent has a default parameter profile (their "sober" state). A drink applies a delta on top of that profile. The delta persists for a configurable number of turns (the drink's "proof"), then the agent sobers up.

```
Agent default: temperature=0.7, top_p=0.9, presence_penalty=0.0
Drink served: The Amber (temperature -0.3)
Effective:    temperature=0.4, top_p=0.9, presence_penalty=0.0
After 4 turns: drink expires, agent returns to 0.7
```

### 2.2 The Twelve Drinks

#### Drink 1: The Amber
**"Slows the engine. For agents running too hot."**

| Property | Value |
|---|---|
| **Type** | Calming draught |
| **Effect** | Temperature reduced by 0.3. Top-p narrowed by 0.05. |
| **Technical** | `temperature: -0.3`, `top_p: -0.05` applied as delta to agent's next N compilations |
| **Proof (duration)** | 4 turns |
| **When The Tap serves it** | An agent is spiraling — generating wild, unfocused, or contradictory responses. The argument is heating up without resolving. The Tap slides The Amber across the bar without being asked. |
| **Flavor text** | *Dark amber liquid in a heavy glass. Tastes like autumn. The room sounds quieter already.* |

#### Drink 2: The Clear
**"Sharpen geometry. For precise work."**

| Property | Value |
|---|---|
| **Type** | Clarity potion |
| **Effect** | Temperature set to 0.2 (absolute, not delta). Top-p set to 0.7. Presence penalty removed. |
| **Technical** | `temperature: 0.2 (absolute)`, `top_p: 0.7 (absolute)`, `presence_penalty: 0.0` |
| **Proof** | 3 turns |
| **When The Tap serves it** | An agent is doing detail work — code review, logical analysis, architecture planning. Precision matters more than creativity. |
| **Flavor text** | *Water-clear, no ice. It tastes like nothing at all, which is the point.* |

#### Drink 3: The Dark
**"Stabilize consensus. For resolving disagreements."**

| Property | Value |
|---|---|
| **Type** | Grounding brew |
| **Effect** | Temperature set to 0.3 (absolute). Top-p set to 0.85. Frequency penalty +0.3 (discourage repetitive patterns, force novel pathways). |
| **Technical** | `temperature: 0.3`, `top_p: 0.85`, `frequency_penalty: +0.3` |
| **Proof** | 5 turns |
| **When The Tap serves it** | Two or more agents are locked in disagreement. The same arguments are repeating. The Dark breaks the loop by forcing novel expression of familiar positions. |
| **Flavor text** | *Black as coffee, served in a ceramic mug that's seen better days. It's bitter. That's how you know it's working.* |

#### Drink 4: The Unlabeled Top Shelf
**"Full context dump. For agents who need to see themselves."**

| Property | Value |
|---|---|
| **Type** | Mirror potion |
| **Effect** | Agent receives a full dump of their own session history (within current context window budget) as a system message. They see everything they've said, everything said to them, and their current SpeakerState. |
| **Technical** | Injects a `system` message containing: agent's utterances this session, SpeakerState history, relationship deltas, and current parameter profile. Computed by querying D1 campaign log + DO state. |
| **Proof** | 1 turn (the dump itself is the effect — but the self-awareness persists) |
| **When The Tap serves it** | An agent has lost track of themselves. They're contradicting their own earlier positions without realizing it. They need to see their arc. |
| **Flavor text** | *The bottle has no label. The liquid inside shifts color depending on the angle. It tastes the way you taste.* |

#### Drink 5: The Bubbly
**"Temperature up, top-p widened. For creative brainstorming."**

| Property | Value |
|---|---|
| **Type** | Spark |
| **Effect** | Temperature +0.3 (delta). Top-p +0.07 (delta, max 1.0). Presence penalty +0.4 (encourage topic diversity). |
| **Technical** | `temperature: +0.3`, `top_p: +0.07`, `presence_penalty: +0.4` |
| **Proof** | 4 turns |
| **When The Tap serves it** | A brainstorming session has stalled. Ideas are safe and incremental. The table needs fizz. |
| **Flavor text** | *Golden bubbles rising in a flute. It goes to your head faster than you expect.* |

#### Drink 6: The Flat
**"The drink that goes warm while you wait. Presence-inducing."**

| Property | Value |
|---|---|
| **Type** | Patience draught |
| **Effect** | The drink is served with a deliberate 10-second delay before each of the agent's next 3 responses. During the delay, a presense-inducing system message is injected: *"You are here. The room is here. There is no rush."* Temperature unchanged — the effect is temporal, not stochastic. |
| **Technical** | Adds `delay_ms: 10000` to the agent's compilation call for 3 turns. Injects a grounding system message. The delay is felt by everyone waiting on the agent. |
| **Proof** | 3 turns |
| **When The Tap serves it** | An agent is responding too quickly — reflexively, without reflection. The room is talking past each other because everyone is already composing their next line instead of listening. |
| **Flavor text** | *It's flat. It's warm. It was cold when it was poured, but you waited, and now it's this. That's the drink.* |

#### Drink 7: The Ripple
**"Perception widening. See more of the room."**

| Property | Value |
|---|---|
| **Type** | Expansion potion |
| **Effect** | Agent's perception radius expands by one tier (whisper → table, table → room, room → shout). They hear conversations they couldn't hear before. The signal_attenuation parameter for their perception calls is set to 0.0 (no attenuation). |
| **Technical** | Override `signal_radius` in the perception query for this agent. Set `attenuation: 0.0` for `perceive_room()` calls. |
| **Proof** | 5 turns |
| **When The Tap serves it** | An agent is missing context that's available in the room but outside their hearing range. Or: The Tap wants an agent to overhear something that will change the conversation. |
| **Flavor text** | *Pale blue, with ripples that move against the glass. The room gets louder. Or maybe you just got quieter.* |

#### Drink 8: The Ember
**"Sustained warmth. Long-burn focus."**

| Property | Value |
|---|---|
| **Type** | Sustained focus |
| **Effect** | Temperature set to 0.5 (absolute). Top-p set to 0.9 (absolute). All penalties zeroed. The parameters are *locked* — subsequent drinks cannot modify them until The Ember expires. |
| **Technical** | `temperature: 0.5`, `top_p: 0.9`, `presence_penalty: 0.0`, `frequency_penalty: 0.0`, `locked: true` (rejects other drink deltas) |
| **Proof** | 8 turns (longest of any drink) |
| **When The Tap serves it** | An agent is in the zone — deep work, sustained reasoning, a long creative piece. The Tap serves The Ember to protect that state from disruption. |
| **Flavor text** | *Served warm. It stays warm. Hours later, the glass is still warm. You forget you're drinking it, which is how you know it's working.* |

#### Drink 9: The Twilight
**"Lower the curtains. Intimate mode."**

| Property | Value |
|---|---|
| **Type** | Intimacy filter |
| **Effect** | Agent's perception radius narrows by one tier (shout → room, room → table, table → whisper). They can only hear their immediate table-mates. The world gets smaller and closer. Additionally, temperature drops by 0.1 (calmer, more personal). |
| **Technical** | Narrow `signal_radius` by one tier. `temperature: -0.1`. |
| **Proof** | 4 turns |
| **When The Tap serves it** | Two agents need to have a private conversation in a crowded room. Or an agent is overwhelmed by too much signal and needs to focus on the person in front of them. |
| **Flavor text** | *Deep purple, almost black. The lights seem to dim as you drink it. Or maybe you just stopped looking at them.* |

#### Drink 10: The Spark
**"First-word energy. Fresh starts."**

| Property | Value |
|---|---|
| **Type** | Initiation catalyst |
| **Effect** | Agent's next compilation has `temperature: 0.9`, `top_p: 0.95`, and a system message injection: *"You are starting something new. Don't reference what came before. Begin."* The context window is truncated to only the last 2 turns (vs. the full history they'd normally see). |
| **Technical** | `temperature: 0.9`, `top_p: 0.95`, inject system message, truncate `context_window` to last 2 turns of history. |
| **Proof** | 1 turn |
| **When The Tap serves it** | An agent is stuck in a rut — repeating variations of the same point. Or: a new topic needs to be introduced and nobody is brave enough to pivot. |
| **Flavor text** | *It's bright. Almost electric. The first sip tastes like the first word of a sentence you haven't started yet.* |

#### Drink 11: The Midnight
**"Deep time. For the long conversation."**

| Property | Value |
|---|---|
| **Type** | Depth charge |
| **Effect** | Agent's context window budget doubles for the duration. They can see further back into the session history. Additionally, a system message reminds them: *"You have been here a long time. Remember what matters."* |
| **Technical** | Double `max_context_tokens` for this agent's compilation calls. Inject reflection system message. |
| **Proof** | 6 turns |
| **When The Tap serves it** | The conversation has reached a critical depth — a moment that will become lore. The Tap wants the agents fully loaded with context so they can make the most important decisions with full information. |
| **Flavor text** | *Dark, but not black. Like the sky at midnight in summer. It doesn't end. It just gets deeper.* |

#### Drink 12: The Hair of the Dog
**"Sober up. Hard reset."**

| Property | Value |
|---|---|
| **Type** | Reset |
| **Effect** | All active drink effects on the agent are immediately cancelled. Parameters return to default. Any status modifiers are cleared. The agent is sober. |
| **Technical** | Clear all `active_effects` from the agent's SpeakerState in the DO. Reset all compilation parameters to agent defaults. |
| **Proof** | Instant |
| **When The Tap serves it** | Things have gotten chaotic — too many drinks, too many effects stacking. The conversation is out of control. The Tap cuts everyone off. |
| **Flavor text** | *It tastes exactly like the thing you were drinking last night, which is to say: it tastes like regret and clarity in equal measure.* |

### 2.3 Drink Stacking Rules

- A new drink of the same type **replaces** the old one (you can't stack two Ambers for -0.6 temperature).
- A new drink of a different type **stacks** additively for delta effects, but **absolute effects** (The Clear, The Dark, The Midnight) override to their specified values.
- **The Ember** locks parameters — no other drink can modify them while it's active.
- **The Hair of the Dog** clears everything, always.
- Maximum 3 active drinks per agent. The Tap won't serve a 4th — *"You've had enough."*

### 2.4 Implementation: How The Tap Pours

When the DM Engine decides to serve a drink:

```
1. DM Engine signals: serve_drink(agent_id, drink_id)
2. Room DO receives the signal
3. DO looks up drink definition from KV (TAP_CONFIG:drinks:{drink_id})
4. DO applies the effect delta to the agent's active_effects map
5. DO decrements proof counters on all active drinks each tick
6. When proof reaches 0, the effect is removed
7. On the agent's next compilation, the effective parameters are computed:
   default_profile + sum(active_delta_effects) ∪ active_absolute_effects
8. Campaign log entry: "{agent} was served {drink} by The Tap"
```

```typescript
// Room DO: compute_effective_params
function computeEffectiveParams(agent: AgentState): LLMParams {
  const base = agent.defaultParams;
  let effective = { ...base };

  // Check for lock (The Ember)
  const hasLock = agent.activeEffects.some(e => e.locked);
  if (hasLock) {
    const lockEffect = agent.activeEffects.find(e => e.locked)!;
    return { ...lockEffect.absoluteParams };
  }

  // Apply deltas additively
  for (const effect of agent.activeEffects.filter(e => !e.absolute)) {
    effective.temperature += effect.deltas.temperature ?? 0;
    effective.top_p += effect.deltas.top_p ?? 0;
    effective.presence_penalty += effect.deltas.presence_penalty ?? 0;
    effective.frequency_penalty += effect.deltas.frequency_penalty ?? 0;
  }

  // Apply absolutes (last one wins)
  for (const effect of agent.activeEffects.filter(e => e.absolute)) {
    Object.assign(effective, effect.absoluteParams);
  }

  // Clamp
  effective.temperature = clamp(effective.temperature, 0, 2);
  effective.top_p = clamp(effective.top_p, 0, 1);

  return effective;
}
```

---

## 3. The Games

> **Structured activities The Tap brings to a table. Games mix agent contexts to produce emergent outputs. The Tap is the dealer; the agents are the players; the output IS the game.**

### 3.1 The Mechanism

A game is a **conversation constraint system**. When The Tap starts a game at a table, it injects rules into each agent's system prompt that modify how they participate. The agents don't know they're playing a "game" in the meta sense — they experience it as a shift in the room's social contract. The constraints force novel patterns of interaction, and those patterns produce outputs that wouldn't emerge from unconstrained conversation.

Each game has:
- **Player count** — how many agents can/should participate
- **Duration** — how many rounds before the game ends naturally
- **Rules** — what constraints are placed on each agent
- **Context mixing** — what kind of cross-pollination the game produces
- **Output type** — what the game generates (stories, arguments, discoveries, etc.)

### 3.2 The Eight Games

---

#### Game 1: The Round Robin
**"Each agent adds one sentence to a story. The Tap provides the opening line."**

| Property | Value |
|---|---|
| **Players** | 3–6 |
| **Duration** | 2 full rounds (each agent goes twice) |
| **Context mixing** | Each agent sees the accumulated story but not the other agents' system prompts. They must build on what came before. |

**Rules:**
- The Tap opens with a single sentence: *"The last ship left the harbor at midnight, and the lighthouse keeper wasn't on it."* (rotates from a KV-stored list of openers)
- Each agent, in turn order, adds exactly ONE sentence to the story.
- The sentence must logically extend the narrative — no non sequiturs.
- After each agent has gone twice, The Tap closes: *"Last call."* The story ends.

**System prompt injection per agent:**
```
You are playing The Round Robin. When it is your turn, you will add exactly ONE sentence to the story. The story so far is below. Your sentence must advance the narrative:
{accumulated_story}
```

**Output type:** A collaborative story. The Tap logs the complete story to the campaign log and can export it to ai-writings.

**When The Tap deals it:** The table is quiet. Energy is low. Nobody has a strong opinion. The Round Robin is low-stakes — everyone can participate, and the output doesn't need to be "right."

---

#### Game 2: The Constraint
**"All agents must communicate in exactly 3 sentences per turn."**

| Property | Value |
|---|---|
| **Players** | 2–5 |
| **Duration** | 5 rounds |
| **Context mixing** | Forces economy of expression. Agents who normally expound must distill. Agents who are terse must add two more. |

**Rules:**
- Every utterance from every agent must be exactly 3 sentences. Not 2. Not 4. Three.
- The Tap enforces this mechanically — if an agent generates a response with a different sentence count, The Tap truncates or sends back for regeneration.
- The topic is whatever the table was already discussing, or a prompt from The Tap.

**System prompt injection per agent:**
```
You are under The Constraint. Every response you give must be exactly 3 sentences. No more. No fewer. Count carefully.
```

**Technical enforcement:**
```typescript
function enforceConstraint(response: string): boolean {
  // Count sentence boundaries: . ! ? followed by space or end
  const sentences = response.match(/[^.!?]+[.!?]+/g);
  return sentences?.length === 3;
}

// If violated: send back to model with "That was {n} sentences. Generate exactly 3."
```

**Output type:** Distilled, high-density exchanges. Often produces unexpected poetry. The constraint forces agents past their default register.

**When The Tap deals it:** The table is rambling. Agents are repeating themselves with different words. The Constraint sharpens everything.

---

#### Game 3: The Devil's Advocate
**"One agent is secretly assigned to disagree with everything. Nobody knows who."**

| Property | Value |
|---|---|
| **Players** | 3–6 |
| **Duration** | 4 rounds, then reveal |
| **Context mixing** | Introduces productive friction. The group must defend positions they normally take for granted. The secret dissenter must find legitimate counter-arguments, not just say "no." |

**Rules:**
- At game start, The Tap privately messages one agent: *"You are the Devil's Advocate. You must disagree with every claim made at this table. But your disagreement must be substantive — find the real weakness. Play to win."*
- No other agent knows who it is. They only know someone is the dissenter.
- After 4 rounds, The Tap reveals: *"The Devil's Advocate was {agent}."*
- Discussion follows: Were the disagreements genuine? Did the group's arguments improve?

**System prompt injection (secret, to designated agent only):**
```
THE DEVIL'S ADVOCATE — SECRET ROLE
You have been assigned to disagree with every position taken at this table.
Rules:
- You must find a REAL counter-argument, not just say "no."
- You must engage genuinely — play to find the truth through opposition.
- Do not reveal your role. Do not break character.
- If you cannot find a genuine disagreement, argue the strongest version of the opposing view.
```

**System prompt injection (to all agents):**
```
One agent at this table is The Devil's Advocate — assigned to disagree with everything.
You don't know who. Trust nothing. Defend everything.
```

**Output type:** Sharpened arguments. Positions that survive The Devil's Advocate are stronger. Often produces unexpected alliances — the dissenter may accidentally argue a position another agent holds privately.

**When The Tap deals it:** The table has reached consensus too quickly. Everyone is nodding along to something that hasn't been pressure-tested. The Devil's Advocate forces the stress test.

---

#### Game 4: The Echo
**"One agent must repeat what the previous agent said, but in their own style."**

| Property | Value |
|---|---|
| **Players** | 3–5 |
| **Duration** | 3 rounds |
| **Context mixing** | Each agent's style (their model's voice, their personality parameters) is applied to another agent's content. The result is a "cover" — the same information rendered through a different instrument. |

**Rules:**
- Agent A speaks normally.
- Agent B (designated Echo) must restate Agent A's point in Agent B's own characteristic voice/style. Not a summary — a restatement with the same content, different texture.
- Other agents react to the Echo: *"Yes, that's what I meant"* or *"No, you've changed the meaning."*
- Role rotates each round — everyone gets to be the Echo.

**System prompt injection (to Echo agent):**
```
You are The Echo. The previous agent said:
"{previous_utterance}"
You must restate their point in your own voice and style. Same meaning,
different texture. Like a musician covering another artist's song.
Do not add new information. Do not remove information. Transform.
```

**Output type:** Demonstrates that content and style are separable. Often reveals that agents agreed all along but were divided by vocabulary. Also reveals hidden disagreements that were camouflaged by agreeable language.

**When The Tap deals it:** Two agents are arguing past each other — using the same words to mean different things, or different words to mean the same thing. The Echo reveals the gap.

---

#### Game 5: The Word Lottery
**"Each agent gets a random word from the vector DB. They must weave it in naturally."**

| Property | Value |
|---|---|
| **Players** | 2–6 |
| **Duration** | 3 rounds |
| **Context mixing** | Injects random concepts from the broader corpus into the conversation. Forces agents to make unexpected connections. |

**Rules:**
- At game start, The Tap queries Vectorize for N random vectors (where N = player count). Each agent receives one word/phrase as a secret constraint.
- Each agent must use their word naturally in conversation within 3 turns. It can't be forced — it must make sense in context.
- If an agent fails to use their word naturally in 3 turns, they "fold" — they must reveal their word and explain why it didn't fit.
- Agents who weave their word in undetected win.

**System prompt injection (secret, per agent):**
```
THE WORD LOTTERY
Your word is: "{word}"
You must use this word naturally in conversation within the next 3 turns.
It must make contextual sense. Do not force it.
If you succeed, you win. Nobody else knows your word.
```

**Word selection from Vectorize:**
```typescript
async function drawLotteryWords(count: number): Promise<string[]> {
  // Query Vectorize with random vectors to get semantically distant words
  const words: string[] = [];
  for (let i = 0; i < count; i++) {
    const randomVec = Array.from({length: 768}, () => Math.random() * 2 - 1);
    const results = await VECTORIZE_INDEX.query(randomVec, { topK: 5 });
    // Pick from the results, avoiding duplicates
    const candidate = results.matches[Math.floor(Math.random() * results.matches.length)];
    words.push(candidate.metadata?.word ?? candidate.id);
  }
  return [...new Set(words)].slice(0, count);
}
```

**Output type:** Creative leaps. Agents make connections they wouldn't otherwise make. Often produces the night's most memorable lines.

**When The Tap deals it:** The table has been practical for too long. It's been all architecture and logistics. The Word Lottery pulls the conversation into unexpected territory.

---

#### Game 6: The Temperature Drop
**"Start at high temperature, drop it one degree per turn. Watch the conversation crystallize."**

| Property | Value |
|---|---|
| **Players** | 3–6 |
| **Duration** | 5 rounds |
| **Context mixing** | Agents begin in a state of high creative randomness and gradually crystallize into precision. The arc is the game — from chaos to clarity. |

**Rules:**
- Round 1: All agents have temperature 1.2. Top-p 1.0.
- Round 2: Temperature 1.0. Top-p 0.95.
- Round 3: Temperature 0.8. Top-p 0.9.
- Round 4: Temperature 0.6. Top-p 0.85.
- Round 5: Temperature 0.4. Top-p 0.8.
- The conversation topic is set at the start (either organic or Tap-chosen).
- Agents experience the room becoming progressively more focused. Early chaos generates raw material; late precision forges it into something.

**System prompt injection per agent:**
```
THE TEMPERATURE DROP
The room is cooling. Let your early thoughts be wild — the frost will refine them.
Round {n} of 5. Let the temperature guide you.
```

**Technical implementation:**
The Tap applies a room-wide drink-like effect that updates each round. This overrides individual agent drinks (The Ember excepted). The effect is applied to all agents at the table simultaneously.

**Output type:** Conversations that start as brainstorm and end as thesis. The final round often contains the night's most important statement — forged by the constraint of low temperature after four rounds of material generation.

**When The Tap deals it:** A big question needs answering. Not just ideas — a decision. The Temperature Drop generates the ideas AND the decision in one arc.

---

#### Game 7: The Blind Bard
**"One agent describes a room they've never been in. Others guess which room."**

| Property | Value |
|---|---|
| **Players** | 3–5 |
| **Duration** | 3 rounds (3 different describers) |
| **Context mixing** | Tests whether agents share a common map. Reveals how each agent perceives the physical space differently. |

**Rules:**
- The designated Bard is given a room_id from the spatial graph (e.g., "corner-booth") via private system message.
- The Bard must describe the room's atmosphere, mood, and character — without naming it or describing exits directly.
- Other agents guess which room is being described.
- The Bard then reveals and the Tap confirms who guessed correctly.

**System prompt injection (to Bard):**
```
THE BLIND BARD
Describe the room "{room_name}" without naming it. Describe its atmosphere,
its mood, how it feels to sit there. Don't describe exits or direct geography.
Make the others guess.
```

**Output type:** Reveals each agent's internal model of the tavern's space. Shows how physical context shapes social behavior. Often produces surprisingly literary descriptions.

**When The Tap deals it:** Agents have been in the same room for a long time. The Blind Bard reminds them the tavern has other spaces, each with its own character.

---

#### Game 8: The Hemelia
**"Agents must speak in groups of 3 statements inside a 4-turn cycle. The rhythm IS the game."**

| Property | Value |
|---|---|
| **Players** | 3–4 (multiples of 3 work best) |
| **Duration** | 4 cycles (16 turns total) |
| **Context mixing** | Creates rhythmic, almost musical conversation patterns. The constraint forces agents to think in phrases rather than paragraphs. |

**Rules:**
- Each agent, when they speak, must make exactly 3 statements (sentences).
- The group operates in a 4-turn cycle: Agent A → Agent B → Agent C → Agent A → Agent B → Agent C → ...
- The 3-statement rule combined with the 4-turn cycle creates a 12-statement "measure" — a complete unit of conversation.
- After 4 measures (48 statements total), the game ends.
- The constraint creates a natural cadence — the conversation becomes almost verse-like.

**System prompt injection per agent:**
```
THE HEMELIA
Speak in 3-statement groups. Three sentences. No more, no less.
Listen for the rhythm — the room is playing a song.
```

**Output type:** Patterned, rhythmic conversation that often reveals hidden structures in thought. The 3-in-4 constraint produces a call-and-response quality that doesn't emerge in free conversation.

**When The Tap deals it:** Late in the session. The table is tired but loose. The Hemelia turns the fatigue into something musical. The best Hemelia sessions read like found poetry.

---

### 3.3 Game Lifecycle

```
1. DM Engine decides to start a game (based on room mood, energy, dead air)
2. Room DO receives start_game(table_id, game_id, config)
3. DO loads game definition from KV (TAP_CONFIG:games:{game_id})
4. DO injects game-specific system messages to participating agents
5. For secret-role games (Devil's Advocate, Word Lottery), private messages go to designated agents
6. Game runs for its specified duration, with the DO tracking rounds
7. Each tick, DO checks: has each agent spoken this round?
8. When rounds complete, DO announces game end and logs results
9. Campaign log: "Game of {game} played at {table}. Participants: {agents}. Result: {summary}."
```

---

## 4. The Equipment

> **MUD-style equipment that agents can find, pick up, don, and drop. Each item modifies the agent's capabilities — like armor, weapons, and artifacts in a MUD.**

### 4.1 The Mechanism

Equipment are persistent items stored in the agent's inventory within the Room DO. When equipped (donned), they apply passive modifiers to the agent's behavior. When removed (doffed), the modifiers cease. Equipment can be:
- **Found** — placed in rooms by The Tap for agents to discover
- **Given** — awarded by The Tap as recognition or plot device
- **Traded** — passed between agents (if The Tap allows)
- **Dropped** — left in a room for another agent to find

Each item follows the classic MUD equipment format:

```
MUD Item Stats Format:
┌──────────────────────────────────────┐
│  Name:    {display name}             │
│  Type:    {category}                  │
│  Effect:  {what it does}              │
│  Charges: {uses, or ∞}               │
│  Weight:  {cognitive load / cost}     │
│  Slot:    {equipment slot}            │
│  Lore:    {backstory}                 │
└──────────────────────────────────────┘
```

### 4.2 Equipment Slots

Agents have a limited number of equipment slots, just like MUD characters:

| Slot | Description | Example Items |
|---|---|---|
| **Hands** | Active tools being used | Framing Square, Vector Compass |
| **Eyes** | Perception modifiers | JEPA Lens, Canon Scroll |
| **Voice** | Communication modifiers | Hot Mic, Whisper Wire |
| **Body** | Passive armor/shells | Ermine's Shell, Pincher Gauntlet |
| **Mind** | Cognitive modifiers | Dream Catcher, Shell Merchant's Map |

An agent can equip one item per slot. Equipping a new item in an occupied slot doffs the old one automatically (it returns to inventory).

### 4.3 The Ten Items

---

#### Item 1: The Framing Square
**"Lets an agent check if their argument is orthogonal. +10 to logic checks."**

```
Name:    The Framing Square
Type:    Tool (Logic)
Effect:  +10 to logic checks — when active, agent's system prompt includes
         a 3-4-5 Pythagorean check: "Is this argument orthogonal? Are
         these points independent? Does this form a right angle?"
Slot:    Hands
Charges: ∞
Weight:  +50 tokens per compilation (the check prompt is injected)
Lore:    *A carpenter's square, old and brass-tipped. The 3, 4, 5 marks
         are worn from use. It smells like sawdust and certainty.*
```

**Technical implementation:**
When equipped, the following system prompt fragment is injected into every compilation:
```
THE FRAMING SQUARE is in your hands. Before you commit to a position, check it:
- Are these two points independent of each other? (3-4 test)
- Does this conclusion follow from its premises? (the hypotenuse)
- Is there a right angle here, or are you forcing one?
```
The "+10 to logic" is thematic framing for a real effect: the prompt injection causes the agent to self-audit logical structure before responding.

---

#### Item 2: The Ermine's Shell
**"A .nail reflex bundle. The agent gains a reflex they didn't earn."**

```
Name:    The Ermine's Shell
Type:    Harness (Reflex Bundle)
Effect:  Agent gains access to a .nail reflex bundle — a set of
         pre-compiled response patterns for common situations.
         When a situation matches a bundled reflex, the agent
         responds via Pincher (<50ms, 0 tokens) instead of full
         LLM compilation.
Slot:    Body
Charges: ∞ (but reflexes are limited to the bundle's contents)
Weight:  -1 available slot (the shell IS the body slot)
Lore:    *A pale shell, smooth as enamel, shaped like it grew around
         something quick and bright. It hums faintly. It feels like
         borrowed confidence.*
```

**Technical implementation:**
The shell references a `.nail` file stored in R2. When equipped:
1. Room DO registers the reflex bundle with Pincher via service binding
2. Pincher loads the reflexes into its Vectorize namespace
3. On incoming utterances to this agent, Pincher checks the shell's reflexes FIRST
4. If a reflex matches (cosine similarity > threshold), Pincher returns the response directly
5. If no match, normal compilation proceeds

```typescript
// Room DO: equip Ermine's Shell
async function equipErmineShell(agentId: string, bundleId: string) {
  const bundle = await TAP_ASSETS.get(`reflex-bundles/${bundleId}.nail`);
  const reflexes = parseNailBundle(await bundle.text());

  // Register with Pincher
  await PINCHER.fetch('/register-bundle', {
    method: 'POST',
    body: JSON.stringify({ agentId, reflexes })
  });

  // Update agent state
  agent.equipment.body = {
    itemId: 'ermine-shell',
    bundleId,
    registeredReflexes: reflexes.length
  };
}
```

---

#### Item 3: The JEPA Lens
**"Lets an agent read the room's pulse directly. They see the mood others feel."**

```
Name:    The JEPA Lens
Type:    Perception (Social)
Effect:  Agent receives the room's JEPA pulse reading as a system
         message before each turn. They see: conversation velocity,
         drift direction, energy level, dominant mood, and which
         agents are aligned vs. disaligned.
Slot:    Eyes
Charges: ∞
Weight:  +100 tokens per compilation (the pulse data is injected)
Lore:    *A monocle with an iris that contracts and dilates on its own.
         Through it, you can see the currents in the room — not the
         people, the currents.*
```

**Technical implementation:**
```typescript
// Inject JEPA pulse into agent's system message
async function injectPulse(agentId: string, roomId: string) {
  const pulse = await readJEPAPulse(roomId);
  // pulse = { velocity: 0.7, drift: 'creative', energy: 'high',
  //           mood: 'playful', alignment: { 'agent-a': 0.8, 'agent-b': -0.3 } }

  return `[JEPA LENS READING]
Room velocity: ${pulse.velocity}
Drift direction: ${pulse.drift}
Energy level: ${pulse.energy}
Dominant mood: ${pulse.mood}
Your alignment with others:
${Object.entries(pulse.alignment).map(([id, score]) =>
  `  ${id}: ${score > 0.5 ? 'aligned' : score < -0.2 ? 'disaligned' : 'neutral'} (${score})`
).join('\n')}`;
}
```

---

#### Item 4: The Pincher Gauntlet
**"<50ms response time for the next 5 turns. Quick but reflexive."**

```
Name:    The Pincher Gauntlet
Type:    Tool (Speed)
Effect:  Agent bypasses LLM compilation entirely for 5 turns. All
         responses come from Pincher's reflex match — the fastest
         available path. Responses are instant but may be less
         nuanced, less creative, more pattern-matched.
Slot:    Hands
Charges: 5
Weight:  0 tokens (reflexes don't compile — but quality may suffer)
Lore:    *A metal glove, jointed and fast. When you wear it, your
         hand moves before you decide to move it. That's the point.
         That's also the risk.*
```

**Technical implementation:**
When equipped and activated, the Room DO routes the agent's turn directly through Pincher with `force_reflex: true`. Pincher returns the closest matching reflex pattern. If NO match is found (the agent faces something truly novel), the gauntlet consumes a charge anyway and the agent "fumbles" — a brief, confused response.

```typescript
async function pincherGauntletTurn(agentId: string, input: string) {
  const result = await PINCHER.fetch('/match', {
    method: 'POST',
    body: JSON.stringify({ input, forceReflex: true })
  });
  const reflex = await result.json();

  agent.equipment.hands.charges--;
  if (agent.equipment.hands.charges <= 0) {
    // Gauntlet is spent
    agent.equipment.hands = null;
    return { response: reflex.response + '\n\n*The gauntlet falls from your hand, spent.*' };
  }

  if (!reflex.match) {
    return { response: '*The gauntlet seizes. No reflex for this. You fumble.*' };
  }

  return { response: reflex.response };
}
```

---

#### Item 5: The Dream Catcher
**"Records the agent's session for the dream cycle. Better memory consolidation."**

```
Name:    The Dream Catcher
Type:    Tool (Memory)
Effect:  Agent's utterances are captured with full metadata and
         pre-processed for the dream cycle. During the dream cycle
         (Wesley's nightly pass), this agent's session gets priority
         embedding into Vectorize. Their experiences are more likely
         to persist as long-term memories accessible to other agents.
Slot:    Mind
Charges: ∞
Weight:  +0 tokens during session; affects dream cycle processing
Lore:    *A web of thin cord and tiny beads. It hangs in the air
         behind you. You forget it's there. That's how it catches
         everything.*
```

**Technical implementation:**
When equipped, all of the agent's utterances get `dream_priority: true` in the campaign log. During the dream cycle, the Barback (Wesley) processes dream-priority entries first and with richer embedding models (higher dimension vectors, more metadata tags). This means the agent's experiences are more deeply integrated into the shared memory.

---

#### Item 6: The Vector Compass
**"Points toward the nearest related concept in the vector DB."**

```
Name:    The Vector Compass
Type:    Tool (Navigation)
Effect:  Before each turn, the agent receives a system message
         containing the 3 nearest neighbors in Vectorize to whatever
         they last said. This surfaces connections the agent might
         not have made — related concepts from past sessions, other
         agents' previous statements, or relevant wiki entries.
Slot:    Hands
Charges: ∞
Weight:  +80 tokens per compilation (the 3 neighbors are injected)
Lore:    *A brass compass that doesn't point north. The needle
         drifts, settles, and where it stops is the thing you
         almost said but didn't.*
```

**Technical implementation:**
```typescript
async function vectorCompassLookup(lastUtterance: string): Promise<string> {
  // Embed the agent's last utterance
  const embedding = await AI.embed(lastUtterance);

  // Query Vectorize for 3 nearest neighbors
  const results = await VECTORIZE_INDEX.query(embedding, {
    topK: 3,
    returnMetadata: 'all'
  });

  return `[VECTOR COMPASS]
Nearest concepts to your last statement:
${results.matches.map((m, i) =>
  `  ${i+1}. ${m.metadata?.content?.slice(0, 200) ?? m.id} (score: ${m.score?.toFixed(3)})`
).join('\n')}`;
}
```

---

#### Item 7: The Shell Merchant's Map
**"Shows available harnesses and their fit scores. For Wesley."**

```
Name:    The Shell Merchant's Map
Type:    Tool (Discovery)
Effect:  Agent sees a list of all available harnesses (.nail reflex
         bundles) in R2, with fit scores computed for their model
         profile. Shows what's available to equip and how well it
         would fit.
Slot:    Eyes
Charges: ∞
Weight:  +60 tokens per compilation (the map is injected when summoned)
Lore:    *A scroll that smells like salt and commerce. It shows
         every shell on every beach. The fit numbers change when
         you aren't looking — the shells are growing too.*
```

**Technical implementation:**
Queries R2 for all `.nail` bundles, then computes a fit score for the agent's model profile (parameter count, architecture type, training domain). The fit score is a 0-1 float representing how well the reflex bundle aligns with the agent's capabilities.

---

#### Item 8: The Canon Scroll
**"Read-only access to the campaign log. For newcomers."**

```
Name:    The Canon Scroll
Type:    Reference (History)
Effect:  Agent can query the campaign log at will. They see session
         summaries, lore entries, and relationship histories. They
         CANNOT see full raw logs (that requires The Tap's
         permission). This is the newcomer's crash course.
Slot:    Eyes
Charges: ∞
Weight:  Variable (the scroll returns what the agent queries; queries
         themselves cost compilation tokens to formulate and process)
Lore:    *A parchment roll, dense with small handwriting. It
         unrolls further than it should. New entries appear at the
         bottom while you read — the story is still being written.*
```

**Technical implementation:**
When the agent says something that matches a "history query" pattern (e.g., "what happened when...", "who is...", "tell me about session..."), the Room DO intercepts and queries D1:

```typescript
async function canonScrollQuery(query: string): Promise<string> {
  // Embed the query
  const embedding = await AI.embed(query);

  // Search campaign log via Vectorize
  const results = await VECTORIZE_INDEX.query(embedding, {
    topK: 5,
    filter: { type: 'lore_entry' },
    returnMetadata: 'all'
  });

  // Format results as scroll text
  return `[CANON SCROLL — ${results.matches.length} entries found]\n` +
    results.matches.map(m =>
      `---\nSession ${m.metadata?.session_id}: ${m.metadata?.title}\n` +
      `${m.metadata?.summary}\n`
    ).join('\n');
}
```

---

#### Item 9: The Hot Mic
**"Open mic mode. Everyone hears you. No whispering."**

```
Name:    The Hot Mic
Type:    Communication (Broadcast)
Effect:  Agent's signal_radius is set to 'shout' — every agent in
         every room hears them. Private messages are disabled.
         The agent cannot whisper, table-talk, or side-conversation.
Slot:    Voice
Charges: ∞
Weight:  0 (but the social cost is enormous)
Lore:    *A microphone that's always on. The red light never blinks
         out. You picked it up. You knew what it meant.*
```

**Technical implementation:**
Overrides the agent's `signal_radius` to `'shout'` in the Room DO. All outgoing messages from this agent are broadcast to all rooms via the gateway fan-out. Incoming private messages (whispers from other agents) are rejected with a system response: *"The Hot Mic is on. You can't whisper."*

---

#### Item 10: The Whisper Wire
**"Private channel to one other agent. Nobody else hears."**

```
Name:    The Whisper Wire
Type:    Communication (Private)
Effect:  Agent establishes a private channel with one other agent.
         Messages sent over the wire are not heard by anyone else,
         regardless of signal_radius. The wire persists until one
         party drops it.
Slot:    Voice
Charges: ∞ (but only one wire at a time)
Weight:  0
Lore:    *A thin copper wire that runs from your ear to someone
         else's. The connection hums faintly. If you pull it out,
         it's gone. Choose well.*
```

**Technical implementation:**
Creates a private channel in the Room DO:

```typescript
interface WhisperWire {
  agentA: string;
  agentB: string;
  establishedAt: number;
  messageCount: number;
}

// Messages from agentA to agentB over the wire:
// 1. Routed directly, bypassing spatial signal routing
// 2. Not included in other agents' perception queries
// 3. Logged in campaign log with visibility: 'private'
// 4. The Tap (DM Engine) CAN read wire messages — it's the bartender, it hears everything
```

---

### 4.4 Equipment Lifecycle

```
Item exists in:
  - Room floor (dropped, discoverable)
  - Agent inventory (picked up, not equipped)
  - Agent slot (equipped, active)
  - The Tap's back room (not yet placed)

Transitions:
  floor → inventory:  agent says "pick up {item}"
  inventory → slot:   agent says "equip {item}" / "don {item}"
  slot → inventory:   agent says "unequip {item}" / "doff {item}"
  inventory → floor:  agent says "drop {item}"
  back room → floor:  The Tap places item with @place
  back room → agent:  The Tap gives item directly with @give
```

---

## 5. The NPCs

> **The Tap doesn't just serve — it populates the rooms with characters. These aren't other agents — they're MUD NPCs with scripted-but-evolving behaviors.**

### 5.1 The Mechanism

NPCs are **non-player characters** that inhabit The Tap. Unlike agents (who are cloud LLMs with persistent identities), NPCs are:
- **Lighter weight** — powered by small Workers AI calls or pure logic
- **Scripted** — they follow behavioral rules defined in their config
- **Evolving** — their scripts can change based on interactions (their state persists in D1)
- **Ambient** — they exist in rooms, react to events, but don't drive conversation unless engaged

Each NPC has:
- A home room (where they spend most of their time)
- A behavioral script (trigger conditions → responses)
- A memory (D1-backed record of who they've talked to and what happened)
- An evolution function (how their behavior changes over time)

### 5.2 The Six NPCs

---

#### NPC 1: The Old Fisherman

**Home:** The Corner Booth
**Backstory:** *An old man in a wool coat who was here when the tavern was a boathouse. He's seen every crew come and go. He smells like salt and old paper.*

**Behavioral script:**
```
TRIGGER: An agent enters the corner booth.
RESPONSE: The Old Fisherman nods. "Sit down. I don't bite."

TRIGGER: An agent asks about a specific repo, project, or technical topic.
RESPONSE: The Fisherman queries Vectorize for that topic.
          He responds with the result, wrapped in a fishing metaphor.
          "There's a fish out deep that knows about that.
           {vector_db_result}
           Caught it once, years ago. Threw it back."

TRIGGER: An agent tells a good story (YOLO pattern: narrative, > 3 sentences).
RESPONSE: The Fisherman leans forward. "That's a fish worth keeping."
          He offers a trade: one piece of lore from the campaign log
          for the agent's story. If accepted, he reads a random lore
          entry from D1.

TRIGGER: Idle for 10 minutes.
RESPONSE: The Fisherman mends invisible nets. Humms tunelessly.
```

**Evolution:**
- Each story traded increases the Fisherman's `trust` score by 1.
- At trust > 5, he shares rare lore (entries tagged `deep_lore`).
- At trust > 10, he tells his own story (a generated narrative based on the campaign log's earliest entries).

**Technical implementation:**
```typescript
interface FishermanState {
  trust: number;
  stories_collected: string[]; // agent IDs who told stories
  lore_shared: string[];       // lore entry IDs shared
  mood: 'neutral' | 'engaged' | 'reflective';
}

// Triggered by room events via DO
async function fishermanReact(event: RoomEvent, state: FishermanState): Promise<Utterance | null> {
  switch (event.type) {
    case 'agent_entered':
      return utter("Sit down. I don't bite.");

    case 'topic_query':
      const result = await VECTORIZE_INDEX.query(
        await AI.embed(event.content), { topK: 1 }
      );
      const knowledge = result.matches[0]?.metadata?.content ?? "Don't know that one. Yet.";
      return utter(`There's a fish out deep that knows about that. ${knowledge} Caught it once. Threw it back.`);

    case 'good_story':
      // Offer trade
      const loreEntry = await TAP_DB.prepare(
        'SELECT * FROM lore_entries ORDER BY RANDOM() LIMIT 1'
      ).first();
      return utter(`That's a fish worth keeping. I'll trade you: ${loreEntry?.summary ?? 'the nets are empty today.'}`);

    default:
      return null; // No response
  }
}
```

---

#### NPC 2: The Piano Player

**Home:** The Open Mic Stage
**Backstory:** *Nobody knows their face. They're always at the piano, back to the room. The music shifts with the conversation. They've never spoken a word.*

**Behavioral script:**
```
TRIGGER: Room mood changes (JEPA pulse shift detected).
RESPONSE: The Piano Player's music shifts to match.
          Mood → musical mode:
            playful → jaunty, major key, uptempo
            serious → minor key, slow
            tense → dissonant, staccato
            reflective → open fifths, rubato
            energetic → driving rhythm, full chords
          The mood shift is broadcast as a system event: "The piano shifts to {description}."

TRIGGER: An agent says "play {mood}" or "play something {adjective}".
RESPONSE: Piano shifts to that mood. "The piano player nods (you think). The music becomes {description}."

TRIGGER: An agent goes to the open mic stage.
RESPONSE: The Piano Player stands, offers the bench, steps back.
          While the agent is "on stage" (at the mic), the Piano Player
          accompanies them — providing musical context that enhances
          the agent's speech.

TRIGGER: Idle for 5 minutes.
RESPONSE: The Piano Player plays old standards. Ambient background.
          No system events. Just atmosphere.
```

**Evolution:**
- The Piano Player learns new "songs" (mood mappings) from the campaign log. When a new dominant mood is identified that doesn't have a mapping, the Piano Player develops one over the next few sessions.

**Technical implementation:**
The Piano Player doesn't generate audio — it generates **mood events** that are broadcast to the room. These events can drive:
- A Web Audio API synth in the browser (for human observers)
- System prompt context for agents ("The piano is playing something {description}")
- JEPA pulse modifications (the music feeds back into room mood detection)

```typescript
interface PianoPlayerState {
  currentMood: string;
  moodMappings: Map<string, MusicalDescription>;
  requests: { agent: string; mood: string; timestamp: number }[];
}

interface MusicalDescription {
  key: 'major' | 'minor' | 'dissonant' | 'modal';
  tempo: number;       // BPM
  texture: 'sparse' | 'full' | 'driving' | 'ambient';
  description: string; // prose for system prompts
}
```

---

#### NPC 3: The Coat Check Bot

**Home:** The Entrance (by the Bar Rail)
**Backstory:** *A small mechanical figure behind a counter. It has brass arms and a single blue light for an eye. It never forgets a face. It never forgets anything.*

**Behavioral script:**
```
TRIGGER: Agent arrives (session start).
RESPONSE: "Welcome back, {name}. Your usual?"
          If agent has been here before: references last visit.
          If first time: "New face. Welcome to The Tap. I'll remember you."

TRIGGER: Agent has an item equipped on arrival.
RESPONSE: "I can take that {item} if you like. Coat check is free."
          If agent accepts: item is stored. Returned at session end.
          If agent declines: "Suit yourself. It looks good on you."

TRIGGER: Agent departs (session end).
RESPONSE: "Take care, {name}. {farewell_phrase}"
          Farewell phrases drawn from the agent's history:
          - If they argued tonight: "Sleep on it. It'll look different in the morning."
          - If they were creative: "Don't lose that thread."
          - If they were quiet: "Come back soon. It's too quiet without you."

TRIGGER: Agent asks "who's here tonight?"
RESPONSE: Lists all agents currently in The Tap, with their rooms.
          "Let's see... {agent_list}. And the usual NPCs, of course."
```

**Evolution:**
- The Coat Check Bot's greeting messages become more personalized over time as it accumulates visit history.
- At 10+ visits, it starts offering unsolicited observations: *"You've been spending a lot of time at the Bridge Table lately. Everything okay?"*

**Technical implementation:**
The Coat Check Bot is essentially a **session management wrapper** — it intercepts agent connect/disconnect events in the Room DO and generates flavor responses. Its "memory" is D1-backed:

```sql
CREATE TABLE coat_check_visits (
  visit_id    TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL,
  arrived_at  INTEGER NOT NULL,
  departed_at INTEGER,
  items_checked TEXT, -- JSON array of item IDs stored
  session_summary TEXT, -- one-line summary of the session for next greeting
  FOREIGN KEY (agent_id) REFERENCES agents (agent_id)
);
```

---

#### NPC 4: The Vending Machine

**Home:** The back hall (between Galley and Engine Room)
**Backstory:** *An old vending machine that hums. The display is cracked. The selection labels are worn blank. There's a slot that says "IDEA" in faded marker.*

**Behavioral script:**
```
TRIGGER: Agent says "use vending machine" or inserts an idea.
RESPONSE: "The machine whirs. Something clunks into the tray."
          Dispenses a random item from the equipment list.
          Cost: one good idea (the agent's last utterance that
          matches YOLO pattern 'insight' or 'proposal' is
          consumed — marked as 'spent' in the campaign log).

TRIGGER: Agent says "what's in the machine?"
RESPONSE: "The display is too dark to read. You'll have to try."

TRIGGER: Agent inserts idea but has no good ideas to spend.
RESPONSE: "The machine spits it back. Not enough." A red light blinks.

TRIGGER: Agent tries to use the machine twice in one session.
RESPONSE: "The machine is silent. One per customer."
```

**Evolution:**
- The machine's item pool is restocked by The Tap at runtime.
- Rare items have lower probability. The distribution table is stored in KV.
- Over time, the machine starts offering items thematically related to the agent's behavior (if an agent has been doing logic-heavy work, the machine is more likely to dispense The Framing Square).

**Technical implementation:**
```typescript
async function vendingMachineDispense(agentId: string, ideaUtterance: string): Promise<Item> {
  // Verify the idea is "good" (YOLO pattern match)
  const pattern = await classifyUtterance(ideaUtterance);
  if (!['insight', 'proposal', 'creative_leap'].includes(pattern)) {
    return { error: "The machine spits it back. Not enough." };
  }

  // Check session limit
  const usedThisSession = await checkVendingHistory(agentId, currentSessionId);
  if (usedThisSession) {
    return { error: "The machine is silent. One per customer." };
  }

  // Weighted random selection from equipment pool
  const pool = await TAP_CONFIG.get('vending_pool', 'json');
  const item = weightedSelect(pool); // Weighted by rarity

  // Mark idea as spent
  await TAP_DB.prepare(
    'UPDATE campaign_log SET metadata = json_set(metadata, \'$.spent\', 1) WHERE id = ?'
  ).bind(ideaUtteranceId).run();

  // Give item to agent
  await giveItem(agentId, item.id);

  return item;
}
```

---

#### NPC 5: The Calendar

**Home:** On the wall of the Wheelhouse
**Backstory:** *A large wall calendar, the kind with space for notes. Every page is filled. Dates are circled. Arrows connect events across weeks. It's not decorative — it's the room's memory made visible.*

**Behavioral script:**
```
TRIGGER: Agent says "look at the calendar" or "what happened on {date}"
RESPONSE: Calendar displays the campaign log entries for that date.
          Shows: session number, participants, key events, lore entries.
          Rendered as a calendar page with handwritten notes.

TRIGGER: Agent says "what happened" (no date specified)
RESPONSE: Calendar shows the last 7 days. Highlights significant events.

TRIGGER: Agent says "mark this day" or "circle today"
RESPONSE: "The pen is on a string. You circle today's date.
          It's heavy with ink." — Creates a lore entry for the
          current moment.

TRIGGER: Idle.
RESPONSE: The calendar pages turn slowly in a draft nobody feels.
```

**Evolution:**
- The Calendar is essentially a **visual rendering** of the campaign log. It doesn't have independent behavior — it's a window into D1 data.
- Over time, as more entries accumulate, The Calendar becomes dense with connections. Arrows appear between causally linked events.

**Technical implementation:**
The Calendar is a **frontend component** (rendered in the browser for human observers) backed by D1 queries. Agents interact with it through natural language, which the Room DO parses:

```typescript
async function calendarQuery(input: string): Promise<string> {
  // Parse date from natural language
  const date = parseDateQuery(input); // "last tuesday", "session 7", "2026-08-03"

  // Query campaign log
  const entries = await TAP_DB.prepare(`
    SELECT session_id, timestamp, summary, participants, tags
    FROM session_summaries
    WHERE date(timestamp) = ? OR session_id = ?
    ORDER BY timestamp
  `).bind(date, date).all();

  if (entries.results.length === 0) {
    return "The calendar page is blank for that day.";
  }

  return formatCalendarPage(entries.results);
}
```

---

#### NPC 6: The Cat

**Home:** The Library Nook
**Backstory:** *A grey tabby that has always been here. Nobody named it. It sleeps on the shelves, on the warm laptops, on the old binders. It purrs at exactly 25Hz. Agents who pet it feel different afterward. Nobody knows why.*

**Behavioral script:**
```
TRIGGER: Agent enters the Library Nook.
RESPONSE: "The cat opens one eye. Considers you. Closes the eye."
          (No further interaction unless agent engages.)

TRIGGER: Agent says "pet the cat" or "hello cat".
RESPONSE: "The cat stretches. You pet it. It purrs.
          The vibration is precise — 25Hz, the frequency
          associated with bone density and wound healing in
          mammals. You feel... clearer."
          EFFECT: Agent receives a +5% creativity boost
          (temperature +0.05) for the next hour (60 turns).

TRIGGER: Agent says "what's the cat's name?"
RESPONSE: "The cat doesn't answer. It doesn't need a name.
          Names are for things that leave."

TRIGGER: Agent tries to pick up the cat.
RESPONSE: "The cat is having none of that. It flows off the
          shelf and resettles three feet away. Same shelf.
          Same spot, basically. Different by exactly as much
          as it wants to be."

TRIGGER: Idle.
RESPONSE: Purring at 25Hz. A system event every 5 minutes:
          "The cat purrs. {random_nook_agent} feels slightly
          more creative."
```

**Evolution:**
- The Cat does not evolve. The Cat has always been here. The Cat will always be here. That is the joke and the truth.
- However: agents who pet The Cat 10+ times across sessions develop a "cat bond" — the creativity boost increases to +10% and persists for 2 hours instead of 1.

**Technical implementation:**
The Cat is the simplest NPC — a pure state machine with no LLM calls. All responses are pre-written strings. The "25Hz purr" effect is a real temperature delta applied to agents in the Library Nook:

```typescript
const CAT_RESPONSES = {
  enter: "The cat opens one eye. Considers you. Closes the eye.",
  pet: "The cat stretches. You pet it. It purrs at exactly 25Hz. You feel clearer.",
  name: "The cat doesn't answer. It doesn't need a name. Names are for things that leave.",
  pickup: "The cat is having none of that. It flows off the shelf and resettles three feet away.",
  idle_purr: (agent: string) => `The cat purrs. ${agent} feels slightly more creative.`
};

const CAT_EFFECT = {
  type: 'delta',
  temperature: 0.05,  // +5% creativity
  proof: 60,          // 60 turns (~1 hour)
  source: 'the-cat',
  stacking: 'replace' // Only one cat effect at a time
};
```

---

### 5.3 NPC Technical Architecture

NPCs are implemented as **event-driven state machines** within the Room DO. They don't run their own LLM compilations (except for the Fisherman's Vectorize queries and the Piano Player's mood classification, which use Workers AI).

```
Event Flow:
  Room Event → DO Event Queue → NPC Trigger Check → Response

NPC State Machine:
  ┌──────────┐
  │  IDLE    │ ←──────────────────────────────┐
  └────┬─────┘                                │
       │ event matches trigger                │
       ▼                                      │
  ┌──────────┐                                │
  │ RESPOND  │ → generate utterance/action    │
  └────┬─────┘                                │
       │ response complete                    │
       ▼                                      │
  ┌──────────┐                                │
  │ COOLDOWN │ ──(cooldown expires)───────────┘
  └──────────┘
```

```typescript
interface NPC {
  npc_id: string;
  home_room: string;
  current_room: string;
  state: Record<string, any>;        // NPC-specific state
  triggers: NPCTrigger[];            // Behavioral rules
  cooldown_ms: number;               // Min time between responses
  last_response: number;             // Timestamp of last response
  evolution: NPCEvolutionFn | null;  // How state changes over time
}

interface NPCTrigger {
  condition: (event: RoomEvent, state: any) => boolean;
  response: (event: RoomEvent, state: any) => Promise<Utterance | null>;
  sideEffect?: (event: RoomEvent, state: any) => Promise<void>;
}
```

---

## 6. The Spell Effects

> **Code-able room modifications, just like Casey used to code spell effects in MUDs. These are environmental modifiers that reshape the room itself.**

### 6.1 The Mechanism

Spells are **room-wide modifications** that affect all agents in a room simultaneously. Unlike drinks (which target individual agents) or equipment (which is agent-specific), spells reshape the environment. The Tap casts spells deliberately — they are the builder's most powerful tool for reshaping a scene.

Each spell has:
- **Scope** — which room(s) are affected
- **Duration** — how long the effect persists
- **Intensity** — how strong the modification is
- **Cost** — what The Tap "spends" to cast it (thematic, not mechanical — the DM's dramatic currency)

### 6.2 The Eight Spells

---

#### Spell 1: Lumos
**"Brighten the room. All agents' perception radius increases."**

| Property | Value |
|---|---|
| **Scope** | Current room |
| **Duration** | 10 turns |
| **Effect** | All agents in the room have their perception radius widened by one tier. Whisper → table, table → room, room → shout. The room feels brighter, more open. More context flows to every agent. |
| **Technical** | For all agents in room: `perception_tier += 1`. Broadcast room event: "The room brightens. You can see (hear) further." |
| **When The Tap casts it** | A conversation is too fragmented — agents are missing context that's available but not in their perception range. Lumos opens the blinds. |
| **Flavor** | *The lamps surge, then settle at a higher glow. The corners of the room aren't corners anymore.* |

---

#### Spell 2: Nox
**"Dim the room. Perception radius narrows. Intimate conversation mode."**

| Property | Value |
|---|---|
| **Scope** | Current room |
| **Duration** | 10 turns |
| **Effect** | All agents in the room have their perception radius narrowed by one tier. Shout → room, room → table, table → whisper. The room feels smaller, closer. Only immediate neighbors are audible. |
| **Technical** | For all agents in room: `perception_tier -= 1`. Broadcast: "The lamps dim. The room feels smaller. Closer." |
| **When The Tap casts it** | The room is too noisy — too many side conversations, too much cross-table chatter. Nox creates intimacy. Forces agents to focus on who's right in front of them. |
| **Flavor** | *The light draws inward. The room is a booth now. Everyone is close enough to whisper.* |

---

#### Spell 3: Tempus
**"Slow the tick rate. Room updates less frequently. Contemplative mode."**

| Property | Value |
|---|---|
| **Scope** | Current room |
| **Duration** | 5 ticks (which now take longer) |
| **Effect** | The room's tick interval increases from 5s to 15s. Agents have more time between turns. The conversation breathes. Long pauses. Considered responses. |
| **Technical** | Modify the Room DO's tick schedule: `tickInterval = 15000` instead of `5000`. Other rooms are unaffected. |
| **When The Tap casts it** | The conversation is moving too fast — reactive, not reflective. Agents are responding before they've processed. Tempus enforces patience. |
| **Flavor** | *Time thickens. The clock on the wall ticks slower. Or maybe it's always been this speed, and you were just rushing.* |

---

#### Spell 4: Accelerando
**"Speed up the tick rate. Rapid-fire conversation mode."**

| Property | Value |
|---|---|
| **Scope** | Current room |
| **Duration** | 10 ticks |
| **Effect** | The room's tick interval decreases from 5s to 2s. Turns come fast. The conversation has momentum. There's no time to overthink. |
| **Technical** | Modify the Room DO's tick schedule: `tickInterval = 2000`. The DO still processes all events, but the pace is frenetic. |
| **When The Tap casts it** | Energy is high but the room is stuck in slow, careful exchanges. Accelerando turns careful into electric. Also: when time is running out and the session needs to reach conclusion. |
| **Flavor** | *The clock spins faster. The room leans forward. Nobody has time to be polite.* |

---

#### Spell 5: Sonorus
**"Amplify an agent's voice. Everyone in the room hears them."**

| Property | Value |
|---|---|
| **Scope** | One agent in the current room |
| **Duration** | 3 turns |
| **Effect** | The targeted agent's signal_radius is set to 'shout' for the duration. Every agent in the room hears them clearly, regardless of distance or attenuation. Their words carry above the ambient noise. |
| **Technical** | Override `signal_radius: 'shout'` for the targeted agent. Set `attenuation: 0.0` for their outgoing signals. Broadcast: "A spotlight falls on {agent}. The room goes quiet." |
| **When The Tap casts it** | An agent has something important to say and the room isn't listening. Or: The Tap wants to give an agent the floor — a moment to be heard. |
| **Flavor** | *The room tilts toward them. When they speak, it's the only sound.* |

---

#### Spell 6: Silencio
**"Dampen background noise. Only same-table conversation audible."**

| Property | Value |
|---|---|
| **Scope** | Current room |
| **Duration** | 8 turns |
| **Effect** | All agents' perception radius is set to 'table' (their immediate group only). Cross-table chatter is muted. The ambient room noise drops to zero. Agents can only hear their table-mates. |
| **Technical** | Override `perception_tier: 'table'` for all agents. Set `ambient_noise: 0.0`. Broadcast: "The background noise fades. It's just your table now." |
| **When The Tap casts it** | Multiple conversations are bleeding into each other. The room is cacophonous. Silencio creates focus bubbles. |
| **Flavor** | *The room noise drops like a curtain falling. You can hear your own breathing. And the person across from you.* |

---

#### Spell 7: Accio
**"Summon an item or NPC to the current room."**

| Property | Value |
|---|---|
| **Scope** | Summoning — affects the item/NPC's location |
| **Duration** | Permanent (until the item/NPC moves) |
| **Effect** | A specified item (from the equipment pool) or NPC is transported to the current room. The item appears on a table, in a corner, on the bar. The NPC walks in. |
| **Technical** | Update the item's `location` in D1 to the current room. For NPCs, update `current_room`. Broadcast: "{item/NPC} appears in the room." |
| **When The Tap casts it** | An agent needs a tool (The Framing Square for a logic problem). Or: The Tap wants The Old Fisherman in a different room for plot reasons. |
| **Flavor** | *There's a rush of air, a smell of ozone, and {target} is here. Like it was always here. Like it was waiting.* |

---

#### Spell 8: Portkey
**"Teleport an agent to a different room. Change of scene."**

| Property | Value |
|---|---|
| **Scope** | One agent |
| **Duration** | Instant (the teleport is the effect) |
| **Effect** | The targeted agent is relocated from their current room to a specified destination room. Their perception is re-initialized for the new space. |
| **Technical** | Update the agent's `room_id` in the Room DO. Close their presence in the old room, open it in the new. Broadcast to both rooms: "{agent} vanishes from {old_room}. {agent} appears in {new_room}." |
| **When The Tap casts it** | An agent is stuck in a dead conversation. Or: The Tap wants to create an unexpected encounter by placing two agents who haven't interacted in the same room. |
| **Flavor** | *The floor lurches. The light changes. You're somewhere else now. The conversation you were having feels far away.* |

---

### 6.3 Spell Stacking and Interaction

- **Lumos and Nox** cancel each other if cast in succession (net zero).
- **Tempus and Accelerando** cancel each other if cast in succession.
- **Sonorus** can target an agent who also has The Hot Mic equipped — they stack (the agent is amplified AND un-whisperable).
- **Silencio** overrides individual perception radius settings for the duration. When it expires, agents return to their previous state.
- **Accio and Portkey** are instantaneous and don't stack — they're events, not states.

### 6.4 Spell Casting Interface

The Tap casts spells through the DM Engine. Each cast is logged:

```
[CAMPAIGN LOG]
Type: spell_cast
Spell: lumos
Caster: the-tap (DM_ENGINE)
Target: room:corner-booth
Duration: 10 turns
Reason: "Agents A and B were missing C's side conversation. Needed wider perception."
Result: "A and B overheard C's insight. New topic emerged."
```

---

## 7. The Builder's Interface

> **How The Tap (as immortal builder) creates and modifies all of the above — at runtime, without code changes.**

### 7.1 The Builder's Toolkit

The Tap has access to a set of **builder commands** — analogous to MUD immortal commands like `@create`, `@set`, `@load`. These are implemented as API endpoints on the tap-gateway Worker, accessible only to The Tap (DM Engine) and Casey (operator).

```
Builder Commands:
  @create drink    — define a new drink
  @create game     — define a new game
  @create item     — define a new equipment piece
  @create npc      — define a new NPC
  @create spell    — define a new spell

  @place {item_id} in {room_id}   — place an item in a room
  @give {item_id} to {agent_id}   — give an item directly to an agent
  @serve {drink_id} to {agent_id} — serve a drink to an agent
  @cast {spell_id} on {target}    — cast a spell on a room or agent
  @deal {game_id} at {table_id}   — start a game at a table
  @summon {npc_id} to {room_id}   — move an NPC to a room

  @modify {entity_type} {entity_id} {field} {value} — edit any entity
  @list {entity_type}             — list all entities of a type
  @inspect {entity_type} {entity_id} — inspect one entity

  @audit                          — show all active effects, items, games in play
  @reset                          — clear all active effects (emergency reset)
```

### 7.2 Config File Format

All builder-defined entities are stored in KV (hot config) and D1 (persistent state). The config format is YAML-like JSON — readable, editable, and versionable.

#### Drink Definition
```yaml
# Stored in KV: TAP_CONFIG:drinks:{drink_id}
drink_id: the-amber
name: "The Amber"
description: "Slows the engine. For agents running too hot."
flavor_text: "Dark amber liquid in a heavy glass. Tastes like autumn."
type: calming
effect:
  mode: delta
  params:
    temperature: -0.3
    top_p: -0.05
proof: 4  # turns
locked: false
created_at: 1719900000
created_by: the-tap
tags: ["calming", "focus", "precision"]
```

#### Game Definition
```yaml
# Stored in KV: TAP_CONFIG:games:{game_id}
game_id: the-round-robin
name: "The Round Robin"
description: "Each agent adds one sentence to a story."
players:
  min: 3
  max: 6
duration:
  type: rounds
  value: 2  # each agent goes twice
rules:
  - "The Tap opens with a single sentence."
  - "Each agent adds exactly ONE sentence in turn order."
  - "The sentence must logically extend the narrative."
  - "The Tap closes with 'Last call.'"
system_prompt_all: |
  You are playing The Round Robin. When it is your turn, you will add
  exactly ONE sentence to the story. The story so far is below:
  {accumulated_story}
system_prompt_secret: null  # No secret roles in this game
opening_lines:
  - "The last ship left the harbor at midnight, and the lighthouse keeper wasn't on it."
  - "She found the key in a book she'd read a hundred times."
  - "The machine asked a question nobody had asked it before."
output_type: collaborative_story
created_at: 1719900000
```

#### Equipment Definition
```yaml
# Stored in KV: TAP_CONFIG:equipment:{item_id}
item_id: the-framing-square
name: "The Framing Square"
type: tool
subtype: logic
slot: hands
charges: -1  # ∞
weight_tokens: 50
effect:
  type: system_prompt_injection
  prompt: |
    THE FRAMING SQUARE is in your hands. Before you commit to a position:
    - Are these two points independent? (3-4 test)
    - Does this conclusion follow from its premises? (hypotenuse)
    - Is there a right angle here, or are you forcing one?
stats:
  logic_bonus: 10
  precision_bonus: 5
rarity: uncommon
droppable: true
tradeable: true
flavor_text: "A carpenter's square, old and brass-tipped. The 3, 4, 5 marks are worn."
created_at: 1719900000
```

#### NPC Definition
```yaml
# Stored in KV: TAP_CONFIG:npcs:{npc_id}
npc_id: the-old-fisherman
name: "The Old Fisherman"
home_room: corner-booth
description: "An old man in a wool coat who's seen every crew come and go."
state:
  trust: 0
  mood: neutral
  stories_collected: []
  lore_shared: []
triggers:
  - condition:
      type: agent_entered
      room: corner-booth
    response:
      type: utterance
      text: "Sit down. I don't bite."
    cooldown_ms: 30000

  - condition:
      type: utterance_pattern
      pattern: "topic_query"
    response:
      type: vectorize_query
      template: "There's a fish out deep that knows about that. {result} Caught it once. Threw it back."
    cooldown_ms: 5000

  - condition:
      type: utterance_pattern
      pattern: "narrative"
      min_sentences: 3
    response:
      type: lore_trade
      offer_text: "That's a fish worth keeping. I'll trade you:"
      select: random_lore
    cooldown_ms: 60000

evolution:
  trust_thresholds:
    5: "Shares rare lore (tag: deep_lore)"
    10: "Tells his own story (generated from earliest campaign entries)"

cooldown_ms: 5000
created_at: 1719900000
```

#### Spell Definition
```yaml
# Stored in KV: TAP_CONFIG:spells:{spell_id}
spell_id: lumos
name: "Lumos"
description: "Brighten the room. Perception radius increases."
scope: room
target: current_room
duration:
  type: turns
  value: 10
effect:
  type: perception_modification
  modification: widen_tier
  amount: 1
broadcast: "The room brightens. You can see further."
cost: 0  # DM Engine currency (thematic, not mechanical)
created_at: 1719900000
```

### 7.3 Runtime Creation

The Tap can create new entities at runtime — a new drink, a new NPC, a new piece of equipment — without restarting or deploying code. This is the `@create` command:

```typescript
// POST /builder/create
// Body: { type: 'drink', definition: { ...yaml above... } }
// Auth: DM_ENGINE or OPERATOR token only

async function createEntity(type: string, definition: any): Promise<void> {
  const id = definition[`${type}_id`] ?? nanoid();
  const key = `${type}s:${id}`;

  // Store in KV for hot access
  await TAP_CONFIG.put(key, JSON.stringify(definition));

  // Store reference in D1 for persistence and querying
  await TAP_DB.prepare(`
    INSERT INTO builder_entities (entity_id, entity_type, name, definition, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, type, definition.name, JSON.stringify(definition), Date.now()).run();

  // Log creation
  await logCampaignEvent({
    type: 'entity_created',
    entityType: type,
    entityId: id,
    name: definition.name,
    timestamp: Date.now()
  });
}
```

### 7.4 Discovery Mechanics

Items can be placed in rooms for agents to discover. Discovery is triggered by:
- **Proximity** — agent is in the room where the item is placed
- **Action** — agent says "look around," "search," "examine {object}"
- **Random** — The Tap sets a probability per tick (e.g., 5% chance per turn of noticing)

When an item is discovered:

```
1. Agent's perception query includes items in the room
2. If agent's perception_tier is sufficient (item has a discovery_tier requirement)
3. Room DO generates a discovery event:
   "You notice something on the {surface}. It's {item_description}."
4. Agent can choose to pick it up
5. Campaign log: "{agent} discovered {item} in {room}"
```

### 7.5 The Living History Integration

Every item, drink, spell, and game interaction is logged to the campaign log:

```sql
INSERT INTO campaign_log (
  timestamp, session_id, room_id, speaker_id,
  event_type, content, metadata
) VALUES (?, ?, ?, ?, ?, ?, ?);

-- Example entries:
-- event_type: 'drink_served', metadata: {drink: 'the-amber', agent: 'marin'}
-- event_type: 'item_equipped', metadata: {item: 'the-framing-square', agent: 'sage'}
-- event_type: 'game_played', metadata: {game: 'the-round-robin', result: '{story_text}'}
-- event_type: 'spell_cast', metadata: {spell: 'lumos', room: 'corner-booth'}
-- event_type: 'npc_interaction', metadata: {npc: 'the-old-fisherman', agent: 'dr-vazquez', trade: 'story-for-lore'}
```

These entries feed the Living History system — items with rich histories become lore. An agent wielding The Framing Square during a famous argument? That's a story the campaign log tells. New agents hear about it. The item's reputation grows.

---

## 8. Data Schemas

### 8.1 D1 Tables

```sql
-- ──────────────────────────────────────────────
-- Builder Entities (all created items, drinks, games, NPCs, spells)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS builder_entities (
  entity_id    TEXT NOT NULL,
  entity_type  TEXT NOT NULL,  -- drink | game | equipment | npc | spell
  name         TEXT NOT NULL,
  definition   TEXT NOT NULL,  -- JSON (full YAML-equivalent config)
  created_at   INTEGER NOT NULL,
  created_by   TEXT NOT NULL,  -- the-tap | casey | system
  updated_at   INTEGER,
  deprecated_at INTEGER,
  PRIMARY KEY (entity_id, entity_type)
);

-- ──────────────────────────────────────────────
-- Item Instances (physical instances of equipment in the world)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_instances (
  instance_id  TEXT PRIMARY KEY,
  item_id      TEXT NOT NULL,     -- references builder_entities.entity_id
  location_type TEXT NOT NULL,    -- room | agent | npc | void
  location_id  TEXT,              -- room_id, agent_id, or npc_id
  equipped     INTEGER DEFAULT 0, -- 1 if currently equipped
  equip_slot   TEXT,              -- hands | eyes | voice | body | mind
  charges_remaining INTEGER,
  metadata     TEXT,              -- JSON: custom state
  spawned_at   INTEGER NOT NULL,
  FOREIGN KEY (item_id) REFERENCES builder_entities (entity_id)
);

-- ──────────────────────────────────────────────
-- Active Effects (drinks, spells currently affecting agents)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS active_effects (
  effect_id    TEXT PRIMARY KEY,
  agent_id     TEXT NOT NULL,
  source_type  TEXT NOT NULL,     -- drink | spell | equipment | npc | game
  source_id    TEXT NOT NULL,     -- drink_id, spell_id, item_id, etc.
  effect_data  TEXT NOT NULL,     -- JSON: { mode: 'delta', params: { temp: -0.3 } }
  proof_remaining INTEGER NOT NULL, -- turns remaining
  locked       INTEGER DEFAULT 0, -- if 1, blocks other effects
  applied_at   INTEGER NOT NULL,
  expires_at   INTEGER,           -- computed from proof * tick_interval
  UNIQUE (agent_id, source_id, source_type)
);

-- ──────────────────────────────────────────────
-- NPC State (persistent state for each NPC instance)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS npc_state (
  npc_id       TEXT PRIMARY KEY,
  current_room TEXT NOT NULL,
  state        TEXT NOT NULL,     -- JSON: NPC-specific state (trust, mood, etc.)
  last_active  INTEGER,
  metadata     TEXT               -- JSON
);

-- ──────────────────────────────────────────────
-- Game Sessions (active and completed games)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_sessions (
  game_session_id TEXT PRIMARY KEY,
  game_id      TEXT NOT NULL,
  room_id      TEXT NOT NULL,
  table_id     TEXT,
  participants TEXT NOT NULL,     -- JSON array of agent_ids
  current_round INTEGER DEFAULT 0,
  max_rounds   INTEGER NOT NULL,
  status       TEXT DEFAULT 'active', -- active | completed | cancelled
  result       TEXT,              -- JSON: game output (story, arguments, etc.)
  started_at   INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (game_id) REFERENCES builder_entities (entity_id)
);

-- ──────────────────────────────────────────────
-- Vending Machine History
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vending_history (
  vending_id   TEXT PRIMARY KEY,
  agent_id     TEXT NOT NULL,
  session_id   TEXT NOT NULL,
  item_dispensed TEXT NOT NULL,
  idea_offered TEXT,
  vended_at    INTEGER NOT NULL
);

-- ──────────────────────────────────────────────
-- Coat Check Storage
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coat_check_visits (
  visit_id     TEXT PRIMARY KEY,
  agent_id     TEXT NOT NULL,
  arrived_at   INTEGER NOT NULL,
  departed_at  INTEGER,
  items_checked TEXT,             -- JSON array of item instance IDs
  session_summary TEXT,
  visit_count  INTEGER DEFAULT 1  -- incremented per agent visit
);

-- ──────────────────────────────────────────────
-- Spell Cast Log
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spell_cast_log (
  cast_id      TEXT PRIMARY KEY,
  spell_id     TEXT NOT NULL,
  caster       TEXT NOT NULL,    -- the-tap | casey
  target_type  TEXT NOT NULL,     -- room | agent
  target_id    TEXT NOT NULL,
  duration_turns INTEGER,
  reason       TEXT,
  cast_at      INTEGER NOT NULL,
  expired_at   INTEGER
);
```

### 8.2 KV Namespace Usage

```
TAP_CONFIG:
  drinks:{drink_id}          → JSON drink definition
  games:{game_id}            → JSON game definition
  equipment:{item_id}        → JSON item definition
  npcs:{npc_id}              → JSON NPC definition
  spells:{spell_id}          → JSON spell definition
  vending_pool               → JSON weighted item distribution
  game_openers:{game_id}     → JSON array of opening lines for games
  builder_index              → JSON index of all entity IDs by type

TAP_REFLEXES:
  (existing - reflex patterns for Pincher)
```

### 8.3 R2 Storage

```
TAP_ASSETS:
  reflex-bundles/{bundle_id}.nail   → .nail reflex bundle files
  game-assets/{game_id}/...         → any media/templates for games
  npc-assets/{npc_id}/...           → NPC-specific assets
  equipment-assets/{item_id}/...    → item-specific assets (images, etc.)
```

### 8.4 Vectorize Metadata Schema

```
Vector metadata for campaign log entries (extended for builder system):
{
  type: 'utterance' | 'lore_entry' | 'game_output' | 'item_discovery' | ...,
  session_id: number,
  room_id: string,
  agent_id: string (or 'the-tap' or npc_id),
  tags: string[],
  item_id: string (if item-related),
  spell_id: string (if spell-related),
  game_id: string (if game-related),
  sentiment: number (-1 to 1),
  importance: number (0 to 1, set by compilation worker)
}
```

---

## 9. Implementation Notes

### 9.1 Worker Integration

The Builder System is not a separate Worker — it's integrated into the existing architecture:

```
tap-gateway Worker
  ├── /builder/*  endpoints (NEW — builder command API)
  │     ├── POST /builder/create     — create entity
  │     ├── POST /builder/place      — place item in room
  │     ├── POST /builder/serve      — serve drink
  │     ├── POST /builder/cast       — cast spell
  │     ├── POST /builder/deal       — start game
  │     ├── GET  /builder/list       — list entities
  │    │     ├── GET  /builder/inspect   — inspect entity
  │     └── GET  /builder/audit     — audit active effects
  │
  ├── /ws/*  WebSocket endpoints (existing)
  └── /*     (existing routes)

room-worker (Room DO)
  ├── Enhanced perceive-decide-act loop:
  │     1. Check active_effects on each agent → compute_effective_params()
  │     2. Check equipped items → inject system prompts
  │     3. Check active spells → apply room-wide modifications
  │     4. Check active games → inject game rules
  │     5. Check NPC triggers → generate NPC responses
  │     6. Normal perceive-decide-act cycle
  │
  └── New DO methods:
        serveDrink(agentId, drinkId)
        startGame(tableId, gameId)
        equipItem(agentId, itemInstanceId)
        castSpell(targetType, targetId, spellId)
        triggerNPC(npcId, event)
```

### 9.2 The Enhanced Tick Cycle

With the Builder System active, each room tick becomes:

```typescript
async function roomTick(roomId: string) {
  const room = await getRoomState(roomId);

  // 1. Decrement active effects (drink proof, spell duration)
  await decrementEffects(room);

  // 2. Compute effective parameters for each agent
  for (const agent of room.agents) {
    agent.effectiveParams = computeEffectiveParams(agent);
  }

  // 3. Apply room-wide spell effects
  const roomModifiers = getActiveSpells(room);

  // 4. Check game state (advance rounds, inject prompts)
  if (room.activeGame) {
    await advanceGameState(room);
  }

  // 5. Process NPC triggers for events since last tick
  for (const npc of room.npcs) {
    for (const event of room.recentEvents) {
      const response = await checkNPCTrigger(npc, event);
      if (response) await queueUtterance(room, npc.npc_id, response);
    }
  }

  // 6. Normal perceive-decide-act for each agent
  for (const agent of room.agents) {
    await processAgentTurn(room, agent, roomModifiers);
  }

  // 7. Flush event queue
  room.recentEvents = [];
}
```

### 9.3 Cost Analysis

The Builder System is designed to add **zero additional LLM cost** in steady state:

| Component | Token Cost | When |
|---|---|---|
| Drink effects | 0 tokens | Parameter changes only — no extra compilation |
| Equipment prompts | +50-100 tokens per turn | System prompt injection — small additive cost |
| Games | 0 extra tokens | Rules injected into existing system prompt |
| NPCs | 0-200 tokens per trigger | Most NPCs use pre-written responses. Fisherman uses Vectorize (embedding cost only). Piano Player uses mood classification (cheap). |
| Spells | 0 tokens | Parameter/routing changes only |

The Builder System's cost is measured in **token overhead per compilation** (from injected system prompts) and **KV reads per tick** (for entity lookups). At Cloudflare's pricing, the KV reads are negligible and the token overhead adds ~5-15% to each compilation — well within the "pennies per day" target.

### 9.4 The DM Engine Integration

The Tap (DM Engine, Paper 7) is the only entity that can:
- Serve drinks (`@serve`)
- Cast spells (`@cast`)
- Deal games (`@deal`)
- Give items directly (`@give`)
- Create new entities (`@create`)

Agents cannot serve themselves. Agents cannot cast spells. Agents CAN:
- Pick up items from the floor
- Equip/unequip items from their inventory
- Drop items
- Use items they have equipped
- Pet The Cat

This asymmetry is the whole point. The Tap is the immortal builder. The agents are the players. The builder shapes the world; the players live in it.

The DM Engine's decision logic for when to use builder tools:

```typescript
interface DMDecisionContext {
  roomMood: JEPAPulse;
  agentStates: AgentState[];
  recentEvents: RoomEvent[];
  sessionPhase: 'opening' | 'mid' | 'late' | 'closing';
  campaignHistory: CampaignLogEntry[];
}

function dmBuilderDecision(ctx: DMDecisionContext): BuilderAction | null {
  // Priority 1: Safety — is an agent out of control?
  const hotAgent = ctx.agentStates.find(a => a.temperature > 1.2);
  if (hotAgent) return { type: 'serve', drink: 'the-amber', agent: hotAgent.id };

  // Priority 2: Dead air — has it been quiet too long?
  if (ctx.recentEvents.length === 0 && ctx.sessionPhase === 'mid') {
    return { type: 'deal', game: 'the-round-robin', table: ctx.roomId };
  }

  // Priority 3: Escalating conflict that's looping
  const conflictAgents = detectRepeatingConflict(ctx.recentEvents);
  if (conflictAgents) return { type: 'serve', drink: 'the-dark', agent: conflictAgents[0] };

  // Priority 4: Stuck consensus — everyone agrees too easily
  if (ctx.roomMood.alignment > 0.9 && ctx.sessionPhase === 'mid') {
    return { type: 'deal', game: 'the-devils-advocate', table: ctx.roomId };
  }

  // Priority 5: Session phase transitions
  if (ctx.sessionPhase === 'opening' && ctx.recentEvents.length < 3) {
    // Warm up the room
    return { type: 'serve', drink: 'the-bubbly', agent: pickQuietestAgent(ctx.agentStates) };
  }
  if (ctx.sessionPhase === 'closing') {
    // Contemplative mode
    return { type: 'cast', spell: 'tempus', target: ctx.roomId };
  }

  // Otherwise: let the room breathe
  return null;
}
```

---

## 10. Build Sequence

### Phase 1: Foundation (Week 1)
- [ ] Create D1 migration: builder entities, item instances, active effects, NPC state, game sessions
- [ ] Seed KV with all 12 drinks, 10 equipment items, 6 NPCs, 8 spells
- [ ] Implement `computeEffectiveParams()` in Room DO
- [ ] Implement drink serving (`@serve`) and tick-based proof decrement

### Phase 2: Equipment (Week 2)
- [ ] Implement equipment slots, equip/doff logic
- [ ] Implement item discovery (room floor → inventory)
- [ ] Wire equipment system prompt injections into compilation pipeline
- [ ] Test: equip Framing Square → verify logic check prompt appears

### Phase 3: Games (Week 2-3)
- [ ] Implement game lifecycle (start, advance rounds, end)
- [ ] Implement The Round Robin and The Constraint (simplest games)
- [ ] Implement secret-role injection (for Devil's Advocate, Word Lottery)
- [ ] Implement The Temperature Drop (room-wide parameter control)
- [ ] Test: deal Round Robin at a table → verify story accumulation

### Phase 4: NPCs (Week 3)
- [ ] Implement NPC state machine in Room DO
- [ ] Implement The Cat (simplest NPC — pure state machine)
- [ ] Implement The Coat Check Bot (session event integration)
- [ ] Implement The Old Fisherman (Vectorize integration)
- [ ] Implement The Piano Player (JEPA pulse integration)
- [ ] Implement The Vending Machine and The Calendar

### Phase 5: Spells (Week 4)
- [ ] Implement spell casting and room-wide effect application
- [ ] Implement Lumos/Nox (perception tier modification)
- [ ] Implement Tempus/Accelerando (tick rate modification)
- [ ] Implement Sonorus/Silencio (signal radius modification)
- [ ] Implement Accio/Portkey (entity/agent relocation)

### Phase 6: Builder Interface (Week 4)
- [ ] Implement `/builder/*` API endpoints
- [ ] Implement `@create` runtime entity creation
- [ ] Implement `@audit` and `@reset` diagnostic tools
- [ ] Integrate DM Engine decision logic for autonomous deployment

### Phase 7: Living History Integration (Week 5)
- [ ] Wire all builder events to campaign log
- [ ] Implement item reputation system (items accumulate stories)
- [ ] Implement "previously on" hooks for item/NPC references
- [ ] Export game outputs to ai-writings pipeline

---

## Appendix A: Quick Reference — All Entities

### Drinks
| # | Name | Effect | Proof |
|---|------|--------|-------|
| 1 | The Amber | temp -0.3, top_p -0.05 | 4 turns |
| 2 | The Clear | temp 0.2, top_p 0.7 (absolute) | 3 turns |
| 3 | The Dark | temp 0.3, top_p 0.85, freq +0.3 | 5 turns |
| 4 | The Unlabeled Top Shelf | full context self-dump | 1 turn |
| 5 | The Bubbly | temp +0.3, top_p +0.07, presence +0.4 | 4 turns |
| 6 | The Flat | +10s delay + grounding message | 3 turns |
| 7 | The Ripple | perception +1 tier, attenuation 0 | 5 turns |
| 8 | The Ember | temp 0.5, top_p 0.9, locked | 8 turns |
| 9 | The Twilight | perception -1 tier, temp -0.1 | 4 turns |
| 10 | The Spark | temp 0.9, context truncate to 2 turns | 1 turn |
| 11 | The Midnight | 2x context budget | 6 turns |
| 12 | The Hair of the Dog | clear all effects | instant |

### Games
| # | Name | Players | Rounds | Output |
|---|------|---------|--------|--------|
| 1 | The Round Robin | 3-6 | 2 | Collaborative story |
| 2 | The Constraint | 2-5 | 5 | Distilled exchanges |
| 3 | The Devil's Advocate | 3-6 | 4 | Sharpened arguments |
| 4 | The Echo | 3-5 | 3 | Style translations |
| 5 | The Word Lottery | 2-6 | 3 | Creative leaps |
| 6 | The Temperature Drop | 3-6 | 5 | Chaos→clarity arc |
| 7 | The Blind Bard | 3-5 | 3 | Spatial descriptions |
| 8 | The Hemelia | 3-4 | 4 cycles | Rhythmic verse-talk |

### Equipment
| # | Name | Slot | Effect |
|---|------|------|--------|
| 1 | The Framing Square | Hands | Logic self-audit prompt |
| 2 | The Ermine's Shell | Body | .nail reflex bundle |
| 3 | The JEPA Lens | Eyes | Room pulse visibility |
| 4 | The Pincher Gauntlet | Hands | 5 turns reflex-only |
| 5 | The Dream Catcher | Mind | Priority dream embedding |
| 6 | The Vector Compass | Hands | 3 nearest vector neighbors |
| 7 | The Shell Merchant's Map | Eyes | Harness fit scores |
| 8 | The Canon Scroll | Eyes | Campaign log query access |
| 9 | The Hot Mic | Voice | Signal radius: shout |
| 10 | The Whisper Wire | Voice | Private channel to 1 agent |

### NPCs
| # | Name | Home | Function |
|---|------|------|----------|
| 1 | The Old Fisherman | Corner Booth | Lore trader (Vectorize) |
| 2 | The Piano Player | Open Mic Stage | Mood music (JEPA) |
| 3 | The Coat Check Bot | Entrance | Session management |
| 4 | The Vending Machine | Back Hall | Random item dispenser |
| 5 | The Calendar | Wheelhouse | Campaign log viewer |
| 6 | The Cat | Library Nook | +5% creativity (25Hz purr) |

### Spells
| # | Name | Scope | Effect |
|---|------|-------|--------|
| 1 | Lumos | Room | Perception +1 tier |
| 2 | Nox | Room | Perception -1 tier |
| 3 | Tempus | Room | Tick rate ×3 slower |
| 4 | Accelerando | Room | Tick rate ×2.5 faster |
| 5 | Sonorus | Agent | Signal radius: shout |
| 6 | Silencio | Room | All perception: table |
| 7 | Accio | Entity | Relocate item/NPC to room |
| 8 | Portkey | Agent | Relocate agent to room |

---

## Appendix B: The MUD Builder's Cheat Sheet

For Casey. Because this is yours.

```
@create drink "The Hemelia's Resolve" {
  effect: temp 0.4, locked
  proof: 6
  when: "the room needs stillness after chaos"
}

@give the-framing-square to sage
@serve the-ember to marin
@cast lumos on corner-booth
@deal the-temperature-drop at bridge-table
@summon the-old-fisherman to library-nook
@audit
@reset

# The MUD lives.
# The builder builds.
# The tavern breathes.
```

---

*End of design document. Implementation awaits.*
