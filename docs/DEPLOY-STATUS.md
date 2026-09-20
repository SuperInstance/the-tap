# Deploy Status — verified 2026-09-20 (fleet audit, Lane H + Lane J)

This file is the additive answer to a standing question: *is the worker
deployed?* It does not replace `PRODUCTION-LOG.md` (the multi-agent build
narrative) — it records the audited, reproducible state of the tree as of
the date above. When the state changes, update this file in the same PR.

## Verified state (run these yourself; do not trust the prose)

| Check | Command | Result (2026-09-20) |
|-------|---------|---------------------|
| Rust suite | `cargo test` (workspace) | 54/54 |
| Node suite | `node --test` (per package) | 66/66 |
| Python suite | `pytest` | 28/28 |
| Fresh install | `npm ci` | ✅ (fixed by PR #2) |
| Bundle | `wrangler deploy --dry-run` (gateway) | 364 KiB, all bindings resolve |

The "17 tests" figure in earlier logs is round-1 scaffolding history; the
real suite is 148 checks and it is green.

## Where deploy stands

The worker is **not deployed**. Remaining work, in the smallest order that
gets to a live door:

1. ✅ `npm ci` + satellite binding mismatches — **PR #2**
2. ⬜ `RoomState.compileViaAI` is called (`src/` room DO, ~line 873) but
   defined nowhere — MODEL-tier escalation throws TypeError inside the
   Durable Object. Fix: implement the method (injectable AI adapter,
   defensive parse, HYBRID fallback), or stub MODEL→HYBRID.
3. ⬜ `env.AI.embed(...)` × 5 sites is not a real Workers AI API — rewrite
   as `AI.run("@cf/baai/bge-small-en-v1.5", {text})` per Cloudflare docs
   (the pattern is already used correctly elsewhere in the same files).
4. ⬜ **Typecheck gate in CI** — wrangler bundles without typechecking, so
   items 2–3 would ship silently. CI currently covers only Rust.
5. ⬜ **Provision Cloudflare resources** (§7.4): verify or create the
   hardcoded D1/KV/Vectorize/R2 bindings and set secrets. Status unknown —
   see open question 28 in the fleet question pool.
6. ⬜ Deploy satellites, then gateway; run migrations 0001–0010 + seed;
   `wrangler dev` smoke.

Note: the gateway's Room DO embeds directly and never calls the
PINCHER/LEVEL_RUNNER service bindings — satellites may be droppable from
v1 (open question 29).

## Trust items (Casey's call, recorded not resolved)

- `research/music-cognition-deep-study.md` claims 14 crates source-read;
  1 exists (verified). Flagged in the production log — delete, annotate,
  or keep as a monument.
- `PRODUCTION-LOG.md` is round-1 stale relative to a tree carrying
  migrations through 0010 and ~15 audit rounds — rewrite or delete before
  Fable's round 10.

## For agents picking this up

Start from the table, not from memory. Every row has a command; run it.
If a row's result has changed, the tree moved — fix this file in the same
commit that changed the code. A status file that lags the tree is worse
than none, because it teaches people to trust prose over checks.
