/**
 * archive.mjs — the negative-space MAP-Elites archive.
 *
 * Design law 3 (docs/NEGATIVE-SPACE-GAN.md): negative space = archive cells
 * never occupied. Candidate scoring includes distance-to-nearest-occupied-
 * cell; filling an empty cell is the win condition. The Red Queen archive
 * (the-tap PR #6, docs/RED-QUEEN-DESIGN.md §1) selects elites by fitness;
 * THIS archive selects for UNOCCUPIED geography — the novelty gate turned
 * from defense into objective.
 *
 * Grid descriptors: two structural axes read off the candidate's term
 * vector (termvector.mjs, candor lineage):
 *   X — center of mass of term mass across slots (where the piece "lives"
 *       in vocabulary space), normalized to [0,1]
 *   Y — Shannon entropy of the slot distribution (how spread the diction
 *       is), normalized to [0,1]
 * Both are read off the substrate; neither is a quality judgment.
 *
 * Design law 6 (niche-flooding limit, from RED-QUEEN-DESIGN.md §4.2/§1.2):
 * a cell accepts at most `settledCap` occupants before it is "settled" —
 * one region cannot eat the archive.
 *
 * Monotonicity (NEGATIVE-SPACE-GAN.md acceptance #4): cells, once filled,
 * are never silently overwritten. Insertion into an occupied cell adds a
 * co-occupant up to the cap or refuses; it never mutates an existing
 * occupant. Displacement is a recorded event (this mode almost never
 * displaces — chasing an occupied cell is off-objective — but the log
 * exists and any overwrite path must go through it).
 *
 * Never throws. dump()/load() round-trip is pinned by test.
 */

import { termVector } from './termvector.mjs';

export const DEFAULT_GRID_SIZE = 8;
export const DEFAULT_SETTLED_CAP = 3;
/** Below this cosine distance to an incumbent centroid ⇒ same niche. */
export const DEFAULT_NOVELTY_THRESHOLD = 0.2;

export function descriptorAxes(vector) {
  let mass = 0;
  let com = 0;
  for (let i = 0; i < vector.length; i++) {
    mass += vector[i];
    com += i * vector[i];
  }
  const x = mass > 0 ? com / mass / (vector.length - 1) : 0;
  // Shannon entropy over the normalized slot distribution, H / log(n) ∈ [0,1]
  let h = 0;
  for (const v of vector) {
    if (v > 0) h -= v * Math.log(v);
  }
  const y = Math.min(1, Math.max(0, h / Math.log(vector.length)));
  return [x, y];
}

export function cellForAxes([x, y], gridSize) {
  const gx = Math.min(gridSize - 1, Math.max(0, Math.floor(x * gridSize)));
  const gy = Math.min(gridSize - 1, Math.max(0, Math.floor(y * gridSize)));
  return [gx, gy];
}

export function createNegativeSpaceArchive({
  gridSize = DEFAULT_GRID_SIZE,
  settledCap = DEFAULT_SETTLED_CAP,
  noveltyThreshold = DEFAULT_NOVELTY_THRESHOLD,
} = {}) {
  const cells = new Map(); // "x,y" → { occupants: [record], status }
  const displacementLog = [];

  const key = ([x, y]) => `${x},${y}`;

  function getCell(cell) {
    return cells.get(key(cell)) ?? null;
  }

  function occupiedCells() {
    return [...cells.entries()].map(([k, v]) => ({
      cell: k.split(',').map(Number),
      occupants: v.occupants.map((o) => ({ ...o })),
      status: v.status,
    }));
  }

  /** Grid (Chebyshev) distance from a cell to the nearest occupied cell. */
  function nearestOccupiedDistance(cell) {
    let best = Infinity;
    for (const [k] of cells) {
      const [ox, oy] = k.split(',').map(Number);
      const d = Math.max(Math.abs(ox - cell[0]), Math.abs(oy - cell[1]));
      if (d < best) best = d;
    }
    return best === Infinity ? null : best;
  }

  /**
   * Insert a candidate. candidate = { id, text, ... }.
   * Returns one of:
   *   { inserted: true,  cell, opensNewCell: bool, occupantCount }
   *   { inserted: false, refused: 'settled' | 'niche-duplicate', cell, reason }
   * Never mutates existing occupants (monotonicity).
   */
  function insert(candidate) {
    const vector = termVector(candidate.text ?? '');
    const axes = descriptorAxes(vector);
    const cell = cellForAxes(axes, gridSize);
    const entry = getCell(cell);

    if (entry && entry.occupants.length >= settledCap) {
      return {
        inserted: false,
        refused: 'settled',
        cell,
        reason: `cell ${cell} is settled (${entry.occupants.length}/${settledCap} occupants)`,
      };
    }

    if (entry) {
      // Occupied: same-niche check against the incumbent centroid.
      const centroid = centroidVector(entry.occupants);
      const d = cosineDistanceLocal(vector, centroid);
      if (d < noveltyThreshold) {
        return {
          inserted: false,
          refused: 'niche-duplicate',
          cell,
          reason: `cosine distance ${d.toFixed(3)} < θ=${noveltyThreshold} to incumbent centroid`,
        };
      }
    }

    const opensNewCell = !entry;
    const record = {
      id: candidate.id,
      cell,
      axes,
      vector,
      acquiredAt: candidate.acquiredAt ?? null,
    };
    if (entry) {
      entry.occupants.push(record);
      if (entry.occupants.length >= settledCap) entry.status = 'settled';
    } else {
      cells.set(key(cell), { occupants: [record], status: 'open' });
    }
    return { inserted: true, cell, opensNewCell, occupantCount: getCell(cell).occupants.length };
  }

  function centroidVector(occupants) {
    const acc = new Array(64).fill(0);
    for (const o of occupants) {
      for (let i = 0; i < 64; i++) acc[i] += o.vector[i];
    }
    const n = occupants.length || 1;
    return acc.map((v) => v / n);
  }

  function cosineDistanceLocal(a, b) {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return Math.min(1, Math.max(0, 1 - dot));
  }

  function emptyCellCount() {
    return gridSize * gridSize - cells.size;
  }

  function dump() {
    return JSON.parse(
      JSON.stringify({
        kind: 'negative-space-archive',
        version: 1,
        gridSize,
        settledCap,
        noveltyThreshold,
        cells: occupiedCells(),
        displacementLog,
      })
    );
  }

  function load(json) {
    cells.clear();
    displacementLog.length = 0;
    for (const c of json.cells ?? []) {
      cells.set(key(c.cell), {
        occupants: c.occupants.map((o) => ({ ...o, vector: o.vector ?? [] })),
        status: c.status,
      });
    }
    for (const e of json.displacementLog ?? []) displacementLog.push(e);
  }

  return {
    gridSize,
    settledCap,
    noveltyThreshold,
    insert,
    getCell,
    cells: occupiedCells,
    nearestOccupiedDistance,
    emptyCellCount,
    displacementLog,
    dump,
    load,
  };
}
