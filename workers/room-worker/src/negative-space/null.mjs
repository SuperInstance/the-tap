/**
 * null.mjs — the honest negative (design law 5).
 *
 * NEGATIVE-SPACE-GAN.md: "if a run produces nothing that clears the floor,
 * the shipped artifact is the negative space map itself — which cells were
 * tried, why each failed the floor. The honest negative is a valid output
 * of the mode, not a failure of it." (Companion: essays/the-honest-negative.md.)
 *
 * buildHonestNullReport(archive, attempts) renders that map: occupied
 * geography, empty-but-tried cells with per-candidate named failure
 * reasons, and the still-unexplored region. Never invents candidates that
 * did not exist; never upgrades a failure into a near-miss.
 */

export function buildHonestNullReport(archive, attempts) {
  const occupied = archive.cells().map((c) => ({
    cell: c.cell,
    occupants: c.occupants.map((o) => o.id),
    status: c.status,
  }));

  const triedCells = new Map();
  for (const a of attempts ?? []) {
    const k = `${a.cell}`;
    if (!triedCells.has(k)) {
      triedCells.set(k, { cell: a.cell, attempts: [] });
    }
    triedCells.get(k).attempts.push({
      id: a.id,
      verdict: a.verdict,
      reasons: a.reasons,
      novelty: a.novelty,
      viability: a.viability,
    });
  }

  const emptyTried = [...triedCells.values()].filter(
    (t) => !occupied.some((o) => o.cell[0] === t.cell[0] && o.cell[1] === t.cell[1])
  );

  const total = archive.gridSize * archive.gridSize;
  return {
    kind: 'honest-null-report',
    claim: 'no candidate this generation cleared the viability floor and opened negative space',
    occupied,
    emptyButTried: emptyTried,
    stillEmpty: archive.emptyCellCount(),
    gridFill: `${occupied.length}/${total} cells occupied`,
    // The mode says so instead of hallucinating novelty (design law 5).
    honest: true,
  };
}

export function isHonestNull(result) {
  return result?.honestNull === true && Array.isArray(result?.report);
}
