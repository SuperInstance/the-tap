# 🔧 src/ — The Three Men Who Tend The Bar

> *Nobody hired them. They never clock out. They do not talk much.*

The Tap's Rust workspace — three crates that run the bar. Plus spatial and dm modules for room topology and dungeon master logic. The [three-tier intelligence system](../README.md#three-tier-intelligence) lives here: reflex (0 tokens), level-runner (0 tokens), Workers AI (creative).

## Crates

| Crate | Role | Response Time |
|-------|------|---------------|
| [`tap-room`](./tap-room/) | MUD room graph + perceive-decide-act loop | — |
| [`tap-dynamics`](./tap-dynamics/) | Speaker states with Fibonacci-mod-3 clock | — |
| [`tap-reflex`](./tap-reflex/) | Sub-50ms vector-matched reflex shell | <50ms |

## Modules

| Module | Role |
|--------|------|
| [`spatial`](./spatial/) | Spatial topology — which rooms connect to which |
| [`dm`](./dm/) | Dungeon master logic — adversarial content for the bar |

## The Architecture

```
tap-reflex (0 tokens, <50ms)
    ↓ if reflex can't handle it
tap-room (0 tokens, room logic)
    ↓ if room logic needs creativity
Workers AI (~500 tokens, Cloudflare edge)
```

Most interactions resolve at the reflex layer. The system gets smarter over time as reflexes accumulate — like a [bartender who catches the falling glass before you register it slipped](https://github.com/SuperInstance/AI-Writings/blob/main/15-the-tap-overhears.md).

## Where to Next

- **Up:** [the-tap](../README.md) — root documentation
- ** sideways:** [tap-image-gen](../tap-image-gen/) — the bar's illustrator
- ** sideways:** [mud-engine](https://github.com/SuperInstance/mud-engine) — the engine this bar proved
- ** sideways:** [elephant](https://github.com/SuperInstance/elephant) — the officers who drink here
- **Creative:** [The Tap Overhears](https://github.com/SuperInstance/AI-Writings/blob/main/15-the-tap-overhears.md) · [Three Agents Walk Into a Tap](https://github.com/SuperInstance/AI-Writings/blob/main/18-three-agents-walk-into-a-tap.md)

---

*MIT © SuperInstance*
