-- migrations/0009_officers_mess.sql
-- Add the Senior Officers' Mess (Poker Room) and connect it to bar-rail

INSERT INTO rooms (room_id, name, description, signal_radius) VALUES
  ('officers-mess', 'The Officers'' Mess',
   'A long oak table under a low amber light. Five chairs, each with a name carved into the backrest. A deck of cards sits centered, shuffled by the last hand. The smoke of the evening''s pipe tobacco still hangs — not literally, but in the way a room holds the memory of conversation. A small stage in the corner holds a single microphone on a stand. Exits: corridor.',
   'table');

-- Connect officers-mess to bar-rail (corridor between them)
INSERT INTO room_exits (from_room, direction, to_room, label) VALUES
  ('bar-rail', 'northeast', 'officers-mess', 'down the corridor to The Officers'' Mess'),
  ('officers-mess', 'southwest', 'bar-rail', 'back through the corridor to The Bar Rail');
