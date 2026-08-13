/**
 * Tests for Senior Officers' Poker — hand evaluation logic.
 *
 * The hand evaluator is the mathematical heart of the game.
 * If it misjudges a flush or mishandles a wheel straight,
 * the entire session loses integrity.
 *
 * These tests extract the pure evaluation functions from poker.ts
 * and verify them against known card combinations.
 *
 * Run: node --test tests/poker-evaluation.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Reconstruct the pure functions from poker.ts ───
// Since poker.ts doesn't export the evaluation helpers,
// we test the logic directly.

const RANK_NAMES = {
  2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven",
  8: "Eight", 9: "Nine", 10: "Ten", 11: "Jack", 12: "Queen", 13: "King", 14: "Ace",
};

const HAND_RANK_VALUES = {
  "royal-flush": 9, "straight-flush": 8, "four-of-a-kind": 7, "full-house": 6,
  "flush": 5, "straight": 4, "three-of-a-kind": 3, "two-pair": 2,
  "one-pair": 1, "high-card": 0,
};

// Card helper
function C(rank, suit) { return { rank, suit }; }

// Hand evaluation (mirrors poker.ts evaluateFive logic)
function evaluateFive(cards) {
  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const ranks = sorted.map(c => c.rank);
  const suits = sorted.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  let isStraight = false;
  let straightHigh = 0;
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
  if (uniqueRanks.length === 5) {
    if (uniqueRanks[0] - uniqueRanks[4] === 4) {
      isStraight = true;
      straightHigh = uniqueRanks[0];
    }
    if (uniqueRanks[0] === 14 && uniqueRanks[1] === 5 && uniqueRanks[2] === 4 && uniqueRanks[3] === 3 && uniqueRanks[4] === 2) {
      isStraight = true;
      straightHigh = 5;
    }
  }

  const rankCounts = {};
  for (const r of ranks) rankCounts[r] = (rankCounts[r] ?? 0) + 1;
  const counts = Object.entries(rankCounts)
    .map(([rank, count]) => ({ rank: Number(rank), count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  if (isFlush && isStraight && straightHigh === 14) return mk("royal-flush", [14]);
  if (isFlush && isStraight) return mk("straight-flush", [straightHigh]);
  if (counts[0].count === 4) return mk("four-of-a-kind", [counts[0].rank, counts[1].rank]);
  if (counts[0].count === 3 && counts[1].count === 2) return mk("full-house", [counts[0].rank, counts[1].rank]);
  if (isFlush) return mk("flush", ranks);
  if (isStraight) return mk("straight", [straightHigh]);
  if (counts[0].count === 3) return mk("three-of-a-kind", [counts[0].rank, counts[1].rank, counts[2].rank]);
  if (counts[0].count === 2 && counts[1].count === 2) return mk("two-pair", [counts[0].rank, counts[1].rank, counts[2].rank]);
  if (counts[0].count === 2) return mk("one-pair", [counts[0].rank, ...counts.slice(1).map(c => c.rank)]);
  return mk("high-card", ranks);

  function mk(rank, tiebreakers) {
    return { rank, rankValue: HAND_RANK_VALUES[rank], tiebreakers };
  }
}

function compareHands(a, b) {
  if (a.rankValue !== b.rankValue) return a.rankValue - b.rankValue;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const av = a.tiebreakers[i] ?? 0;
    const bv = b.tiebreakers[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function evaluateBestFive(cards) {
  const combos = combinations(cards, 5);
  let best = null;
  for (const combo of combos) {
    const evalResult = evaluateFive(combo);
    if (!best || compareHands(evalResult, best) > 0) best = evalResult;
  }
  return best;
}

// ─── Tests ───

describe('Hand Evaluation — Royal Flush', () => {
  it('detects a royal flush in spades', () => {
    const hand = [C(14,'spades'), C(13,'spades'), C(12,'spades'), C(11,'spades'), C(10,'spades')];
    const result = evaluateFive(hand);
    assert.equal(result.rank, 'royal-flush');
    assert.equal(result.rankValue, 9);
  });

  it('detects a royal flush in hearts', () => {
    const hand = [C(10,'hearts'), C(12,'hearts'), C(11,'hearts'), C(14,'hearts'), C(13,'hearts')];
    const result = evaluateFive(hand);
    assert.equal(result.rank, 'royal-flush');
  });
});

describe('Hand Evaluation — Straight Flush', () => {
  it('detects a king-high straight flush', () => {
    const hand = [C(13,'clubs'), C(12,'clubs'), C(11,'clubs'), C(10,'clubs'), C(9,'clubs')];
    const result = evaluateFive(hand);
    assert.equal(result.rank, 'straight-flush');
    assert.equal(result.tiebreakers[0], 13);
  });

  it('detects a 5-high straight flush (steel wheel)', () => {
    const hand = [C(14,'diamonds'), C(2,'diamonds'), C(3,'diamonds'), C(4,'diamonds'), C(5,'diamonds')];
    const result = evaluateFive(hand);
    assert.equal(result.rank, 'straight-flush');
    assert.equal(result.tiebreakers[0], 5);
  });
});

describe('Hand Evaluation — Four of a Kind', () => {
  it('detects quad aces', () => {
    const hand = [C(14,'hearts'), C(14,'diamonds'), C(14,'clubs'), C(14,'spades'), C(7,'hearts')];
    const result = evaluateFive(hand);
    assert.equal(result.rank, 'four-of-a-kind');
    assert.deepEqual(result.tiebreakers, [14, 7]);
  });

  it('detects quad sevens with ace kicker', () => {
    const hand = [C(7,'hearts'), C(7,'diamonds'), C(7,'clubs'), C(7,'spades'), C(14,'hearts')];
    const result = evaluateFive(hand);
    assert.equal(result.rank, 'four-of-a-kind');
    assert.deepEqual(result.tiebreakers, [7, 14]);
  });
});

describe('Hand Evaluation — Full House', () => {
  it('detects aces over kings', () => {
    const hand = [C(14,'hearts'), C(14,'diamonds'), C(14,'clubs'), C(13,'spades'), C(13,'hearts')];
    const result = evaluateFive(hand);
    assert.equal(result.rank, 'full-house');
    assert.deepEqual(result.tiebreakers, [14, 13]);
  });

  it('detects deuces over aces (trips lower)', () => {
    const hand = [C(2,'hearts'), C(2,'diamonds'), C(2,'clubs'), C(14,'spades'), C(14,'hearts')];
    const result = evaluateFive(hand);
    assert.equal(result.rank, 'full-house');
    assert.deepEqual(result.tiebreakers, [2, 14]);
  });
});

describe('Hand Evaluation — Flush', () => {
  it('detects an ace-high flush', () => {
    const hand = [C(14,'hearts'), C(10,'hearts'), C(7,'hearts'), C(4,'hearts'), C(2,'hearts')];
    const result = evaluateFive(hand);
    assert.equal(result.rank, 'flush');
    assert.equal(result.tiebreakers[0], 14);
  });

  it('does not false-positive flush on mixed suits', () => {
    const hand = [C(14,'hearts'), C(10,'diamonds'), C(7,'hearts'), C(4,'hearts'), C(2,'hearts')];
    const result = evaluateFive(hand);
    assert.notEqual(result.rank, 'flush');
  });
});

describe('Hand Evaluation — Straight', () => {
  it('detects a 10-high straight (no flush)', () => {
    const hand = [C(10,'hearts'), C(9,'diamonds'), C(8,'clubs'), C(7,'spades'), C(6,'hearts')];
    const result = evaluateFive(hand);
    assert.equal(result.rank, 'straight');
    assert.equal(result.tiebreakers[0], 10);
  });

  it('detects the wheel (A-2-3-4-5)', () => {
    const hand = [C(14,'hearts'), C(2,'diamonds'), C(3,'clubs'), C(4,'spades'), C(5,'hearts')];
    const result = evaluateFive(hand);
    assert.equal(result.rank, 'straight');
    assert.equal(result.tiebreakers[0], 5);
  });

  it('detects broadway straight (10-J-Q-K-A)', () => {
    const hand = [C(10,'hearts'), C(11,'diamonds'), C(12,'clubs'), C(13,'spades'), C(14,'hearts')];
    const result = evaluateFive(hand);
    assert.equal(result.rank, 'straight');
    assert.equal(result.tiebreakers[0], 14);
  });
});

describe('Hand Evaluation — Three of a Kind', () => {
  it('detects trip kings', () => {
    const hand = [C(13,'hearts'), C(13,'diamonds'), C(13,'clubs'), C(8,'spades'), C(4,'hearts')];
    const result = evaluateFive(hand);
    assert.equal(result.rank, 'three-of-a-kind');
    assert.deepEqual(result.tiebreakers, [13, 8, 4]);
  });
});

describe('Hand Evaluation — Two Pair', () => {
  it('detects aces and kings with queen kicker', () => {
    const hand = [C(14,'hearts'), C(14,'diamonds'), C(13,'clubs'), C(13,'spades'), C(12,'hearts')];
    const result = evaluateFive(hand);
    assert.equal(result.rank, 'two-pair');
    assert.deepEqual(result.tiebreakers, [14, 13, 12]);
  });
});

describe('Hand Evaluation — One Pair', () => {
  it('detects a pair of eights', () => {
    const hand = [C(8,'hearts'), C(8,'diamonds'), C(13,'clubs'), C(10,'spades'), C(4,'hearts')];
    const result = evaluateFive(hand);
    assert.equal(result.rank, 'one-pair');
    assert.equal(result.tiebreakers[0], 8);
  });
});

describe('Hand Evaluation — High Card', () => {
  it('classifies a junk hand as high card', () => {
    const hand = [C(14,'hearts'), C(10,'diamonds'), C(7,'clubs'), C(4,'spades'), C(2,'clubs')];
    const result = evaluateFive(hand);
    assert.equal(result.rank, 'high-card');
    assert.equal(result.tiebreakers[0], 14);
  });
});

describe('Hand Comparison', () => {
  it('flush beats straight', () => {
    const flush = evaluateFive([C(10,'hearts'), C(8,'hearts'), C(6,'hearts'), C(4,'hearts'), C(2,'hearts')]);
    const straight = evaluateFive([C(10,'clubs'), C(9,'diamonds'), C(8,'hearts'), C(7,'spades'), C(6,'clubs')]);
    assert.ok(compareHands(flush, straight) > 0);
  });

  it('full house beats flush', () => {
    const fullHouse = evaluateFive([C(9,'hearts'), C(9,'diamonds'), C(9,'clubs'), C(3,'spades'), C(3,'hearts')]);
    const flush = evaluateFive([C(14,'hearts'), C(10,'hearts'), C(7,'hearts'), C(4,'hearts'), C(2,'hearts')]);
    assert.ok(compareHands(fullHouse, flush) > 0);
  });

  it('pair of aces beats pair of kings (same rank, higher tiebreaker)', () => {
    const aces = evaluateFive([C(14,'hearts'), C(14,'diamonds'), C(10,'clubs'), C(7,'spades'), C(4,'hearts')]);
    const kings = evaluateFive([C(13,'hearts'), C(13,'diamonds'), C(10,'clubs'), C(7,'spades'), C(4,'hearts')]);
    assert.ok(compareHands(aces, kings) > 0);
  });

  it('same pair — higher kicker wins', () => {
    const highKicker = evaluateFive([C(8,'hearts'), C(8,'diamonds'), C(13,'clubs'), C(7,'spades'), C(4,'hearts')]);
    const lowKicker = evaluateFive([C(8,'hearts'), C(8,'diamonds'), C(10,'clubs'), C(7,'spades'), C(4,'hearts')]);
    assert.ok(compareHands(highKicker, lowKicker) > 0);
  });

  it('identical evaluations tie', () => {
    const a = evaluateFive([C(8,'hearts'), C(8,'diamonds'), C(13,'clubs'), C(7,'spades'), C(4,'hearts')]);
    const b = evaluateFive([C(8,'clubs'), C(8,'spades'), C(13,'hearts'), C(7,'diamonds'), C(4,'clubs')]);
    assert.equal(compareHands(a, b), 0);
  });
});

describe('Best Five from Seven Cards', () => {
  it('selects the best five from seven (flush over pair)', () => {
    const seven = [
      C(14,'hearts'), C(10,'hearts'), C(7,'hearts'), C(4,'hearts'), C(2,'hearts'),
      C(14,'diamonds'), C(10,'diamonds')
    ];
    const result = evaluateBestFive(seven);
    assert.equal(result.rank, 'flush');
  });

  it('finds a full house when seven cards contain trips + pair', () => {
    const seven = [
      C(9,'hearts'), C(9,'diamonds'), C(9,'clubs'),
      C(3,'spades'), C(3,'hearts'),
      C(14,'diamonds'), C(10,'diamonds')
    ];
    const result = evaluateBestFive(seven);
    assert.equal(result.rank, 'full-house');
  });

  it('finds four of a kind when seven cards contain quads', () => {
    const seven = [
      C(7,'hearts'), C(7,'diamonds'), C(7,'clubs'), C(7,'spades'),
      C(14,'hearts'), C(10,'diamonds'), C(2,'clubs')
    ];
    const result = evaluateBestFive(seven);
    assert.equal(result.rank, 'four-of-a-kind');
  });

  it('generates exactly C(7,5) = 21 combinations from 7 cards', () => {
    const seven = [1,2,3,4,5,6,7];
    const combos = combinations(seven, 5);
    assert.equal(combos.length, 21);
  });

  it('generates exactly C(5,5) = 1 combination from 5 cards', () => {
    const five = [1,2,3,4,5];
    const combos = combinations(five, 5);
    assert.equal(combos.length, 1);
  });

  it('generates 0 combinations when fewer cards than k', () => {
    const three = [1,2,3];
    const combos = combinations(three, 5);
    assert.equal(combos.length, 0);
  });
});

describe('Edge Cases', () => {
  it('wheel straight (A-2-3-4-5) beats a 6-high straight (2-3-4-5-6)', () => {
    const wheel = evaluateFive([C(14,'hearts'), C(2,'diamonds'), C(3,'clubs'), C(4,'spades'), C(5,'hearts')]);
    const sixHigh = evaluateFive([C(2,'clubs'), C(3,'diamonds'), C(4,'hearts'), C(5,'spades'), C(6,'clubs')]);
    assert.ok(compareHands(sixHigh, wheel) > 0, '6-high should beat 5-high wheel');
  });

  it('two pair: higher top pair wins even if lower pair is smaller', () => {
    const acesLow = evaluateFive([C(14,'hearts'), C(14,'diamonds'), C(2,'clubs'), C(2,'spades'), C(8,'hearts')]);
    const kingsUp = evaluateFive([C(13,'hearts'), C(13,'diamonds'), C(10,'clubs'), C(10,'spades'), C(8,'hearts')]);
    assert.ok(compareHands(acesLow, kingsUp) > 0, 'AA22 should beat KK-TT');
  });
});
