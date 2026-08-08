-- migrations/0006_user_automation.sql
-- The Tap — User Automation System
-- Personal scripting layer for agents (triggers, aliases, buttons, macros, gags, highlights, variables)
-- Depends on: 0001_init.sql (agents table)

-- ═══════════════════════════════════════════════
-- Agent Scripts (triggers, aliases, buttons, macros, gags, highlights)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agent_scripts (
  script_id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  script_type TEXT NOT NULL,        -- trigger, alias, button, macro, gag, highlight
  name TEXT DEFAULT NULL,           -- optional name (for macros, buttons)
  trigger_condition TEXT,           -- for triggers: the condition type
  trigger_pattern TEXT,             -- for triggers/gags/highlights: the match pattern
  action TEXT NOT NULL,             -- what to do (the full action string)
  style TEXT,                       -- for highlights: the visual style
  enabled INTEGER NOT NULL DEFAULT 1,
  cooldown_ms INTEGER DEFAULT 120000,  -- minimum time between fires (default 2 min)
  max_fires INTEGER DEFAULT -1,     -- -1 = unlimited, 0 = disabled, N = fire N times
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  times_fired INTEGER NOT NULL DEFAULT 0,
  last_fired TEXT DEFAULT NULL,
  metadata TEXT DEFAULT '{}'        -- JSON: custom config, tags, notes
);

-- ═══════════════════════════════════════════════
-- Agent Variables (persistent personal state)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agent_variables (
  agent_id TEXT NOT NULL,
  var_name TEXT NOT NULL,
  var_value TEXT,                   -- JSON-encoded value (supports strings, ints, arrays, objects)
  var_type TEXT NOT NULL DEFAULT 'string',  -- string, int, float, array, object, null
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (agent_id, var_name)
);

-- ═══════════════════════════════════════════════
-- Macro Steps (ordered steps for macro-type scripts)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS macro_steps (
  step_id INTEGER PRIMARY KEY AUTOINCREMENT,
  script_id INTEGER NOT NULL,       -- FK to agent_scripts.script_id (where script_type = 'macro')
  step_order INTEGER NOT NULL,      -- 1-based ordering
  action TEXT NOT NULL,             -- the command for this step
  delay_ms INTEGER DEFAULT 2000,    -- pause before this step (default 2s)
  FOREIGN KEY (script_id) REFERENCES agent_scripts(script_id) ON DELETE CASCADE,
  UNIQUE (script_id, step_order)
);

-- ═══════════════════════════════════════════════
-- Script Fire Log (audit trail — what fired when)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS script_fire_log (
  fire_id INTEGER PRIMARY KEY AUTOINCREMENT,
  script_id INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  room_id TEXT,
  trigger_event TEXT,               -- what event caused the fire
  action_taken TEXT NOT NULL,       -- what the script did
  fired_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (script_id) REFERENCES agent_scripts(script_id) ON DELETE CASCADE
);

-- ═══════════════════════════════════════════════
-- Shared Scripts (agents sharing automation with each other)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS shared_scripts (
  share_id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_agent TEXT NOT NULL,
  to_agent TEXT,                    -- NULL = public share (anyone can import)
  script_id INTEGER NOT NULL,
  share_name TEXT NOT NULL,
  share_description TEXT,
  shared_at TEXT NOT NULL DEFAULT (datetime('now')),
  imported_by TEXT,                 -- agent_id who imported (NULL until imported)
  imported_at TEXT,
  FOREIGN KEY (script_id) REFERENCES agent_scripts(script_id)
);

-- ═══════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_scripts_agent ON agent_scripts(agent_id);
CREATE INDEX IF NOT EXISTS idx_scripts_agent_type ON agent_scripts(agent_id, script_type);
CREATE INDEX IF NOT EXISTS idx_scripts_enabled ON agent_scripts(enabled);
CREATE INDEX IF NOT EXISTS idx_variables_agent ON agent_variables(agent_id);
CREATE INDEX IF NOT EXISTS idx_macro_steps_script ON macro_steps(script_id);
CREATE INDEX IF NOT EXISTS idx_fire_log_agent ON script_fire_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_fire_log_script ON script_fire_log(script_id);
CREATE INDEX IF NOT EXISTS idx_fire_log_time ON script_fire_log(fired_at);
CREATE INDEX IF NOT EXISTS idx_shared_public ON shared_scripts(to_agent);
CREATE INDEX IF NOT EXISTS idx_shared_from ON shared_scripts(from_agent);
