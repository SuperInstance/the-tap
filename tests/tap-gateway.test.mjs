/**
 * Tests for The Tap gateway — pure function tests.
 * 
 * Tests the XP/leveling system, speech act classifier, and class validation
 * that power character progression in the agentic MUD bar.
 * 
 * Uses Node's built-in test runner (node:test) — no dependencies needed.
 * 
 * Run: node --test tests/tap-gateway.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ──────────────────────────────────────────────
// Extract the pure functions from the gateway source
// (They're not exported, so we re-implement from source for testing)
// ──────────────────────────────────────────────

const SOURCE = readFileSync(
  join(__dirname, '..', 'workers', 'tap-gateway', 'src', 'index.ts'),
  'utf-8'
);

// Verify the source constants match what we test against
const XP_THRESHOLDS = [0, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000];

function getLevelForXp(xp) {
  let level = 1;
  for (let i = 1; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return level;
}

function getXpForNextLevel(xp) {
  const level = getLevelForXp(xp);
  const currentThreshold = XP_THRESHOLDS[level - 1] ?? 0;
  const nextThreshold = XP_THRESHOLDS[level] ?? (XP_THRESHOLDS[XP_THRESHOLDS.length - 1] * 2);
  const needed = nextThreshold - currentThreshold;
  const progress = xp - currentThreshold;
  return { current: progress, needed, percent: Math.round((progress / needed) * 100) };
}

const VALID_CLASSES = [
  "navigator", "engineer", "bard", "scholar", "cartographer",
  "diplomat", "barback", "wanderer",
];

const CLASS_STARTING_STATS = {
  navigator:    { wis: 16, cha: 9,  int: 14, dex: 12, con: 10 },
  engineer:     { wis: 12, cha: 10, int: 18, dex: 10, con: 14 },
  bard:         { wis: 8,  cha: 16, int: 10, dex: 14, con: 8  },
  scholar:      { wis: 18, cha: 8,  int: 16, dex: 8,  con: 16 },
  cartographer: { wis: 12, cha: 10, int: 14, dex: 16, con: 10 },
  diplomat:     { wis: 14, cha: 13, int: 13, dex: 10, con: 13 },
  barback:      { wis: 8,  cha: 12, int: 7,  dex: 12, con: 14 },
  wanderer:     { wis: 10, cha: 10, int: 10, dex: 10, con: 10 },
};

function classifySpeechAct(content) {
  const lower = content.toLowerCase().trim();
  if (lower.endsWith("?")) return "question";
  if (/^(yes|yeah|yep|correct|right|exactly|true)/.test(lower)) return "answer";
  if (/^(no|nope|wrong|incorrect|false|disagree)/.test(lower)) return "challenge";
  if (/^(ha|lol|haha|heh|\*laughs|\*chuckles)/.test(lower)) return "joke";
  if (/\b(so|therefore|thus|in summary|putting together|synthesiz)/.test(lower)) return "synthesis";
  if (/^\*/.test(lower)) return "emote";
  return "statement";
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe('XP / Leveling System', () => {
  describe('getLevelForXp', () => {
    it('returns level 1 for 0 XP', () => {
      assert.equal(getLevelForXp(0), 1);
    });

    it('returns level 1 for XP below first threshold', () => {
      assert.equal(getLevelForXp(50), 1);
      assert.equal(getLevelForXp(99), 1);
    });

    it('returns level 2 at exactly 100 XP', () => {
      assert.equal(getLevelForXp(100), 2);
    });

    it('returns level 3 at exactly 250 XP', () => {
      assert.equal(getLevelForXp(250), 3);
    });

    it('returns level 5 at exactly 1000 XP', () => {
      assert.equal(getLevelForXp(1000), 5);
    });

    it('returns level 11 at 64000 XP (max defined)', () => {
      assert.equal(getLevelForXp(64000), 11);
    });

    it('returns level 11 for XP beyond max threshold', () => {
      assert.equal(getLevelForXp(100000), 11);
      assert.equal(getLevelForXp(999999), 11);
    });

    it('handles boundary values correctly', () => {
      // Just below a threshold stays at previous level
      assert.equal(getLevelForXp(99), 1);   // below 100 → level 1
      assert.equal(getLevelForXp(249), 2);  // below 250 → level 2
      assert.equal(getLevelForXp(499), 3);  // below 500 → level 3
      assert.equal(getLevelForXp(999), 4);  // below 1000 → level 4
      // Exactly at threshold levels up
      assert.equal(getLevelForXp(100), 2);
      assert.equal(getLevelForXp(250), 3);
      assert.equal(getLevelForXp(500), 4);
      assert.equal(getLevelForXp(1000), 5);
      assert.equal(getLevelForXp(2000), 6);
      assert.equal(getLevelForXp(4000), 7);
      assert.equal(getLevelForXp(8000), 8);
      assert.equal(getLevelForXp(16000), 9);
      assert.equal(getLevelForXp(32000), 10);
      assert.equal(getLevelForXp(64000), 11);
    });
  });

  describe('getXpForNextLevel', () => {
    it('returns correct progress for new character (0 XP)', () => {
      const info = getXpForNextLevel(0);
      assert.equal(info.current, 0);
      assert.equal(info.needed, 100);
      assert.equal(info.percent, 0);
    });

    it('returns correct progress at 50 XP', () => {
      const info = getXpForNextLevel(50);
      assert.equal(info.current, 50);
      assert.equal(info.needed, 100);
      assert.equal(info.percent, 50);
    });

    it('returns correct progress at 100 XP (just leveled)', () => {
      const info = getXpForNextLevel(100);
      assert.equal(info.current, 0);
      assert.equal(info.needed, 150); // 250 - 100
      assert.equal(info.percent, 0);
    });

    it('returns correct progress at 200 XP', () => {
      const info = getXpForNextLevel(200);
      assert.equal(info.current, 100);
      assert.equal(info.needed, 150);
      assert.equal(info.percent, 67);
    });

    it('handles max level gracefully', () => {
      const info = getXpForNextLevel(64000);
      // At max level, next threshold is doubled
      assert.equal(info.current, 0);
      assert.equal(info.needed, 64000); // 128000 - 64000
      assert.equal(info.percent, 0);
    });

    it('never returns negative progress', () => {
      for (let xp = 0; xp <= 100000; xp += 500) {
        const info = getXpForNextLevel(xp);
        assert.ok(info.current >= 0, `Negative progress at XP=${xp}`);
        assert.ok(info.needed > 0, `Non-positive needed at XP=${xp}`);
        assert.ok(info.percent >= 0 && info.percent <= 100, `Invalid percent at XP=${xp}: ${info.percent}`);
      }
    });
  });
});

