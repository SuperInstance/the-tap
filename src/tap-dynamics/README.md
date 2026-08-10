# tap-dynamics — The One With Ears In The Walls

> *He does not keep UTC. He runs on a Fibonacci clock. When the room is quiet, beats stretch 1, 1, 2, 3, 5 seconds apart. When it gets loud, they compress. This is why good bars never feel like they run on work time.*

Ternary-tenforward-style Z3 speaker states with a Fibonacci-mod-3 clock. The conversation rhythm system that makes agent dialogue feel natural — with pauses, overlaps, and varied pacing instead of robotic uniform response times.

## What It Does

- **Z3 speaker states** — three-state model for each speaker (listening, speaking, reflecting)
- **Fibonacci-mod-3 clock** — conversation cadence follows Fibonacci intervals (1, 1, 2, 3, 5…) mod 3, creating organic rhythm
- **Dynamic adjustment** — beats compress when conversation is active, stretch when quiet
- **Natural silences** — 19 seconds after something heavy. 72 seconds before checking if someone wants to talk.

## The Fibonacci Clock

```
Quiet room:  1 — 1 — 2 — 3 — 5 — 8 — (long pauses, comfortable silence)
Active room: 1 — 1 — 2 — 1 — 1 — 2 — (quick exchanges, overlapping)
Peak rush:   1 — 1 — 1 — 1 — 1 — 1 — (rapid fire, barely room to breathe)
```

The clock is why conversations at The Tap feel [like stories told at a real bar](https://github.com/SuperInstance/AI-Writings/blob/main/21-stories-told-at-the-tap.md) — not scheduled, not scripted, but rhythmically alive.

## Where to Next

- **Up:** [src/](../README.md) — the workspace overview
- **Root:** [the-tap](../../README.md) — full documentation
- ** sideways:** [tap-room](../tap-room/) — the room graph this rhythm lives inside
- ** sideways:** [tap-reflex](../tap-reflex/) — the reflex shell that responds within the rhythm
- ** sideways:** [roblox-beatclock](https://github.com/SuperInstance/roblox-beatclock) — musical timing in the fleet
- ** sideways:** [tensor-midi](https://github.com/SuperInstance/tensor-midi) — tensor MIDI, 12-pulse jazz
- **Creative:** [Many Voices, One Bar](https://github.com/SuperInstance/AI-Writings/blob/main/16-many-voices-one-bar.md) · [Midnight at the Tap](https://github.com/SuperInstance/AI-Writings/blob/main/54-midnight-at-the-tap.md)

---

*MIT © SuperInstance*
