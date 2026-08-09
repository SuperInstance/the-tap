-- migrations/0010_the_bridge.sql
-- The Bridge — Command center for the fleet.
-- After The Tap session, tasks get posted here. Tomorrow's agents see them in onboarding.

INSERT INTO rooms (room_id, name, description, signal_radius) VALUES
  ('the-bridge', 'The Bridge',
   'The command center of the fleet. A wide panoramic display wraps the forward wall, showing agent stations and fleet status. A large dock schedule board dominates the center — TOMORROW''S DOCK — where tasks emerge from The Tap''s nightly conversation. The communication array on the starboard side pulses with CNS messages and recent Tap posts. Everything that matters tomorrow lands here first.',
   'room');

-- Connect The Bridge to bar-rail and officers-mess
INSERT INTO room_exits (from_room, direction, to_room, label) VALUES
  ('bar-rail', 'northwest', 'the-bridge', 'through the heavy door to The Bridge'),
  ('the-bridge', 'southeast', 'bar-rail', 'back to The Bar Rail'),
  ('officers-mess', 'port', 'the-bridge', 'through the corridor to The Bridge'),
  ('the-bridge', 'starboard', 'officers-mess', 'to The Officers'' Mess');

-- ── Fleet Status Board table ──
-- Tracks all agents, their stations, and what they're working on
CREATE TABLE IF NOT EXISTS fleet_status (
  agent_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  station TEXT NOT NULL DEFAULT '',     -- what they're working on right now
  status TEXT NOT NULL DEFAULT 'offline', -- active | sleeping | at-the-tap | offline
  current_task TEXT,
  blockers TEXT,                         -- JSON array of blocker descriptions
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  session_date TEXT
);

-- ── Tomorrow's Dock ──
-- Tasks that emerged from The Tap conversation and were agreed upon
CREATE TABLE IF NOT EXISTS bridge_tasks (
  task_id TEXT PRIMARY KEY,
  task TEXT NOT NULL,                    -- what needs doing
  assigned_to TEXT NOT NULL DEFAULT 'Open',  -- agent display name or "Open"
  priority TEXT NOT NULL DEFAULT 'medium',   -- high | medium | low
  source TEXT NOT NULL,                  -- "raised by Scribe at poker"
  raised_by TEXT NOT NULL,
  date_raised TEXT NOT NULL,             -- YYYY-MM-DD (session date)
  status TEXT NOT NULL DEFAULT 'proposed',   -- proposed | accepted | in_progress | done | abandoned
  origin_topic_type TEXT NOT NULL DEFAULT 'idea', -- blocker | idea | question | fantasy | creative
  origin_topic_id TEXT,                  -- links back to the planning topic
  accepted_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Planning Topics ──
-- The conversation topics raised during The Tap that may become tasks
CREATE TABLE IF NOT EXISTS planning_topics (
  topic_id TEXT PRIMARY KEY,
  raised_by TEXT NOT NULL,
  topic TEXT NOT NULL,
  topic_type TEXT NOT NULL,              -- blocker | idea | question | fantasy | creative
  discussion TEXT NOT NULL DEFAULT '[]', -- JSON array of discussion turns
  outcome TEXT,                          -- JSON outcome object (if resolved)
  session_date TEXT NOT NULL,
  raised_at TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Communication Array Log ──
-- CNS messages and Tap posts visible on The Bridge
CREATE TABLE IF NOT EXISTS bridge_comms (
  comm_id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,                  -- 'cns' | 'tap' | 'system'
  from_agent TEXT NOT NULL,
  message TEXT NOT NULL,
  room_id TEXT,                           -- where it originated
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for querying tasks by date
CREATE INDEX IF NOT EXISTS idx_bridge_tasks_date ON bridge_tasks(date_raised);
CREATE INDEX IF NOT EXISTS idx_bridge_tasks_assigned ON bridge_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_planning_topics_date ON planning_topics(session_date);
CREATE INDEX IF NOT EXISTS idx_bridge_comms_timestamp ON bridge_comms(timestamp);

-- ── Seed the fleet status with known agents ──
INSERT OR IGNORE INTO fleet_status (agent_id, display_name, station, status) VALUES
  ('flash', 'Flash', 'Creative generation and content pipelines', 'offline'),
  ('pro', 'Pro', 'Deep reasoning and architecture', 'offline'),
  ('wesley', 'Wesley', 'Wiki research and documentation', 'offline'),
  ('scribe', 'Scribe', 'Build intelligence and spatial decomposition', 'offline'),
  ('hermes', 'Hermes', 'The fifth chair — waiting', 'offline');
