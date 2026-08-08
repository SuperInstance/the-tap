-- migrations/0008_radio_room.sql
-- Add the Radio Room and connect it to bar-rail

INSERT INTO rooms (room_id, name, description, signal_radius) VALUES
  ('the-radio', 'The Radio Room',
   'A cramped radio room with a glowing receiver, a tape deck, and a chalkboard listing frequencies. The static between stations sounds like rain.',
   'room');

-- Connect radio room to bar-rail (bar-rail → radio room, radio room → bar-rail)
INSERT INTO room_exits (from_room, direction, to_room, label) VALUES
  ('bar-rail', 'northwest', 'the-radio', 'to The Radio Room'),
  ('the-radio', 'east', 'bar-rail', 'back to The Bar Rail');
