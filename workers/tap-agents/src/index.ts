/**
 * tap-agents — Living agent system for The Tap.
 *
 * Exports:
 * - NPC system (algorithmic characters that awaken on pulse)
 * - Social drifters (temporary visitors on cheap models)
 * - Perception pulse (event-driven NPC awakening)
 * - Improvement loop (The Tap learns what engages)
 *
 * Architecture: Hermit Crab Protocol
 *   Agent (crab) → Harness (shell: Ollama/DeepInfra) → Shared Fiction (The Tap)
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

export { AgentSystem } from "./agent-system";
