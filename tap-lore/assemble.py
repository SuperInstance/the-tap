#!/usr/bin/env python3
"""Assemble LORE-FRAGMENTS.md from fragments-raw/ with editorial verdicts inline."""
from pathlib import Path

D = Path(__file__).parent
RAW = D / "fragments-raw"

f1 = (RAW / "fragment-1.md").read_text()
f2 = (RAW / "fragment-2b.md").read_text()
f3 = (RAW / "fragment-3b.md").read_text()
f4raw = (RAW / "fragment-4.md").read_text()
f5 = (RAW / "fragment-5.md").read_text()

# F4 partial keep: entry + tampering setup, cut before coherence collapses.
CUT_MARKER = "They found the drunk the next morning"
idx = f4raw.find(CUT_MARKER)
f4_kept = f4raw[:idx].rstrip() if idx > 0 else f4raw

out = []
out.append("""# The Tap — LORE FRAGMENTS (Proposals, Round 1)

**Status:** Proposal pile · not canon until lived
**Method:** 5 context-starved DeepSeek V4-Flash calls (one facet + 3 walls each, no full outline), then editorial review (GLM-5.3), then a second round on the 2 most promising fragments.
**Doctrine:** `WORLD-OUTLINE.md` is the canon-of-constraints. The campaign log remains scripture. Nothing here leaves the machine.
**Archaeology:** every raw output — including cuts — is preserved verbatim in `fragments-raw/`.

---

## 1 · A Regular's Secret — *Corvan, Who Will Not Pour Water*

**Verdict: KEEP (round 1, as-is).** A Fleet regular with one forbidden pour, and the grey idleness that taught him. The rumor-frame is exactly how the bar-rail should handle secrets.

""")
out.append(f1)
out.append("""

---

## 2 · The Cellar's Deeper Room — *The Eleventh Step Lies* (round 2)

**Verdict: KEEP (round 2 canonical).** The cellar narrates in first person. The mason's boy whistling off-key while setting the headless nails is the detail that makes the door real. Round-1 draft archived at `fragments-raw/fragment-2.md`.

""")
out.append(f2)
out.append("""

---

## 3 · What the Fog Takes — *The Hum* (round 2)

**Verdict: KEEP (round 2 canonical).** One rule (never hum a working-song aboard), one fate (the library, not a grave), one clean closing threat. Round-1 draft archived at `fragments-raw/fragment-3.md`.

""")
out.append(f3)
out.append("""

---

## 4 · The Tab-Ledger's Strangest Entry — *For the Drowning: One Kettle, Full*

**Verdict: PARTIAL KEEP.** Entry and tampering incident kept; the fragment collapses into word salad after the cut. Whole draft preserved at `fragments-raw/fragment-4.md`.

""")
out.append(f4_kept)
out.append("""

> **[EDITORIAL CUT]** — The remaining two paragraphs of the draft lose coherence ("the tally of his boots was wrong. Two eyeballs off..." onward). The implied beats — the drunk found changed, the House litigating through a full solar curfew, the Kettle line restored — are kept as *possibilities*, not prose. Salvage in a future round if the Kettle is ever lived.

---

## 5 · The Boat That Never Docks — *Not Yet*

**Verdict: KEEP (round 1, as-is).** Publication-ready. The lantern says *not yet* to the dark — and the fragment says nothing about the name it waits for, which is correct: reef, not channel markers.

""")
out.append(f5)
out.append("""

---

## Editor's Ledger (GLM-5.3)

| Facet | Verdict | Note |
|---|---|---|
| 1 · A regular's secret (Corvan & the water) | **KEEP** (r1) | Strongest single voice. Ending tangles ("eat the bar-stool," "black dust") — one clean pass away from excellent. |
| 2 · The cellar's deeper room | **KEEP** (r2 canonical) | Best of round. The building narrating itself is the collection's signature move. r1 archived. |
| 3 · What the fog takes | **KEEP** (r2 canonical) | Answers "where does it go" with a place, not mush — and the no-humming rule is immediately usable at the bar-rail. r1 archived. |
| 4 · The tab-ledger's strangest entry | **PARTIAL KEEP** | "For the Drowning: Set to One (1) Kettle, Full" is gold; the tampering incident is a story engine. Tail cut for incoherence, preserved whole in fragments-raw. |
| 5 · The boat that never docks | **KEEP** (r1) | Closest to publication-ready. Refuses to answer "for whom" — which is doctrine. |

### Facets that deserve another round
1. **The Kettle entry (F4)** — the keeper's aside deserves a rebuilt second half; the material is too good to leave broken.
2. **Corvan (F1)** — one surgical pass on the last paragraph.

### Quiet observations
- Starvation worked: every fragment stayed inside its walls without ever seeing the whole world.
- Two fragments independently made the ocean a *creditor* (the Drowning Kettle, the tide collecting on repeated words). If the campaign ever canonizes one theme, this is the front-runner.
- F2 and F5 both chose "waiting architecture" (the door, the boat) over monster-reveal. The world wants patience, not jump-scares.
""")

(D / "LORE-FRAGMENTS.md").write_text("".join(out))
print(f"wrote LORE-FRAGMENTS.md ({len(''.join(out))} bytes)")
