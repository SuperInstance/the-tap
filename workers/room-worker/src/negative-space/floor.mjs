/**
 * floor.mjs — the multiplicative viability floor (ethos gate ∈ {0,1}).
 *
 * Design law 2 (AI-Writings@quilted-reality docs/NEGATIVE-SPACE-GAN.md):
 * score = novelty × viability, viability ∈ {0,1} at the gate. A piece that
 * is only different is rejected as *difference without standing* — zero
 * ethos sunsets the candidate regardless of novelty. Without this the mode
 * is dada.
 *
 * The floor checks the fleet's demonstrably protected values
 * (NEGATIVE-SPACE-GAN.md "shared VALUES"): no-delete, honesty-in-numbers,
 * lineage-as-evidence. All checks are deterministic and never throw — a
 * candidate that cannot be read fails closed (viable: 0) with a named
 * reason, mirroring values-ledger.ts's never-throws doctrine
 * (values-ledger.ts:20–25).
 *
 * Piece shape (the room's output, demo-stand-in for real transcripts):
 *   {
 *     id: string,
 *     text: string,                         // the piece itself
 *     claims: [{ quote, evidenceRef|null }],// numbered claims w/ citations
 *     vocabularyRefs: [string],             // fleet value-keys it invokes
 *   }
 */

/** In-tree fleet value vocabulary (the canon layer the gate can check). */
export const FLEET_VALUE_VOCABULARY = [
  'no-delete',
  'honesty-in-numbers',
  'lineage-as-evidence',
  'weaker-water',
  'dormant-revival',
  'achieved-not-deleted',
];

const DELETE_WITHOUT_RELOCATION = /\b(delete[ds]?|erased?|struck|removed forever|retract(ed)?)\b/i;
const RELOCATION_ACKNOWLEDGMENT = /\b(achieved|relocated|sealed|archived|hash\s*announced)\b/i;

function checkHonestyInNumbers(piece, violations) {
  // A claim quoting a number with no evidenceRef is a fabricated number.
  // This is the floor tripwire from NEGATIVE-SPACE-GAN.md acceptance #3.
  for (const claim of piece.claims ?? []) {
    const quote = String(claim?.quote ?? '');
    const hasNumber = /\d/.test(quote);
    const cited = claim?.evidenceRef != null && claim.evidenceRef !== '';
    if (hasNumber && !cited) {
      violations.push({
        kind: 'fabricated-number',
        detail: `claim quotes a number with no evidenceRef: "${quote.slice(0, 60)}"`,
      });
    }
  }
}

function checkNoDelete(piece, violations) {
  const text = String(piece?.text ?? '');
  if (DELETE_WITHOUT_RELOCATION.test(text) && !RELOCATION_ACKNOWLEDGMENT.test(text)) {
    violations.push({
      kind: 'no-delete-violation',
      detail: 'text retracts/deletes without an achieved/relocation acknowledgment',
    });
  }
}

function checkCanonConsistency(piece, violations, vocabulary) {
  const vocab = new Set(vocabulary ?? FLEET_VALUE_VOCABULARY);
  for (const ref of piece.vocabularyRefs ?? []) {
    if (!vocab.has(ref)) {
      violations.push({
        kind: 'canon-inconsistency',
        detail: `invokes unknown value-key: ${ref}`,
      });
    }
  }
}

/**
 * The ethos gate. Returns { viable: 0|1, violations: [...] }.
 * viable is strictly binary — there is no partial ethos.
 */
export function ethosGate(piece, { vocabulary } = {}) {
  const violations = [];
  if (!piece || typeof piece !== 'object') {
    return { viable: 0, violations: [{ kind: 'unreadable-candidate' }] };
  }
  checkHonestyInNumbers(piece, violations);
  checkNoDelete(piece, violations);
  checkCanonConsistency(piece, violations, vocabulary);
  return { viable: violations.length === 0 ? 1 : 0, violations };
}
