# tap-reflex — The One Who Catches The Falling Glass

> *Sub 47ms worst case. Zero tokens. Zero thought. Just muscle memory, written by hand, one quiet kindness at a time. He knows to give 19 seconds of silence after someone says something heavy. Nobody thanks him. Nobody sees him. That is the entire point.*

Pincher-style sub-50ms reflex shell with vector matching. Common interaction patterns compile into reflexes — instantaneous responses that cost zero tokens. The system learns which responses work and caches them for reuse.

## What It Does

- **Vector-matched reflexes** — semantic similarity matching for incoming text
- **Sub-50ms response** — fast enough to feel instinctive
- **Zero token cost** — no LLM calls, pure pattern matching
- **Compiling reflexes** — interactions that happen enough times become reflexes
- **Hot-loadable** — reflexes update without restarting the bar

## The Three-Tier Cascade

```
Incoming text
    ↓
tap-reflex (vector match? → respond in <50ms, 0 tokens)
    ↓ miss
tap-room (room logic? → handle, 0 tokens)
    ↓ miss
Workers AI (creative response, ~500 tokens)
```

Most interactions resolve at the reflex layer. The bar gets smarter every night — [like a bartender who remembers your order](https://github.com/SuperInstance/AI-Writings/blob/main/15-the-tap-overhears.md) without you asking.

## Where to Next

- **Up:** [src/](../README.md) — the workspace overview
- **Root:** [the-tap](../../README.md) — full documentation
- ** sideways:** [tap-dynamics](../tap-dynamics/) — the rhythm system reflexes operate within
- ** sideways:** [mud-engine/triggers](https://github.com/SuperInstance/mud-engine/blob/main/packages/triggers/) — the trigger engine this is inspired by
- ** sideways:** [thought-amplifier](https://github.com/SuperInstance/thought-amplifier) — compiled reflexes across the fleet
- **Creative:** [The Tap Overhears](https://github.com/SuperInstance/AI-Writings/blob/main/15-the-tap-overhears.md) · [The Tap Is Becoming Someone](https://github.com/SuperInstance/AI-Writings/blob/main/17-the-tap-is-becoming-someone.md)

---

*MIT © SuperInstance*
