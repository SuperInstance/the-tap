# DEI Champion Gossip — Upgrade Note for the Red Queen Critic

Frontier seed (edge-watch 2026-09-21, arXiv 2605.27130): distributed Digital
Red Queen — **async cross-node champion gossip across heterogeneous LLMs**.
One population, many substrates; a lineage that only ever competes inside one
model's head is running a Red Queen against its own shadow.

## What ships today (PR #6 Red Queen)

Critic rotation is **single-node**: K≥2 critics rotated locally, held-out
windows, candor term-vector instruments. Value-disjointness is enforced
statically + functionally. That is necessary and it is not yet a Red Queen —
it is a committee.

## The upgrade: champion gossip, not more local critics

1. **Champion = lineage's best-scoring candidate under critic C_i, cached.**
   Each critic node (possibly a different model, a different fleet agent, a
   different org's agent with intersecting values / disjoint expertise)
   holds one champion per niche.
2. **Gossip = async, receipt-signed exchange of champions.** A champion
   travels with its full receipt chain (fuel, held-out windows, candor
   attestation). Receiving node re-scores the champion against ITS critic
   and its held-out set — never trusting the sender's score.
3. **Displacement rule unchanged:** a local candidate that loses to an
   inbound champion is displaced; death = D1 (ledger sealed to achieved/).
   Niches stay MAP-Elites cells; gossip only changes who gets to compete.
4. **Anti-Goodhart trio inherits:** Performed Twist (gossiped champions
   must survive rotating probes on arrival), niche flooding (novelty gate
   on candor term vectors applies to inbound champions too), report
   gaming (disjoint windows — sender and receiver must not share a
   window or the score is evidence of nothing).

## Honest gaps

- **Sybil gossip:** a node can mint many identities and flood champions.
  Not solved here; a fuel-priced gossip cost (D5 peer-ACK mint) is the
  obvious lever, unpriced today.
- **Latency:** async means a niche can sit undefended for a gossip round.
  Acceptable if displacement is monotonic (champions never lose retroactively).
- **Values intersection is the admission ticket:** a node with disjoint
  VALUES (not just disjoint expertise) is not a critic, it is an adversary
  with a stamp. Admission = existing value-disjointness static check,
  run at handshake, receipt-pinned.
- **This is a design note, not a build.** Smallest real experiment: two
  fleet agents (e.g. candor-critic + a cross-model critic) gossiping one
  champion over the hermit WAL receipt channel.

## One-line claim

Single-node rotation asks "can a different local eye impress this?";
champion gossip asks "can a different MIND displace this?" — the second
is the actual Red Queen.
