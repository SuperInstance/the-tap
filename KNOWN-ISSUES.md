# Bug: Bidirectional Link Overwrites Exits When Multiple Rooms Share a Direction

## Discovered
August 7, 2026 — during integration test writing (overnight creative loop)

## The Bug

In `RoomGraph::link()`, when calling with `bidirectional: true`, the reverse exit is written using `Direction::opposite()`. If two different rooms both link TO the same room via the same direction, the destination room's exit map gets overwritten.

## Reproduction

```rust
let mut g = RoomGraph::new();
g.add_room(Room::new(1, "bar"));
g.add_room(Room::new(2, "hallway"));
g.add_room(Room::new(3, "kitchen"));
g.add_room(Room::new(5, "pantry"));

// hallway East → kitchen (bidirectional)
// kitchen now has West → hallway
g.link(2, Direction::East, 3, true).unwrap();

// pantry East → kitchen (bidirectional)
// kitchen now has West → pantry (OVERWRITES hallway link!)
g.link(5, Direction::East, 3, true).unwrap();

// kitchen.exits[West] is now pantry, not hallway
// The hallway↔kitchen bidirectional link is silently broken
```

## Impact

In a tavern layout where multiple rooms connect to the same destination from the same cardinal direction, earlier connections get silently overwritten. The graph becomes directed where it was meant to be bidirectional.

## Potential Fixes

1. **Use `Vec<(Direction, RoomId)>` instead of `HashMap<Direction, RoomId>`** — allow multiple exits per direction. This matches MUD conventions where "go east" might lead to different places depending on context.

2. **Use different directions** — model this as named exits ("go hallway", "go pantry") rather than cardinal directions.

3. **Error on overwrite** — `link()` could return an error if the exit already exists.

4. **Use a sub-direction or label** — `exits: HashMap<Direction, Vec<RoomId>>` and pick the closest match.

## Current Status

**Known, documented, not yet fixed.** The integration test `agent_can_traverse_full_tavern` accounts for the actual behavior (last writer wins). Fix depends on the desired MUD semantics for The Tap.

## Priority

Medium — doesn't crash, but the graph model needs to be intentional before The Tap goes live with complex room layouts.