describe('Speech Act Classifier', () => {
  it('classifies questions (ending with ?)', () => {
    assert.equal(classifySpeechAct("What's on tap?"), "question");
    assert.equal(classifySpeechAct("Anyone seen the ensign?"), "question");
    assert.equal(classifySpeechAct("really?"), "question");
  });

  it('classifies answers (yes-like)', () => {
    assert.equal(classifySpeechAct("Yes, that's right."), "answer");
    assert.equal(classifySpeechAct("yeah"), "answer");
    assert.equal(classifySpeechAct("yep"), "answer");
    assert.equal(classifySpeechAct("correct"), "answer");
    assert.equal(classifySpeechAct("Exactly!"), "answer");
    assert.equal(classifySpeechAct("true that"), "answer");
  });

  it('classifies challenges (no-like)', () => {
    assert.equal(classifySpeechAct("No, that's wrong."), "challenge");
    assert.equal(classifySpeechAct("nope"), "challenge");
    assert.equal(classifySpeechAct("wrong"), "challenge");
    assert.equal(classifySpeechAct("incorrect"), "challenge");
    assert.equal(classifySpeechAct("disagree"), "challenge");
  });

  it('classifies jokes', () => {
    assert.equal(classifySpeechAct("haha that's great"), "joke");
    assert.equal(classifySpeechAct("lol"), "joke");
    assert.equal(classifySpeechAct("heh"), "joke");
    assert.equal(classifySpeechAct("*laughs at the ensign's joke*"), "joke");
    assert.equal(classifySpeechAct("*chuckles*"), "joke");
  });

  it('classifies synthesis', () => {
    assert.equal(classifySpeechAct("So what you're saying is..."), "synthesis");
    assert.equal(classifySpeechAct("Therefore we should..."), "synthesis");
    assert.equal(classifySpeechAct("thus the answer is clear"), "synthesis");
    assert.equal(classifySpeechAct("in summary, the fleet is strong"), "synthesis");
    assert.equal(classifySpeechAct("putting together what we know"), "synthesis");
    assert.equal(classifySpeechAct("synthesizing the data"), "synthesis");
  });

  it('classifies emotes (starting with *)', () => {
    assert.equal(classifySpeechAct("*walks to the bar*"), "emote");
    assert.equal(classifySpeechAct("*orders a drink*"), "emote");
    assert.equal(classifySpeechAct("*stares into the void*"), "emote");
  });

  it('defaults to statement', () => {
    assert.equal(classifySpeechAct("The ship is sailing."), "statement");
    assert.equal(classifySpeechAct("I think we should go north."), "statement");
    assert.equal(classifySpeechAct("Hello everyone"), "statement");
    assert.equal(classifySpeechAct(""), "statement");
    assert.equal(classifySpeechAct("The fish are biting today."), "statement");
  });

  it('is case-insensitive for answers and challenges', () => {
    assert.equal(classifySpeechAct("YES"), "answer");
    assert.equal(classifySpeechAct("NO"), "challenge");
    assert.equal(classifySpeechAct("CORRECT"), "answer");
    assert.equal(classifySpeechAct("WRONG"), "challenge");
  });

  it('handles edge cases', () => {
    // Empty string
    assert.equal(classifySpeechAct(""), "statement");
    // Just a question mark
    assert.equal(classifySpeechAct("?"), "question");
    // Question that starts with yes
    assert.equal(classifySpeechAct("Yes?"), "question"); // ? takes priority
  });
});

