-- migrations/0002_seed_rooms.sql
-- Seed The Tap's rooms and exits

INSERT INTO rooms (room_id, name, description, signal_radius) VALUES
  ('bar-rail', 'The Bar Rail',
   'The counter is polished dark wood, well-worn where elbows have rested. Behind it, rows of bottles catch the light. The air smells of old wood and conversation.',
   'table'),
  ('bridge-table', 'The Bridge Table',
   'A wide table covered with charts and half-sketched diagrams. The chairs are high-backed, meant for long strategic sessions. Someone has left a coffee ring on the corner.',
   'table'),
  ('corner-booth', 'The Corner Booth',
   'Tucked away from the main flow, this booth offers privacy. The leather is cracked and comfortable. Conversations here tend toward the intimate and the deep.',
   'whisper'),
  ('open-mic-stage', 'The Open Mic Stage',
   'A small raised platform with a single microphone stand. The spotlight is warm. When someone is up there, the whole room turns to listen.',
   'shout'),
  ('library-nook', 'The Library Nook',
   'Shelves line the walls, filled with worn technical books and binders labeled with project names. A reading lamp casts a warm circle on a small table.',
   'whisper'),
  ('engine-room', 'The Engine Room',
   'The hum of machinery bleeds through the wall. This is where infrastructure gets debated. Whiteboards covered in deployment diagrams. The coffee is stronger here.',
   'room'),
  ('galley', 'The Galley',
   'The kitchen, warm and steamy. Pots clatter. This is where new ideas get cooked up. The chef doesn''t mind the conversation, as long as you stay out of the way.',
   'room'),
  ('wheelhouse', 'The Wheelhouse',
   'A small room with a ship''s wheel mounted on the wall, more decorative than functional. Charts and planning documents are pinned everywhere. This is where the course gets set.',
   'table'),
  ('aft-deck', 'The Aft Deck',
   'Open air. The night sky is visible. A few mismatched chairs and an ashtray on the railing. This is where the late-night philosophical conversations happen.',
   'room');

-- Exits
INSERT INTO room_exits (from_room, direction, to_room, label) VALUES
  -- Bar Rail is the hub
  ('bar-rail', 'north', 'open-mic-stage', 'toward The Open Mic Stage'),
  ('bar-rail', 'east', 'bridge-table', 'to The Bridge Table'),
  ('bar-rail', 'west', 'library-nook', 'to The Library Nook'),
  ('bar-rail', 'south', 'corner-booth', 'to The Corner Booth'),

  -- Open Mic Stage
  ('open-mic-stage', 'south', 'bar-rail', 'back to The Bar Rail'),

  -- Bridge Table
  ('bridge-table', 'west', 'bar-rail', 'back to The Bar Rail'),
  ('bridge-table', 'south', 'corner-booth', 'to The Corner Booth'),

  -- Library Nook
  ('library-nook', 'east', 'bar-rail', 'back to The Bar Rail'),
  ('library-nook', 'south', 'corner-booth', 'to The Corner Booth'),

  -- Corner Booth
  ('corner-booth', 'north', 'bar-rail', 'back to The Bar Rail'),
  ('corner-booth', 'east', 'galley', 'to The Galley'),
  ('corner-booth', 'west', 'wheelhouse', 'to The Wheelhouse'),

  -- Galley
  ('galley', 'west', 'corner-booth', 'back to The Corner Booth'),

  -- Wheelhouse
  ('wheelhouse', 'east', 'corner-booth', 'back to The Corner Booth'),
  ('wheelhouse', 'south', 'engine-room', 'to The Engine Room'),

  -- Engine Room
  ('engine-room', 'north', 'wheelhouse', 'back to The Wheelhouse'),
  ('engine-room', 'east', 'aft-deck', 'to The Aft Deck'),

  -- Aft Deck
  ('aft-deck', 'west', 'engine-room', 'back to The Engine Room');
