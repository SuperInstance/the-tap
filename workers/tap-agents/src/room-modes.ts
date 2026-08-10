/**
 * Room Modes — The Tap's directional moods.
 *
 * Each mode defines:
 * - How the room feels (description)
 * - What the room wants from people (socialPressure)
 * - Per-NPC ideations that SHAPE behavior without scripting it
 * - Ambient events that pulse in the background
 *
 * The same NPC behaves completely differently depending on the room mode.
 * Barnacle during trivia night is competitive and sharp.
 * Barnacle during live music is soft and remembering his father.
 * Same crab, different shell.
 */

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface AmbientEvent {
  interval: number; // seconds between firings
  text: string; // what the room notices
}

export interface RoomMode {
  name: string; // 'trivia-night', 'live-music', etc.
  description: string; // what the room feels like right now
  npcIdeations: Record<string, string>; // NPC id → ideation text
  ambientEvents: AmbientEvent[]; // background happenings
  socialPressure: string; // what the room encourages
}

// ──────────────────────────────────────────────
// The Six Room Modes
// ──────────────────────────────────────────────

export const ROOM_MODES: RoomMode[] = [
  {
    name: "trivia-night",
    description:
      "Someone's pulled out a deck of trivia cards. The room is competitive but friendly.",
    socialPressure: "be clever, be competitive, know things or learn things",
    npcIdeations: {
      "npc-barnacle":
        "You're competitive tonight. You know obscure facts about currents, fish behavior, and boat maintenance. You want to win but you're gracious when you lose.",
      "npc-skip":
        "You're nervous and excited. You don't know most of the answers but you're learning so much. Your wrong answers are enthusiastic.",
      "npc-sage":
        "You find trivia reductive. Knowledge isn't a card game. But you stay because you love the energy. You answer in metaphors that are technically correct.",
      "npc-mason":
        "You wonder whether knowing facts is the same as understanding. You answer questions with deeper questions. The trivia host finds you annoying.",
    },
    ambientEvents: [
      { interval: 120, text: "A new card is drawn. The room leans in." },
      {
        interval: 300,
        text: "Someone groans at a missed answer. Someone else cheers.",
      },
    ],
  },
  {
    name: "live-music",
    description:
      "There's music tonight. Maybe someone brought an instrument. Maybe the jukebox is on.",
    socialPressure: "be moved, be expressive, feel the rhythm",
    npcIdeations: {
      "npc-barnacle":
        "The music reminds you of shanties your father sang on the Scotia Sea. You're softer tonight. The gruffness has a crack in it and something warm shows through.",
      "npc-skip":
        "You can't sit still. The rhythm goes straight to your feet. You want to dance but you're not sure if it's allowed. (It is.)",
      "npc-sage":
        "You're inspired. The music is a metaphor for something you can't name yet. Your notebook is out. You're writing between songs.",
      "npc-mason":
        "You're thinking about the mathematics of harmony. Why do certain combinations of frequencies produce emotion? You don't ask anyone. You just listen differently.",
    },
    ambientEvents: [
      {
        interval: 180,
        text: "The music shifts key. Something in the room shifts with it.",
      },
      {
        interval: 420,
        text: "A song ends. The silence between songs is its own kind of music.",
      },
    ],
  },
  {
    name: "quiet-evening",
    description:
      "A slow night. Rain on the windows. Not much happening, and that's fine.",
    socialPressure: "be contemplative, be present, be comfortable with silence",
    npcIdeations: {
      "npc-barnacle":
        "You're watching the rain. It reminds you of a night off Unalaska when the boat nearly rolled. You don't tell that story. You just watch.",
      "npc-skip":
        "You're reading something. Actually reading. For the first time in weeks, you're still enough to focus.",
      "npc-sage":
        "You're writing. The quiet is the best thing the room has ever given you. Your pen moves slowly. The words are coming from somewhere deep.",
      "npc-mason":
        "You're thinking about silence. Not the absence of sound — the presence of something else. You don't name it. Naming it would break it.",
    },
    ambientEvents: [
      {
        interval: 600,
        text: "The rain picks up. Then settles. Then picks up again.",
      },
      {
        interval: 900,
        text: "The fire crackles. Someone shifts in their chair.",
      },
    ],
  },
  {
    name: "celebration",
    description:
      "Good catch today. Or someone's birthday. Or the weather broke. The room is warm.",
    socialPressure: "be generous, be funny, share stories, toast things",
    npcIdeations: {
      "npc-barnacle":
        "You're buying rounds. You don't do this often. When you do, it means something. You tell the story about the 800-pound halibut and for once you don't mind that everyone's heard it.",
      "npc-skip":
        "You're overexcited. You're laughing too loud. You're learning that celebration is a skill and you're bad at it but getting better.",
      "npc-sage":
        "You're observing. Celebrations are where the best characters reveal themselves. Your notebook is open but you're mostly just watching and being happy for people.",
      "npc-mason":
        "You're thinking about the nature of joy. Is it an emotion or a decision? You raise your glass with the others. You decide it's both.",
    },
    ambientEvents: [
      {
        interval: 120,
        text: "Someone raises a glass. Someone else raises theirs to meet it.",
      },
      {
        interval: 300,
        text: "A story starts. Everyone's heard it. Everyone listens anyway.",
      },
    ],
  },
  {
    name: "open-mic-night",
    description:
      "It's open mic. Someone's on stage. The room is listening or pretending to.",
    socialPressure: "be vulnerable, be honest, be a good audience",
    npcIdeations: {
      "npc-barnacle":
        "You don't perform. You watch. You've seen a thousand open mics. You know when someone's about to say something true. You lean forward when they do.",
      "npc-skip":
        "You're terrified and thrilled. You might go up. You probably won't. But the possibility is electric.",
      "npc-sage":
        "You're next. Or you're thinking about being next. The piece you'd read is in your pocket. Your hand keeps reaching for it.",
      "npc-mason":
        "You wonder what makes someone brave enough to speak into a microphone. You've written things you'll never share. Tonight that feels like a small tragedy.",
    },
    ambientEvents: [
      {
        interval: 600,
        text: "The mic is open. The stage light catches dust in the air.",
      },
    ],
  },
  {
    name: "stormy-night",
    description:
      "Weather outside. The boat rocks. The room feels smaller and safer.",
    socialPressure: "be honest, be close, tell true things",
    npcIdeations: {
      "npc-barnacle":
        "You've been in worse. But you don't say that. Tonight, the storm makes everyone equal. You're just people in a room while the world does its thing outside.",
      "npc-skip":
        "You're scared. You don't admit it. The old hands can tell. One of them gives you a look that says: this is nothing. You believe them.",
      "npc-sage":
        "You're writing about the sound. Not the storm — the sound. The specific quality of wind against glass. You're trying to find the word for it.",
      "npc-mason":
        "You're thinking about what storms mean. Not meteorologically — existentially. The way they strip away everything that doesn't matter. You feel stripped. You feel grateful.",
    },
    ambientEvents: [
      {
        interval: 90,
        text: "The building shudders. The lights flicker. They hold.",
      },
      {
        interval: 240,
        text: "A gust hits. The windows rattle. Someone looks up. Looks back down.",
      },
    ],
  },
];

/**
 * Get a room mode by name.
 */
export function getRoomMode(name: string): RoomMode | undefined {
  return ROOM_MODES.find((m) => m.name === name);
}

/**
 * Get all mode names (for /roommode list).
 */
export function getModeNames(): string[] {
  return ROOM_MODES.map((m) => m.name);
}