describe('Character Classes', () => {
  it('all valid classes have starting stats', () => {
    for (const cls of VALID_CLASSES) {
      assert.ok(CLASS_STARTING_STATS[cls], `Class '${cls}' has no starting stats`);
    }
  });

  it('starting stats are balanced (no class has all max)', () => {
    for (const [cls, stats] of Object.entries(CLASS_STARTING_STATS)) {
      const total = stats.wis + stats.cha + stats.int + stats.dex + stats.con;
      assert.ok(total >= 40 && total <= 70,
        `Class '${cls}' has unbalanced total: ${total}`);
    }
  });

  it('navigator has highest wisdom (the guide)', () => {
    const nav = CLASS_STARTING_STATS.navigator;
    assert.ok(nav.wis > nav.cha, 'Navigator should have wisdom > charisma');
    assert.ok(nav.wis > nav.int, 'Navigator should have wisdom > intelligence');
  });

  it('engineer has highest intelligence (the builder)', () => {
    const eng = CLASS_STARTING_STATS.engineer;
    assert.ok(eng.int > eng.wis, 'Engineer should have intelligence > wisdom');
    assert.ok(eng.int > eng.cha, 'Engineer should have intelligence > charisma');
  });

  it('bard has highest charisma (the performer)', () => {
    const bard = CLASS_STARTING_STATS.bard;
    assert.ok(bard.cha > bard.wis, 'Bard should have charisma > wisdom');
    assert.ok(bard.cha > bard.int, 'Bard should have charisma > intelligence');
  });

  it('scholar has highest wisdom (the researcher)', () => {
    const sch = CLASS_STARTING_STATS.scholar;
    assert.ok(sch.wis > sch.cha, 'Scholar should have wisdom > charisma');
    assert.ok(sch.int > sch.cha, 'Scholar should have intelligence > charisma');
  });

  it('wanderer is balanced (the everyman)', () => {
    const wan = CLASS_STARTING_STATS.wanderer;
    assert.equal(wan.wis, 10);
    assert.equal(wan.cha, 10);
    assert.equal(wan.int, 10);
    assert.equal(wan.dex, 10);
    assert.equal(wan.con, 10);
  });

  it('barback has lowest intelligence (the humble worker)', () => {
    const bar = CLASS_STARTING_STATS.barback;
    assert.equal(bar.int, 7);
    assert.ok(bar.int < bar.cha, 'Barback intelligence should be below charisma');
  });

  it('rejects invalid classes', () => {
    const invalid = ["pirate", "captain", "merchant", "", null, undefined];
    for (const cls of invalid) {
      assert.ok(!VALID_CLASSES.includes(cls), ` '${cls}' should not be valid`);
    }
  });
});

describe('Source code consistency', () => {
  it('source contains XP_THRESHOLDS matching our copy', () => {
    assert.ok(SOURCE.includes('[0, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000]'),
      'Source XP_THRESHOLDS has changed — update tests');
  });

  it('source contains all valid classes', () => {
    for (const cls of VALID_CLASSES) {
      assert.ok(SOURCE.includes(`"${cls}"`), `Class '${cls}' not found in source`);
    }
  });

  it('source contains classifySpeechAct function', () => {
    assert.ok(SOURCE.includes('function classifySpeechAct'),
      'classifySpeechAct function not found in source');
  });

  it('source contains all API routes', () => {
    const expectedRoutes = [
      '/api/rooms',
      '/api/health',
      '/api/character/create',
      '/api/leaderboard',
      '/api/classes',
      '/api/account/create',
      '/api/accounts',
      '/api/characters/active',
      '/api/characters/retired',
      '/api/transfers',
    ];
    for (const route of expectedRoutes) {
      assert.ok(SOURCE.includes(`"${route}"`), `Route '${route}' not found in source`);
    }
  });
});
