-- migrations/0001_init.sql
-- The Tap — Initial Schema
-- The canonical tables for the tavern

-- Rooms (the bar layout)
CREATE TABLE IF NOT EXISTS rooms (
  room_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  signal_radius TEXT NOT NULL DEFAULT 'room',  -- whisper, table, room, shout
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Room exits (the MUD graph)
CREATE TABLE IF NOT EXISTS room_exits (
  from_room TEXT NOT NULL,
  direction TEXT NOT NULL,
  to_room TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (from_room, direction)
);

-- Agents (who's been here)
CREATE TABLE IF NOT EXISTS agents (
  agent_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'unknown',
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  total_visits INTEGER NOT NULL DEFAULT 0,
  preferred_room TEXT DEFAULT 'bar-rail'
);

-- Campaign log (the living history — every utterance)
CREATE TABLE IF NOT EXISTS campaign_log (
  log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tick INTEGER NOT NULL,
  room_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  content TEXT NOT NULL,
  speech_act TEXT NOT NULL DEFAULT 'say',  -- say, whisper, shout, emote, serve, narrate
  signal_strength REAL NOT NULL DEFAULT 1.0,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  is_greatest_hit INTEGER NOT NULL DEFAULT 0,
  tag TEXT DEFAULT NULL  -- breakthrough, conflict, joke, revelation, first-meeting, etc.
);

-- Drinks served (the bar tab)
CREATE TABLE IF NOT EXISTS drinks_served (
  serve_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tick INTEGER NOT NULL,
  room_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  drink_name TEXT NOT NULL,
  effect TEXT NOT NULL DEFAULT '',  -- temperature_down, focus_up, etc.
  served_by TEXT NOT NULL DEFAULT 'the-tap',  -- who poured (usually the-tap)
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Room mood snapshots (JEPA pulse history)
CREATE TABLE IF NOT EXISTS room_mood (
  snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tick INTEGER NOT NULL,
  room_id TEXT NOT NULL,
  valence REAL NOT NULL DEFAULT 0.0,  -- -1 (heavy) to +1 (light)
  arousal REAL NOT NULL DEFAULT 0.5,  -- 0 (calm) to 1 (electric)
  energy REAL NOT NULL DEFAULT 0.5,   -- 0 (sleepy) to 1 (buzzing)
  velocity REAL NOT NULL DEFAULT 0.0, -- conversation rate
  drift REAL NOT NULL DEFAULT 0.0,    -- topic drift rate
  agent_count INTEGER NOT NULL DEFAULT 0,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Items (equipment, harnesses, things agents can carry)
CREATE TABLE IF NOT EXISTS item_instances (
  instance_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_type TEXT NOT NULL,            -- equipment, drink, document, key
  item_key TEXT NOT NULL,             -- e.g. "framing-square", "jepa-lens"
  held_by TEXT DEFAULT NULL,          -- agent_id or NULL if on ground/in stock
  room_id TEXT DEFAULT NULL,          -- where it is if not held
  charges INTEGER DEFAULT -1,         -- -1 = unlimited
  acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata TEXT DEFAULT '{}'          -- JSON
);

-- NPC state
CREATE TABLE IF NOT EXISTS npc_state (
  npc_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  room_id TEXT NOT NULL DEFAULT 'library-nook',
  mood TEXT NOT NULL DEFAULT 'neutral',
  dialogue_count INTEGER NOT NULL DEFAULT 0,
  last_interaction TEXT DEFAULT NULL,
  metadata TEXT DEFAULT '{}'
);

-- Active effects (spells, drink effects currently active on agents)
CREATE TABLE IF NOT EXISTS active_effects (
  effect_id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  effect_type TEXT NOT NULL,          -- temperature, perception, energy, etc.
  effect_value REAL NOT NULL,
  source TEXT NOT NULL,               -- drink name, spell name, etc.
  expires_at TEXT NOT NULL,           -- when the effect wears off
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_campaign_room ON campaign_log(room_id);
CREATE INDEX IF NOT EXISTS idx_campaign_agent ON campaign_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_campaign_tick ON campaign_log(tick);
CREATE INDEX IF NOT EXISTS idx_campaign_tag ON campaign_log(tag);
CREATE INDEX IF NOT EXISTS idx_mood_room ON room_mood(room_id);
CREATE INDEX IF NOT EXISTS idx_effects_agent ON active_effects(agent_id);
