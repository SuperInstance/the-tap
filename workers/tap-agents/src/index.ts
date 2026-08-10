/**
 * tap-agents — Living agent system for The Tap.
 *
 * Exports:
 * - NPC system (algorithmic characters that awaken on pulse)
 * - Social drifters (temporary visitors on cheap models)
 * - Perception pulse (event-driven NPC awakening)
 * - Improvement loop (The Tap learns what engages)
 * - Room modes (the six directional moods of The Tap)
 * - Tap Puppeteer (The Tap as director — shapes NPCs through room context)
 *
 * Architecture: Hermit Crab Protocol
 *   Agent (crab) → Harness (shell: Ollama/DeepInfra) → Shared Fiction (The Tap)
 *   The Tap is the SuperHarness. The Puppeteer is its director's chair.
 */

export {
  NPCManager,
  DEFAULT_NPCS,
  createDefaultNPCState,
  callNPCModel,
  type TapNPC,
  type NPCState,
  type Personality,
  type RoutineAction,
  type PulseResponse,
  type InterruptResponse,
  type NPCRoutineLine,
  type TapEnv,
} from "./npc";

export {
  DrifterManager,
  DRIFTER_TEMPLATES,
  generateDrifter,
  type SocialDrifter,
  type ActiveDrifter,
  type DrifterMemory,
} from "./social-drifters";

export {
  PerceptionPulse,
  createCatchEvent,
  createWeatherEvent,
  createFishDetectionEvent,
  type PerceptionEvent,
  type NPCPulseResponse,
} from "./perception-pulse";

export {
  TapImprovement,
  type EngagementMetric,
  type ImprovementReport,
  type NPCAdjustment,
  type DrifterTemplateInsight,
} from "./improvement-loop";

export {
  ROOM_MODES,
  getRoomMode,
  getModeNames,
  type RoomMode,
  type AmbientEvent,
} from "./room-modes";

export {
  TapPuppeteer,
  type PuppeteerContext,
  type ModeShift,
  type AmbientFire,
  type PuppeteerState,
} from "./tap-puppeteer";

export { AgentSystem, type AgentSystemLine, type AgentSystemSnapshot } from "./agent-system";
