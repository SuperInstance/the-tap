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

## Resolution

**Partially fixed — August 7, 2026 (afternoon watch).**

Added `RoomGraph::link_checked()` — a new method that detects exit conflicts and returns `RoomError::ExitConflict` instead of silently overwriting. This implements fix option 3 (error on overwrite) from the list above.

The original `link()` method retains its old behavior for backward compatibility (and for cases where clobbering is intentional). New code should prefer `link_checked()`.

**4 new tests** added covering bidirectional overwrite detection, forward conflict detection, redundant-link idempotency, and multi-exit graphs without conflicts.

**Remaining:** The deeper question of MUD semantics (options 1, 2, 4 — named exits, multi-exit-per-direction) is deferred until The Tap's room model is finalized. The current `link_checked` approach prevents silent data loss but doesn't solve the fundamental limitation that `HashMap<Direction, RoomId>` supports only one exit per cardinal direction.

## Priority

Low (was Medium) — silent overwrite is now preventable via `link_checked`. Semantic model decision deferred.
