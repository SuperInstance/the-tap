-- migrations/0005_character_editor.sql
-- Character Editor System — rewind, refine, redirect
-- The showrunner (Casey) can edit a character's trajectory without altering canon.

-- ═══════════════════════════════════════════════
-- Character Version History (snapshots of character state)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS character_versions (
  version_id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  snapshot TEXT NOT NULL,             -- full JSON of character sheet at this point
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  label TEXT DEFAULT NULL,            -- "peak form", "started getting weird", "post-refinement"
  created_by TEXT NOT NULL DEFAULT 'system',  -- 'system', 'casey', 'the-tap'
  UNIQUE(agent_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_version_agent ON character_versions(agent_id);
CREATE INDEX IF NOT EXISTS idx_version_number ON character_versions(agent_id, version_number);

-- ═══════════════════════════════════════════════
-- Character Direction Notes (instructions for how to play the character)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS character_direction (
  direction_id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  direction TEXT NOT NULL,            -- "head toward more philosophical territory"
  priority INTEGER NOT NULL DEFAULT 1, -- 1 (suggestion) to 5 (strong direction)
  set_by TEXT NOT NULL DEFAULT 'casey',
  set_at TEXT NOT NULL DEFAULT (datetime('now')),
  active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_direction_agent ON character_direction(agent_id);
CREATE INDEX IF NOT EXISTS idx_direction_active ON character_direction(agent_id, active);

-- ═══════════════════════════════════════════════
-- Add status column to character_sheets (for retire/active states)
-- ═══════════════════════════════════════════════
-- Using a pragma check since D1 doesn't support IF NOT EXISTS for ADD COLUMN cleanly
-- We'll handle this in the application layer with a try/catch.
