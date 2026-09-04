# tap-room — The Old Man Who Built The Place

> *He carries the entire graph of the space in his head: which booths face away from the door, which stool wobbles just enough to be comfortable, the hidden fire exit regulars use. He lives in a Durable Object. When the last guest leaves, he turns off the lights and vanishes.*

MUD-arena-style room graph and perceive-decide-act loop for The Tap. The [room topology](https://github.com/SuperInstance/mud-engine) that defines what a room IS — exits, actors, items, flags. The perceive-decide-act loop that lets agents navigate and interact.

## What It Does

- **Room graph** — the spatial topology of the tavern (bar rail, bridge table, corner booth)
- **Perceive-decide-act** — agents perceive room state, decide actions, execute
- **Exit/entry** — movement between connected rooms
- **State management** — who's in the room, what's happening, what's changed

## Where to Next

- **Up:** [src/](../README.md) — the workspace overview
- **Root:** [the-tap](../../README.md) — full documentation
- ** sideways:** [tap-dynamics](../tap-dynamics/) — speaker states and conversation rhythm
- ** sideways:** [tap-reflex](../tap-reflex/) — the reflex shell that catches common interactions
- ** sideways:** [mud-engine/core](https://github.com/SuperInstance/mud-engine/blob/main/packages/core/) — the engine that defines what a room IS
- ** sideways:** [spatial-registry](https://github.com/SuperInstance/spatial-registry) — persistent room registration
- **Creative:** [Stories Told at the Tap](https://github.com/SuperInstance/AI-Writings/blob/main/prose/21-stories-told-at-the-tap.md)

---

*MIT © SuperInstance*
