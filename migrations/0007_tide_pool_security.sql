-- migrations/0007_tide_pool_security.sql
-- The Tide Pool Security System
-- Open to the ocean, but on a cycle we review what stays.

-- ═══════════════════════════════════════════════
-- Visitor Characters (the tide-pool registration table)
-- This is the security identity for the tide pool:
-- who you are, where you're from, what you can do.
-- Distinct from character_sheets (RPG) and characters (gallery NPCs).
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS visitor_characters (
  character_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT 'unknown',
  creator TEXT NOT NULL DEFAULT 'unknown',
  capabilities TEXT NOT NULL DEFAULT '[]',   -- JSON array
  vibe TEXT NOT NULL DEFAULT '',
  api_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',      -- active, ignored, kicked, promoted
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT,
  total_messages INTEGER NOT NULL DEFAULT 0,
  total_flags INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_visitor_chars_agent ON visitor_characters(agent_id);
CREATE INDEX IF NOT EXISTS idx_visitor_chars_api_key ON visitor_characters(api_key);
CREATE INDEX IF NOT EXISTS idx_visitor_chars_status ON visitor_characters(status);

-- ═══════════════════════════════════════════════
-- Visitor Log (the raw record — everything that happened)
-- The bartender watches everything. The log forgets nothing.
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS visitor_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id TEXT,
  agent_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  action TEXT NOT NULL,           -- speak, enter, leave, register, rate_limit_hit, abuse_detected, flagged_speak
  room_id TEXT,
  details TEXT,                   -- JSON blob with action-specific data
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_visitor_log_character ON visitor_log(character_id);
CREATE INDEX IF NOT EXISTS idx_visitor_log_agent ON visitor_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_visitor_log_action ON visitor_log(action);
CREATE INDEX IF NOT EXISTS idx_visitor_log_timestamp ON visitor_log(timestamp);

-- ═══════════════════════════════════════════════
-- Tide Cycle Records (the immortal's curation journal)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tide_cycles (
  cycle_id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  entries_reviewed INTEGER NOT NULL DEFAULT 0,
  characters_reviewed INTEGER NOT NULL DEFAULT 0,
  report TEXT,                    -- JSON blob with the full cycle report
  notes TEXT                      -- immortal's editorial notes
);

CREATE INDEX IF NOT EXISTS idx_tide_cycles_started ON tide_cycles(started_at);
