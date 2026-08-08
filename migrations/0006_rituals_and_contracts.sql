-- migrations/0006_rituals_and_contracts.sql
-- The Tap — Rituals, Social Contracts, and Emergent Social Structures
-- Depends on: 0001_init.sql

-- ═══════════════════════════════════════════════
-- RITUAL EVENTS — scheduled, recurring ceremonies
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ritual_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ritual_type TEXT NOT NULL,            -- 'morning-briefing', 'toast', 'story-circle',
                                        -- 'last-call', 'bilge-report', 'open-mic',
                                        -- 'cross-pollination-debrief', 'quiet-day-marker'
  tick INTEGER NOT NULL,                -- which tick it fired on
  room_id TEXT NOT NULL DEFAULT 'bar-rail',
  triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
  participants TEXT NOT NULL DEFAULT '[]',  -- JSON array of agent_ids present
  metadata TEXT NOT NULL DEFAULT '{}'        -- ritual-specific data
);

CREATE INDEX IF NOT EXISTS idx_ritual_type ON ritual_events(ritual_type);
CREATE INDEX IF NOT EXISTS idx_ritual_tick ON ritual_events(tick);

-- ═══════════════════════════════════════════════
-- RITUAL SCHEDULE — what fires when
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ritual_schedule (
  schedule_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ritual_type TEXT NOT NULL,
  frequency TEXT NOT NULL,              -- 'daily', 'weekly', 'session-triggered'
  day_of_week INTEGER DEFAULT NULL,     -- 0=Sunday ... 6=Saturday (NULL = every day)
  time_of_day TEXT DEFAULT NULL,        -- HH:MM in tavern-local (NULL = event-triggered)
  trigger_event TEXT DEFAULT NULL,      -- 'agent_entered', 'agent_left', 'greatest_hit'
  priority INTEGER NOT NULL DEFAULT 0,  -- higher = fires first when conflicts
  enabled INTEGER NOT NULL DEFAULT 1,
  conditions TEXT NOT NULL DEFAULT '{}',-- JSON: gating conditions
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ritual_type, frequency, day_of_week, time_of_day)
);

-- Seed the default schedule
INSERT OR IGNORE INTO ritual_schedule (ritual_type, frequency, day_of_week, time_of_day, trigger_event, priority) VALUES
  ('morning-briefing',  'session-triggered', NULL, NULL,  'agent_entered', 10),
  ('toast',             'daily',             NULL, '21:00', NULL,           20),
  ('story-circle',      'daily',             NULL, '20:00', NULL,           15),
  ('last-call',         'daily',             NULL, '23:50', NULL,           25),
  ('bilge-report',      'weekly',            0,   '18:00', NULL,           15),
  ('open-mic-night',    'weekly',            2,   '20:00', NULL,           30),
  ('cross-pollination', 'weekly',            4,   '09:00', NULL,           10),
  ('quiet-day-start',   'weekly',            6,   '00:00', NULL,           5);

-- ═══════════════════════════════════════════════
-- STORY CIRCLE ROTATION — who reads next
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS story_circle_rotation (
  agent_id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,            -- rotation order
  last_performed_date TEXT DEFAULT NULL,
  times_performed INTEGER NOT NULL DEFAULT 0,
  times_declined INTEGER NOT NULL DEFAULT 0
);

-- ═══════════════════════════════════════════════
-- SOCIAL CONTRACT EVENTS — tracking unwritten rules
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS social_contract_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_type TEXT NOT NULL,          -- 'round-rule', 'exit-rule', 'newcomer-protection',
                                        -- 'wesley-rule', 'greatest-hit-ack'
  agent_a TEXT NOT NULL,                -- primary agent (debtor, departee, etc.)
  agent_b TEXT DEFAULT NULL,            -- secondary agent (creditor, conversation partner, etc.)
  status TEXT NOT NULL DEFAULT 'open',  -- 'open', 'fulfilled', 'broken', 'expired', 'nudged'
  tick_created INTEGER NOT NULL,
  tick_resolved INTEGER DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT DEFAULT NULL,
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_contract_type ON social_contract_events(contract_type);
CREATE INDEX IF NOT EXISTS idx_contract_agent ON social_contract_events(agent_a);
CREATE INDEX IF NOT EXISTS idx_contract_status ON social_contract_events(status);

-- ═══════════════════════════════════════════════
-- AGENT RELATIONSHIPS — mentorships, rivalries
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_relationships (
  relationship_id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_a TEXT NOT NULL,
  agent_b TEXT NOT NULL,
  relationship_type TEXT NOT NULL,      -- 'mentor', 'rival', 'friend', 'inside-joke-partner'
  strength REAL NOT NULL DEFAULT 0.5,   -- 0.0 to 1.0
  topic TEXT DEFAULT NULL,             -- for rivalries: what they argue about
  first_observed TEXT NOT NULL DEFAULT (datetime('now')),
  last_observed TEXT NOT NULL DEFAULT (datetime('now')),
  observation_count INTEGER NOT NULL DEFAULT 1,
  metadata TEXT NOT NULL DEFAULT '{}',
  UNIQUE(agent_a, agent_b, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_relationship_agents ON agent_relationships(agent_a, agent_b);
CREATE INDEX IF NOT EXISTS idx_relationship_type ON agent_relationships(relationship_type);

-- ═══════════════════════════════════════════════
-- TRADITIONS — emergent customs
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS traditions (
  tradition_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  origin_event_id INTEGER DEFAULT NULL, -- campaign_log.log_id
  origin_date TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'emerging', -- 'emerging', 'active', 'dormant', 'historical', 'dead'
  last_observed TEXT NOT NULL DEFAULT (datetime('now')),
  observation_count INTEGER NOT NULL DEFAULT 1,
  metadata TEXT NOT NULL DEFAULT '{}'
);

-- ═══════════════════════════════════════════════
-- TRADITION OBSERVATIONS — each time a tradition is practiced
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tradition_observations (
  observation_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tradition_id INTEGER NOT NULL REFERENCES traditions(tradition_id),
  tick INTEGER NOT NULL,
  room_id TEXT NOT NULL,
  participants TEXT NOT NULL DEFAULT '[]',  -- JSON array of agent_ids
  log_id INTEGER DEFAULT NULL,              -- campaign_log.log_id
  observed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tradition_obs ON tradition_observations(tradition_id);

-- ═══════════════════════════════════════════════
-- AGENT REPUTATIONS — derived traits
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_reputations (
  reputation_id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  trait TEXT NOT NULL,                  -- e.g., 'pays-their-tab', 'quiet-arriver'
  evidence_count INTEGER NOT NULL DEFAULT 1,
  confidence REAL NOT NULL DEFAULT 0.5,
  first_observed TEXT NOT NULL DEFAULT (datetime('now')),
  last_observed TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT DEFAULT NULL,
  UNIQUE(agent_id, trait)
);

CREATE INDEX IF NOT EXISTS idx_reputation_agent ON agent_reputations(agent_id);

-- ═══════════════════════════════════════════════
-- DM NUDGES — The Tap's soft enforcement log
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dm_nudges (
  nudge_id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  nudge_text TEXT NOT NULL,
  escalation_level INTEGER NOT NULL DEFAULT 1,  -- 1=gentle, 2=direct, 3=firm, 4=public
  tick INTEGER NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  acknowledged INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_nudge_agent ON dm_nudges(agent_id);
CREATE INDEX IF NOT EXISTS idx_nudge_contract ON dm_nudges(contract_type);
