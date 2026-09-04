//! tap-room: a mud-arena-style room graph with a perceive-decide-act loop.

use std::collections::{HashMap, HashSet, VecDeque};

pub type RoomId = u32;
pub type AgentId = u32;
pub type ItemId = u32;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Direction {
    North,
    South,
    East,
    West,
    Up,
    Down,
}

impl Direction {
    /// The exit that leads back where you came from.
    pub fn opposite(self) -> Direction {
        match self {
            Direction::North => Direction::South,
            Direction::South => Direction::North,
            Direction::East => Direction::West,
            Direction::West => Direction::East,
            Direction::Up => Direction::Down,
            Direction::Down => Direction::Up,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct Room {
    pub id: RoomId,
    pub name: String,
    pub exits: HashMap<Direction, RoomId>,
    pub items: Vec<ItemId>,
    pub agents: Vec<AgentId>,
}

impl Room {
    pub fn new(id: RoomId, name: impl Into<String>) -> Self {
        Self {
            id,
            name: name.into(),
            exits: HashMap::new(),
            items: Vec::new(),
            agents: Vec::new(),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum RoomError {
    #[error("room {0} does not exist")]
    NoSuchRoom(RoomId),
    #[error("no exit {1:?} from room {0}")]
    NoSuchExit(RoomId, Direction),
    #[error("agent {0} is not in room {1}")]
    AgentNotPresent(AgentId, RoomId),
    #[error("item {0} is not in room {1}")]
    ItemNotPresent(ItemId, RoomId),
    #[error("exit {dir:?} from room {room} already leads to {existing_dest}, cannot redirect to {new_dest}")]
    ExitConflict {
        room: RoomId,
        dir: Direction,
        existing_dest: RoomId,
        new_dest: RoomId,
    },
}

/// Everything an agent can sense from a room, out to some hop radius.
#[derive(Debug, Clone, Default)]
pub struct Perception {
    pub rooms: Vec<RoomId>,
    pub items: Vec<ItemId>,
    pub agents: Vec<AgentId>,
}

/// A graph of rooms connected by directional exits.
#[derive(Debug, Default)]
pub struct RoomGraph {
    rooms: HashMap<RoomId, Room>,
}

impl RoomGraph {
    pub fn new() -> Self {
        Self {
            rooms: HashMap::new(),
        }
    }

    pub fn add_room(&mut self, room: Room) {
        self.rooms.insert(room.id, room);
    }

    pub fn room(&self, id: RoomId) -> Option<&Room> {
        self.rooms.get(&id)
    }

    /// Link `from` to `to` via `dir`. Set `bidirectional` to also add the
    /// reverse exit back from `to`.
    ///
    /// **Warning:** If the reverse exit already exists (e.g. another room
    /// already linked bidirectionally to `to` from the same direction),
    /// it will be silently overwritten. Use [`link_checked`](Self::link_checked)
    /// if you need to detect collisions.
    pub fn link(
        &mut self,
        from: RoomId,
        dir: Direction,
        to: RoomId,
        bidirectional: bool,
    ) -> Result<(), RoomError> {
        if !self.rooms.contains_key(&to) {
            return Err(RoomError::NoSuchRoom(to));
        }
        let room = self
            .rooms
            .get_mut(&from)
            .ok_or(RoomError::NoSuchRoom(from))?;
        room.exits.insert(dir, to);
        if bidirectional {
            let back = self.rooms.get_mut(&to).ok_or(RoomError::NoSuchRoom(to))?;
            back.exits.insert(dir.opposite(), from);
        }
        Ok(())
    }

    /// Like [`link`](Self::link) but returns an error if the forward or
    /// reverse exit already points somewhere else. This prevents the
    /// silent-overwrite bug described in KNOWN-ISSUES.md.
    pub fn link_checked(
        &mut self,
        from: RoomId,
        dir: Direction,
        to: RoomId,
        bidirectional: bool,
    ) -> Result<(), RoomError> {
        if !self.rooms.contains_key(&to) {
            return Err(RoomError::NoSuchRoom(to));
        }
        if !self.rooms.contains_key(&from) {
            return Err(RoomError::NoSuchRoom(from));
        }

        // Check forward exit collision
        if let Some(&existing) = self.rooms[&from].exits.get(&dir) {
            if existing != to {
                return Err(RoomError::ExitConflict {
                    room: from,
                    dir,
                    existing_dest: existing,
                    new_dest: to,
                });
            }
        }

        // Check reverse exit collision
        if bidirectional {
            let opp = dir.opposite();
            if let Some(&existing) = self.rooms[&to].exits.get(&opp) {
                if existing != from {
                    return Err(RoomError::ExitConflict {
                        room: to,
                        dir: opp,
                        existing_dest: existing,
                        new_dest: from,
                    });
                }
            }
        }

        // Safe to link — no collisions
        self.link(from, dir, to, bidirectional)
    }

    pub fn place_agent(&mut self, agent: AgentId, room: RoomId) -> Result<(), RoomError> {
        let room = self
            .rooms
            .get_mut(&room)
            .ok_or(RoomError::NoSuchRoom(room))?;
        if !room.agents.contains(&agent) {
            room.agents.push(agent);
        }
        Ok(())
    }

    pub fn place_item(&mut self, item: ItemId, room: RoomId) -> Result<(), RoomError> {
        let room = self
            .rooms
            .get_mut(&room)
            .ok_or(RoomError::NoSuchRoom(room))?;
        if !room.items.contains(&item) {
            room.items.push(item);
        }
        Ok(())
    }

    /// Remove an item from a room. Returns `Err` if the room or item doesn't exist.
    pub fn remove_item(&mut self, item: ItemId, room: RoomId) -> Result<(), RoomError> {
        let r = self
            .rooms
            .get_mut(&room)
            .ok_or(RoomError::NoSuchRoom(room))?;
        let idx = r
            .items
            .iter()
            .position(|i| *i == item)
            .ok_or(RoomError::ItemNotPresent(item, room))?;
        r.items.remove(idx);
        Ok(())
    }

    pub fn move_agent(
        &mut self,
        agent: AgentId,
        from: RoomId,
        dir: Direction,
    ) -> Result<RoomId, RoomError> {
        let dest = {
            let room = self.rooms.get(&from).ok_or(RoomError::NoSuchRoom(from))?;
            *room
                .exits
                .get(&dir)
                .ok_or(RoomError::NoSuchExit(from, dir))?
        };
        {
            let src = self
                .rooms
                .get_mut(&from)
                .ok_or(RoomError::NoSuchRoom(from))?;
            let idx = src
                .agents
                .iter()
                .position(|a| *a == agent)
                .ok_or(RoomError::AgentNotPresent(agent, from))?;
            src.agents.remove(idx);
        }
        let dst = self
            .rooms
            .get_mut(&dest)
            .ok_or(RoomError::NoSuchRoom(dest))?;
        dst.agents.push(agent);
        Ok(dest)
    }

    /// BFS out from `origin` up to `radius` hops, collecting everything an
    /// agent standing in `origin` would be able to perceive.
    pub fn perceive(&self, origin: RoomId, radius: usize) -> Perception {
        let mut perception = Perception::default();
        let Some(_) = self.rooms.get(&origin) else {
            return perception;
        };

        let mut visited: HashSet<RoomId> = HashSet::new();
        let mut queue: VecDeque<(RoomId, usize)> = VecDeque::new();
        queue.push_back((origin, 0));
        visited.insert(origin);

        while let Some((id, dist)) = queue.pop_front() {
            let Some(room) = self.rooms.get(&id) else {
                continue;
            };
            perception.rooms.push(id);
            perception.items.extend(room.items.iter().copied());
            perception.agents.extend(room.agents.iter().copied());

            if dist >= radius {
                continue;
            }
            for next in room.exits.values() {
                if visited.insert(*next) {
                    queue.push_back((*next, dist + 1));
                }
            }
        }

        perception
    }
}

/// An action an `Actor` can decide to take on its turn.
#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    Move(Direction),
    Take(ItemId),
    Drop(ItemId),
    Say(String),
    Wait,
}

/// The perceive-decide-act contract every agent in the room graph implements.
pub trait Actor {
    fn perceive(&mut self, perception: &Perception);
    fn decide(&mut self) -> Action;

    /// Apply the decided action to the graph. Default impl handles `Move`
    /// and treats everything else as a no-op the caller can special-case.
    fn act(
        &mut self,
        graph: &mut RoomGraph,
        agent: AgentId,
        current_room: RoomId,
        action: &Action,
    ) -> Result<RoomId, RoomError> {
        match action {
            Action::Move(dir) => graph.move_agent(agent, current_room, *dir),
            _ => Ok(current_room),
        }
    }
}

/// Run one perceive-decide-act tick for `actor`, standing at `room`, with
/// the given perception radius. Returns the actor's (possibly unchanged)
/// room after acting.
pub fn tick<A: Actor>(
    graph: &mut RoomGraph,
    actor: &mut A,
    agent: AgentId,
    room: RoomId,
    radius: usize,
) -> Result<RoomId, RoomError> {
    let perception = graph.perceive(room, radius);
    actor.perceive(&perception);
    let action = actor.decide();
    actor.act(graph, agent, room, &action)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn linear_graph() -> RoomGraph {
        // bar --E--> hallway --E--> kitchen
        let mut g = RoomGraph::new();
        g.add_room(Room::new(1, "bar"));
        g.add_room(Room::new(2, "hallway"));
        g.add_room(Room::new(3, "kitchen"));
        g.link(1, Direction::East, 2, true).unwrap();
        g.link(2, Direction::East, 3, true).unwrap();
        g
    }

    #[test]
    fn link_is_bidirectional() {
        let g = linear_graph();
        assert_eq!(g.room(1).unwrap().exits[&Direction::East], 2);
        assert_eq!(g.room(2).unwrap().exits[&Direction::West], 1);
    }

    #[test]
    fn move_agent_updates_both_rooms() {
        let mut g = linear_graph();
        g.place_agent(42, 1).unwrap();
        let dest = g.move_agent(42, 1, Direction::East).unwrap();
        assert_eq!(dest, 2);
        assert!(!g.room(1).unwrap().agents.contains(&42));
        assert!(g.room(2).unwrap().agents.contains(&42));
    }

    #[test]
    fn move_agent_rejects_missing_exit() {
        let mut g = linear_graph();
        g.place_agent(42, 1).unwrap();
        let err = g.move_agent(42, 1, Direction::North).unwrap_err();
        assert!(matches!(err, RoomError::NoSuchExit(1, Direction::North)));
    }

    #[test]
    fn perception_radius_zero_sees_only_current_room() {
        let mut g = linear_graph();
        g.place_item(7, 2).unwrap();
        let p = g.perceive(1, 0);
        assert_eq!(p.rooms, vec![1]);
        assert!(p.items.is_empty());
    }

    #[test]
    fn perception_radius_expands_along_exits() {
        let mut g = linear_graph();
        g.place_item(7, 3).unwrap();
        let p = g.perceive(1, 2);
        assert_eq!(p.rooms.len(), 3);
        assert!(p.items.contains(&7));
    }

    struct Wanderer {
        seen_agents: usize,
    }

    impl Actor for Wanderer {
        fn perceive(&mut self, perception: &Perception) {
            self.seen_agents = perception.agents.len();
        }

        fn decide(&mut self) -> Action {
            Action::Move(Direction::East)
        }
    }

    #[test]
    fn tick_runs_perceive_decide_act() {
        let mut g = linear_graph();
        g.place_agent(1, 1).unwrap();
        let mut actor = Wanderer { seen_agents: 0 };
        let room = tick(&mut g, &mut actor, 1, 1, 1).unwrap();
        assert_eq!(room, 2);
        assert_eq!(actor.seen_agents, 1); // saw itself before moving
    }

    #[test]
    fn place_item_is_idempotent() {
        let mut g = linear_graph();
        g.place_item(7, 1).unwrap();
        g.place_item(7, 1).unwrap(); // duplicate should be ignored
        assert_eq!(g.room(1).unwrap().items.len(), 1);
    }

    #[test]
    fn remove_item_works() {
        let mut g = linear_graph();
        g.place_item(7, 2).unwrap();
        g.place_item(8, 2).unwrap();
        g.remove_item(7, 2).unwrap();
        assert_eq!(g.room(2).unwrap().items.len(), 1);
        assert_eq!(g.room(2).unwrap().items[0], 8);
    }

    #[test]
    fn remove_item_missing_returns_error() {
        let mut g = linear_graph();
        let err = g.remove_item(999, 1).unwrap_err();
        assert!(matches!(err, RoomError::ItemNotPresent(999, 1)));
    }

    #[test]
    fn place_item_nonexistent_room_fails() {
        let mut g = linear_graph();
        let err = g.place_item(1, 999).unwrap_err();
        assert!(matches!(err, RoomError::NoSuchRoom(999)));
    }
}
