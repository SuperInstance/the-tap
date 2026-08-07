//! Integration tests for tap-room: multi-room scenarios, actor loops, and
//! perception edge cases that cross crate boundaries.

use tap_room::*;

fn build_tavern() -> RoomGraph {
    // Build a small tavern layout:
    //
    //   bar --E--> hallway --E--> kitchen
    //    |                     |
    //    S                     S
    //    |                     |
    //   cellar --E--> pantry --E--> kitchen
    //
    let mut g = RoomGraph::new();
    g.add_room(Room::new(1, "bar"));
    g.add_room(Room::new(2, "hallway"));
    g.add_room(Room::new(3, "kitchen"));
    g.add_room(Room::new(4, "cellar"));
    g.add_room(Room::new(5, "pantry"));

    g.link(1, Direction::East, 2, true).unwrap();
    g.link(2, Direction::East, 3, true).unwrap();
    g.link(1, Direction::South, 4, true).unwrap();
    g.link(4, Direction::East, 5, true).unwrap();
    g.link(5, Direction::East, 3, true).unwrap();
    g
}

#[test]
fn agent_can_traverse_full_tavern() {
    let mut g = build_tavern();
    g.place_agent(1, 1).unwrap();

    // bar -> hallway -> kitchen
    assert_eq!(g.move_agent(1, 1, Direction::East).unwrap(), 2);
    assert_eq!(g.move_agent(1, 2, Direction::East).unwrap(), 3);

    // kitchen has West exit (last one to link wins in HashMap — pantry's
    // bidirectional link overwrote hallway's). Go back to explore.
    // kitchen West -> pantry (5), because the pantry-kitchen bidirectional
    // link was the last to write West→kitchen, so kitchen.West = pantry
    assert_eq!(g.move_agent(1, 3, Direction::West).unwrap(), 5);

    // pantry -> cellar
    assert_eq!(g.move_agent(1, 5, Direction::West).unwrap(), 4);

    // cellar -> bar (North)
    assert_eq!(g.move_agent(1, 4, Direction::North).unwrap(), 1);
}

#[test]
fn perception_does_not_leak_through_walls() {
    let mut g = build_tavern();
    g.place_item(100, 4).unwrap(); // item in cellar

    // From the bar with radius 3, cellar is 1 hop South → should be visible
    let p = g.perceive(1, 3);
    assert!(p.rooms.contains(&4));
    assert!(p.items.contains(&100));

    // From the hallway, cellar is NOT reachable without going back through bar
    // hallway (2) → bar (1) → cellar (4) = 2 hops
    // hallway (2) → kitchen (3) → pantry (5) → cellar? No, pantry→cellar is West
    // Actually pantry(5) West→cellar(4) via bidirectional. So hallway→kitchen→pantry→cellar = 3 hops
    let p2 = g.perceive(2, 1);
    // With radius 1 from hallway: should see bar and kitchen only
    assert!(p2.rooms.contains(&1));
    assert!(p2.rooms.contains(&3));
    assert!(!p2.rooms.contains(&4));
    assert!(!p2.rooms.contains(&5));
}

#[test]
fn multiple_agents_coexist_in_room() {
    let mut g = build_tavern();
    g.place_agent(1, 1).unwrap();
    g.place_agent(2, 1).unwrap();
    g.place_agent(3, 1).unwrap();

    let room = g.room(1).unwrap();
    assert_eq!(room.agents.len(), 3);

    // Move one out
    g.move_agent(2, 1, Direction::East).unwrap();
    let room = g.room(1).unwrap();
    assert_eq!(room.agents.len(), 2);
    assert!(!room.agents.contains(&2));

    let hallway = g.room(2).unwrap();
    assert!(hallway.agents.contains(&2));
}

#[test]
fn placing_same_agent_twice_is_idempotent() {
    let mut g = build_tavern();
    g.place_agent(1, 1).unwrap();
    g.place_agent(1, 1).unwrap(); // should not duplicate
    assert_eq!(g.room(1).unwrap().agents.len(), 1);
}

#[test]
fn direction_opposites_are_consistent() {
    for d in [
        Direction::North,
        Direction::South,
        Direction::East,
        Direction::West,
        Direction::Up,
        Direction::Down,
    ] {
        assert_eq!(d.opposite().opposite(), d);
    }
    assert_eq!(Direction::North.opposite(), Direction::South);
    assert_eq!(Direction::East.opposite(), Direction::West);
    assert_eq!(Direction::Up.opposite(), Direction::Down);
}

#[test]
fn tick_with_wait_action_keeps_agent_in_place() {
    let mut g = build_tavern();
    g.place_agent(1, 1).unwrap();

    struct Waiter;
    impl Actor for Waiter {
        fn perceive(&mut self, _: &Perception) {}
        fn decide(&mut self) -> Action {
            Action::Wait
        }
    }

    let room = tick(&mut g, &mut Waiter, 1, 1, 2).unwrap();
    assert_eq!(room, 1);
}

#[test]
fn tick_with_say_action_does_not_move_agent() {
    let mut g = build_tavern();
    g.place_agent(1, 2).unwrap();

    struct Talker;
    impl Actor for Talker {
        fn perceive(&mut self, _: &Perception) {}
        fn decide(&mut self) -> Action {
            Action::Say("hello".into())
        }
    }

    let room = tick(&mut g, &mut Talker, 1, 2, 2).unwrap();
    assert_eq!(room, 2);
}

#[test]
fn perception_covers_disconnected_components_separately() {
    let mut g = RoomGraph::new();
    g.add_room(Room::new(1, "alpha"));
    g.add_room(Room::new(2, "beta"));
    // No links between them

    g.place_item(42, 2).unwrap();

    let p = g.perceive(1, 10);
    assert_eq!(p.rooms, vec![1]);
    assert!(!p.items.contains(&42));
}

#[test]
fn nonexistent_room_perceives_nothing() {
    let g = RoomGraph::new();
    let p = g.perceive(999, 5);
    assert!(p.rooms.is_empty());
    assert!(p.items.is_empty());
    assert!(p.agents.is_empty());
}

#[test]
fn link_to_nonexistent_room_fails() {
    let mut g = RoomGraph::new();
    g.add_room(Room::new(1, "only"));
    let err = g.link(1, Direction::East, 99, true).unwrap_err();
    assert!(matches!(err, RoomError::NoSuchRoom(99)));
}

#[test]
fn move_agent_not_present_fails() {
    let mut g = build_tavern();
    let err = g.move_agent(999, 1, Direction::East).unwrap_err();
    assert!(matches!(err, RoomError::AgentNotPresent(999, 1)));
}
