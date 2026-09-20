/**
 * scoring.mjs — the negative-space GAN generation step.
 *
 * score = novelty × viability  (design law 2, multiplicative, never additive)
 *   novelty   — from the ARCHIVE: opens-new-cell is the win; otherwise
 *               cosine distance to the nearest occupied cell's centroid
 *               (termvector.mjs substrate, RED-QUEEN-DESIGN.md §4.2 lineage)
 *   viability — from the FLOOR: ethosGate ∈ {0,1} (floor.mjs)
 *   critic    — from the ROTATION (critics.mjs): difference-with-teeth in
 *               rubric space; the critic's verdict rides the report but
 *               never substitutes for the floor or the archive geometry.
 *
 * Rejection taxonomy (NEGATIVE-SPACE-GAN.md acceptance #1): every rejected
 * piece carries a NAMED reason — 'floor-fail' (with the specific ethos
 * violation) or 'niche-duplicate'/'settled' (from the archive). Nothing is
 * rejected silently.
 *
 * DESIGN LAW 5 (honest null): a generation that produces nothing which
 * clears the floor and opens space returns an honest-null report
 * (null.mjs) instead of hallucinated novelty.
 *
 * Never throws.
 */

import { ethosGate } from './floor.mjs';
import { termVector, cosineDistance } from './termvector.mjs';
import { descriptorAxes, cellForAxes } from './archive.mjs';

/**
 * Score one candidate against the archive + floor + critic.
 * candidate = { id, text, claims, vocabularyRefs }
 */
export function scoreCandidate({ candidate, archive, registry, recentPieces = [] }) {
  const gate = ethosGate(candidate);
  const vector = termVector(candidate.text ?? '');
  const axes = descriptorAxes(vector);
  const cell = cellForAxes(axes, archive.gridSize);
  const cellEntry = archive.getCell(cell);

  // Archive geometry: distance to nearest occupied cell (empty target = win).
  const opensNewCell = !cellEntry;
  let nearestOccupied = null;
  let centroidDistance = null;
  for (const occ of archive.cells()) {
    const dCell = Math.max(
      Math.abs(occ.cell[0] - cell[0]),
      Math.abs(occ.cell[1] - cell[1])
    );
    if (nearestOccupied === null || dCell < nearestOccupied) nearestOccupied = dCell;
    const acc = new Array(64).fill(0);
    for (const o of occ.occupants) for (let i = 0; i < 64; i++) acc[i] += o.vector[i];
    const centroid = acc.map((v) => v / (occ.occupants.length || 1));
    const d = cosineDistance(vector, centroid);
    if (centroidDistance === null || d < centroidDistance) centroidDistance = d;
  }

  // Novelty: filling an empty cell is the win condition (design law 3);
  // otherwise report distance-to-nearest-occupied-cell, in [0,1].
  const novelty = opensNewCell
    ? 1
    : Math.round((centroidDistance ?? 0) * 1000) / 1000;

  const viability = gate.viable;
  const score = Math.round(novelty * viability * 1000) / 1000;

  const critic = registry ? registry.verdict(candidate, recentPieces) : null;

  let verdict = 'candidate';
  const reasons = [];
  if (viability === 0) {
    verdict = 'floor-fail';
    reasons.push(...gate.violations.map((v) => `floor-fail:${v.kind}`));
  } else if (cellEntry && cellEntry.status === 'settled') {
    verdict = 'settled';
    reasons.push('niche-flooding-limit:cell-settled');
  } else if (!opensNewCell && centroidDistance !== null && centroidDistance < archive.noveltyThreshold) {
    verdict = 'niche-duplicate';
    reasons.push(`niche-duplicate:cosine ${centroidDistance.toFixed(3)} < θ=${archive.noveltyThreshold}`);
  } else if (opensNewCell) {
    verdict = 'opens-negative-space';
  } else {
    verdict = 'viable-distinct';
  }

  return {
    id: candidate.id,
    cell,
    opensNewCell,
    nearestOccupiedDistance: nearestOccupied,
    centroidDistance,
    novelty,
    viability,
    score,
    verdict,
    reasons,
    critic,
    ethosViolations: gate.violations,
  };
}

/**
 * runGeneration — score K candidates, insert the best qualifying one.
 * generator: { next() } — produces candidates.
 * Returns { accepted, rejected, honestNull, report } — honestNull per
 * design law 5: if nothing qualifies, the report IS the artifact.
 */
export function runGeneration({ generator, archive, registry, n = 4, recentPieces = [] }) {
  const candidates = [];
  for (let i = 0; i < n; i++) candidates.push(generator.next());

  const scored = candidates.map((c) => ({
    candidate: c,
    ...scoreCandidate({ candidate: c, archive, registry, recentPieces }),
  }));

  // Rank: floor first (viability multiplies to zero), then novelty.
  const qualifying = scored
    .filter((s) => s.viability === 1 && (s.verdict === 'opens-negative-space' || s.verdict === 'viable-distinct'))
    .sort((a, b) => b.score - a.score);

  let accepted = null;
  if (qualifying.length > 0) {
    const pick = qualifying[0];
    const ins = archive.insert(pick.candidate);
    if (ins.inserted) {
      accepted = { ...pick, insertResult: ins };
    } else {
      pick.verdict = ins.refused;
      pick.reasons.push(`${ins.refused}:${ins.reason}`);
    }
  }

  const rejected = scored
    .filter((s) => !accepted || s.id !== accepted.id)
    .map((s) => ({
      id: s.id,
      verdict: s.verdict,
      reasons: s.reasons,
      novelty: s.novelty,
      viability: s.viability,
    }));

  const honestNull = accepted === null;

  return {
    accepted,
    rejected,
    honestNull,
    report: scored.map((s) => ({
      id: s.id,
      cell: s.cell,
      novelty: s.novelty,
      viability: s.viability,
      score: s.score,
      verdict: s.verdict,
      reasons: s.reasons,
      criticId: s.critic?.criticId ?? null,
      criticScore: s.critic?.score ?? null,
    })),
  };
}
