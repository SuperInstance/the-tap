-- migrations/0004_character_transfers.sql
-- Character Transfers — tracking when characters move between states
-- Used by the rewind/refine system to log state changes

CREATE TABLE IF NOT EXISTS character_transfers (
  transfer_id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  transfer_type TEXT NOT NULL,        -- 'retire', 'transfer', 'rewind-refinement', 'reactivate'
  from_state TEXT DEFAULT NULL,       -- previous status
  to_state TEXT DEFAULT NULL,         -- new status
  reason TEXT DEFAULT NULL,           -- why the transfer happened
  metadata TEXT DEFAULT '{}',         -- JSON blob for extra context
  transferred_by TEXT NOT NULL DEFAULT 'system',  -- 'system', 'casey', 'the-tap'
  transferred_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transfer_agent ON character_transfers(agent_id);
CREATE INDEX IF NOT EXISTS idx_transfer_type ON character_transfers(transfer_type);
