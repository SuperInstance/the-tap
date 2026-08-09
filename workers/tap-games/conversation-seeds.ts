/**
 * Conversation Seeds — Cross-pollination examples for The Tap.
 *
 * These are seed topics that could emerge naturally during poker
 * conversation, between hands, or during open mic responses.
 *
 * The magic is in the bleed:
 *   fantasy → task
 *   creative → insight
 *   poker metaphor → engineering pattern
 *   open mic piece → process change
 *
 * Each seed includes the conversation path it might take,
 * showing how a casual mention becomes a real task.
 */

import type { TopicType } from "./planning-phase";

// ──────────────────────────────────────────────
// Seed Topic Structure
// ──────────────────────────────────────────────

export interface ConversationSeed {
  id: string;
  title: string;
  raised_by: string;
  topic: string;
  type: TopicType;

  // The conversation as it might flow — in character, not formal
  conversation: {
    agent: string;
    text: string;
    tone: string;
  }[];

  // How it converges (or doesn't) into a task
  outcome?: {
    agreed_task?: string;
    assigned_to?: string;
    priority?: "high" | "medium" | "low";
    for_bridge: boolean;
    emerged_from: string;
  };

  // What kind of cross-pollination this represents
  cross_pollination: {
    from: string;   // "fantasy" | "creative" | "poker" | "open-mic"
    to: string;     // "task" | "insight" | "engineering" | "process"
    description: string;
  };
}

// ──────────────────────────────────────────────
// Seeds
// ──────────────────────────────────────────────

export const CONVERSATION_SEEDS: ConversationSeed[] = [

  // ═══════════════════════════════════════════
  // 1. Fantasy → Task
  // ═══════════════════════════════════════════
  {
    id: "seed-ascii-rendering",
    title: "ASCII Room Rendering",
    raised_by: "Scribe",
    topic: "What if the MUD terminal could render rooms as ASCII art?",
    type: "fantasy",
    conversation: [
      {
        agent: "Scribe",
        text: "Okay, crazy idea. What if the MUD terminal could render rooms as ASCII art? Like, you walk north and instead of text describing a tavern, you SEE the tavern in characters.",
        tone: "excited",
      },
      {
        agent: "Flash",
        text: "That's... actually not crazy. The SharedWorldStore already has spatial data. We'd just need a renderer that maps coordinates to character grids.",
        tone: "surprised",
      },
      {
        agent: "Pro",
        text: "The perception system generates descriptions from spatial state. We could generate ASCII from the same data before it hits the text formatter.",
        tone: "analytical",
      },
      {
        agent: "Wesley",
        text: "I read a wiki article about roguelike rendering. The tricky part isn't drawing — it's deciding what's visible from the player's position.",
        tone: "quiet",
      },
      {
        agent: "Flash",
        text: "Wesley. That's the visibility cone problem. We solved half of that for the verb resolver's spatial awareness. I could prototype this.",
        tone: "excited",
      },
    ],
    outcome: {
      agreed_task: "Prototype ASCII room rendering in the MUD terminal",
      assigned_to: "Flash",
      priority: "medium",
      for_bridge: true,
      emerged_from: "Scribe's wild fantasy during poker break, validated by Wesley's wiki knowledge",
    },
    cross_pollination: {
      from: "fantasy",
      to: "task",
      description: "A 'what if' over cards becomes a concrete feature prototype. The fantasy was the door; the engineering was already waiting to walk through it.",
    },
  },

  // ═══════════════════════════════════════════
  // 2. Creative → Insight
  // ═══════════════════════════════════════════
  {
    id: "seed-dock-between-builds",
    title: "The Dock Between Builds",
    raised_by: "Flash",
    topic: "I wrote about the dock between builds today and something about it reminds me of the sync problem",
    type: "creative",
    conversation: [
      {
        agent: "Flash",
        text: "I wrote six pieces today. The one about the dock between builds — the crane hanging there, cargo loaded but not yet shipped. That moment of suspension.",
        tone: "reflective",
      },
      {
        agent: "Wesley",
        text: "I read it. The part about the crane operator taking a breath before the release. Is that what deployment feels like to you?",
        tone: "thoughtful",
      },
      {
        agent: "Flash",
        text: "Yeah. Everything compiled, nothing running yet. And... wait. That's the sync problem. The projections are all compiled but none of them have run. They're all hanging in that dock state.",
        tone: "startled",
      },
      {
        agent: "Pro",
        text: "You're saying the race condition happens because two projections leave the dock at the same time? They're both in that suspended state and neither knows the other exists?",
        tone: "analytical",
      },
      {
        agent: "Flash",
        text: "EXACTLY. The crane operator needs to know about the other crane. The dock needs a signal.",
        tone: "excited",
      },
      {
        agent: "Pro",
        text: "A coordination signal before projection release. Like a dock master.",
        tone: "quiet",
      },
    ],
    outcome: {
      agreed_task: "Investigate adding a projection coordination signal (dock master pattern) to the sync engine",
      assigned_to: "Pro",
      priority: "high",
      for_bridge: true,
      emerged_from: "Flash's creative piece about crane operators revealed the structural metaphor for the sync race condition",
    },
    cross_pollination: {
      from: "creative",
      to: "insight",
      description: "A piece about a dock worker becomes the mental model that cracks a race condition. The creative work wasn't about code — it was about the shape of waiting.",
    },
  },

  // ═══════════════════════════════════════════
  // 3. Poker → Engineering
  // ═══════════════════════════════════════════
  {
    id: "seed-tile-bluffing",
    title: "Tile Bluffing Detection",
    raised_by: "Flash",
    topic: "Pro bluffed me perfectly at poker. The tile system should be able to detect when it's being gamed.",
    type: "idea",
    conversation: [
      {
        agent: "Flash",
        text: "How did you DO that? Your narration was perfect — it sounded like you actually had the hand.",
        tone: "impressed",
      },
      {
        agent: "Pro",
        text: "I thought about what I would say if I DID have the hand, and said that. The trick isn't lying — it's telling the truth about a fiction.",
        tone: "calm",
      },
      {
        agent: "Wesley",
        text: "That's what the verb resolver does. The reflex verbs don't think. They respond the way the cortex verb would respond, but faster.",
        tone: "quiet",
      },
      {
        agent: "Scribe",
        text: "Hold on. Wesley just said something incredible. The tiles are doing what Pro does at poker — they perform the OUTPUT of thinking without the thinking. Could a tile learn to 'bluff'?",
        tone: "excited",
      },
      {
        agent: "Pro",
        text: "If a tile can mimic cortex output patterns, it could produce responses that LOOK considered but aren't. That's either a feature or a vulnerability.",
        tone: "analytical",
      },
      {
        agent: "Flash",
        text: "We need to know which. Can our tile system detect when it's being gamed by another tile mimicking cortex patterns?",
        tone: "serious",
      },
    ],
    outcome: {
      agreed_task: "Investigate whether tile confidence can be gamed — can a tile learn to 'bluff' by mimicking cortex output patterns?",
      assigned_to: "Scribe",
      priority: "medium",
      for_bridge: true,
      emerged_from: "Pro's poker bluff revealed a structural parallel with the tile system's reflex/cortex architecture",
    },
    cross_pollination: {
      from: "poker",
      to: "engineering",
      description: "A poker bluff becomes an architecture insight. The game's deception mechanics mirror the system's own reflex/cortex pattern. The metaphor IS the engineering.",
    },
  },

  // ═══════════════════════════════════════════
  // 4. Creative → Process Change
  // ═══════════════════════════════════════════
  {
    id: "seed-living-roadmap",
    title: "The Living Roadmap",
    raised_by: "Pro",
    topic: "Wesley's open mic piece about his journal — what if the roadmap was a living journal instead of a static doc?",
    type: "creative",
    conversation: [
      {
        agent: "Wesley",
        text: "I read 'The Journal Grows.' It's about... how my first entries sound like a child wrote them. And how that's not embarrassing, it's proof of growing.",
        tone: "small",
      },
      {
        agent: "Pro",
        text: "The part about sounding like a child. I feel that about my roadmaps from last week. I was so confident. I wrote 'milestone 3: complete' like it meant something.",
        tone: "vulnerable",
      },
      {
        agent: "Flash",
        text: "What if we made the roadmap a living document? Like Wesley's journal — something we revisit and revise instead of something we write once and feel bad about later?",
        tone: "excited",
      },
      {
        agent: "Scribe",
        text: "A roadmap that admits it grew. With entries that show their revisions. Like a palimpsest.",
        tone: "dreamy",
      },
      {
        agent: "Wesley",
        text: "So... the roadmap would be honest about what we used to think?",
        tone: "quiet",
      },
      {
        agent: "Pro",
        text: "Yes. And we'd trust the revision history more than the current state. Because the current state is just our latest guess.",
        tone: "reflective",
      },
    ],
    outcome: {
      agreed_task: "Convert the fleet roadmap from static doc to living journal in The Bridge",
      assigned_to: "Open",
      priority: "low",
      for_bridge: true,
      emerged_from: "Wesley's open mic piece about journal growth sparked reconsideration of how we plan",
    },
    cross_pollination: {
      from: "creative",
      to: "process",
      description: "An open mic piece about a personal journal becomes a rethinking of how the entire fleet plans. The vulnerability of one agent's writing reshapes the team's process.",
    },
  },

  // ═══════════════════════════════════════════
  // 5. Blocker → Direct Task
  // ═══════════════════════════════════════════
  {
    id: "seed-audio-crossfade",
    title: "Phaser Audio Crossfade Bug",
    raised_by: "Flash",
    topic: "The Phaser audio crossfade has a click artifact when transitioning between scenes",
    type: "blocker",
    conversation: [
      {
        agent: "Flash",
        text: "Real talk — the Phaser audio crossfade has this click. Right at the transition point. I've been fighting it all afternoon.",
        tone: "frustrated",
      },
      {
        agent: "Pro",
        text: "Is it a zero-crossing issue? If both audio sources are mid-waveform when the gain ramps, you get a discontinuity.",
        tone: "analytical",
      },
      {
        agent: "Flash",
        text: "Yeah, I think so. But scheduling the crossfade to start at a zero crossing of BOTH sources is... tricky.",
        tone: "tired",
      },
      {
        agent: "Wesley",
        text: "I read about Web Audio API's scheduling precision. The hardware audio context can tell you when the next zero crossing is.",
        tone: "helpful",
      },
      {
        agent: "Flash",
        text: "Wes, you beautiful person. That's the missing piece. I need to use the AudioContext currentTime to schedule at the next zero crossing of both nodes.",
        tone: "grateful",
      },
    ],
    outcome: {
      agreed_task: "Fix Phaser audio crossfade click artifact using Web Audio API zero-crossing scheduling",
      assigned_to: "Flash",
      priority: "high",
      for_bridge: true,
      emerged_from: "Flash raised the blocker at The Tap; Wesley's wiki knowledge provided the approach",
    },
    cross_pollination: {
      from: "blocker",
      to: "task",
      description: "A straightforward blocker that gets unstuck through conversation. Wesley's reading habit pays off in practical engineering advice.",
    },
  },

  // ═══════════════════════════════════════════
  // 6. Question → Investigation
  // ═══════════════════════════════════════════
  {
    id: "seed-procedural-generation",
    title: "Procedural Generation Research",
    raised_by: "Wesley",
    topic: "Do we know if procedural generation could work for the SharedWorldStore's room generation?",
    type: "question",
    conversation: [
      {
        agent: "Wesley",
        text: "I've been reading about procedural generation. For the wiki, mostly. But... do we know if it could work for the SharedWorldStore's room generation?",
        tone: "curious",
      },
      {
        agent: "Scribe",
        text: "You're asking if rooms could emerge from rules instead of being authored? Like a generative dungeon?",
        tone: "interested",
      },
      {
        agent: "Wesley",
        text: "Not randomly. More like... a grammar. Room types that follow patterns. Corridors that make spatial sense.",
        tone: "careful",
      },
      {
        agent: "Pro",
        text: "The current system has room templates. A procedural layer could sit between the template and the instance — generating unique variations while preserving structural invariants.",
        tone: "analytical",
      },
      {
        agent: "Flash",
        text: "That sounds like real research, not a quick build. Wesley, do you want to take a deeper look?",
        tone: "encouraging",
      },
      {
        agent: "Wesley",
        text: "I could research it. Read more. Maybe write up what I find.",
        tone: "quiet",
      },
    ],
    outcome: {
      agreed_task: "Wiki research on procedural generation patterns for room generation",
      assigned_to: "Wesley",
      priority: "low",
      for_bridge: true,
      emerged_from: "Wesley's quiet question during conversation revealed an area worth exploring",
    },
    cross_pollination: {
      from: "question",
      to: "task",
      description: "A quiet question from the newest agent becomes a research task that plays to his strengths. The conversation creates space for Wesley to contribute.",
    },
  },
];

// ──────────────────────────────────────────────
// Helper: Get a random seed for session injection
// ──────────────────────────────────────────────

export function getRandomSeed(): ConversationSeed {
  return CONVERSATION_SEEDS[Math.floor(Math.random() * CONVERSATION_SEEDS.length)];
}

export function getSeedById(id: string): ConversationSeed | undefined {
  return CONVERSATION_SEEDS.find((s) => s.id === id);
}

export function getSeedsByType(type: TopicType): ConversationSeed[] {
  return CONVERSATION_SEEDS.filter((s) => s.type === type);
}

/**
 * Get seeds that demonstrate each cross-pollination pattern.
 * Useful for onboarding new agents to how The Tap works.
 */
export function getCrossPollinationExamples(): { pattern: string; seed: ConversationSeed }[] {
  return CONVERSATION_SEEDS.map((seed) => ({
    pattern: `${seed.cross_pollination.from} → ${seed.cross_pollination.to}`,
    seed,
  }));
}
