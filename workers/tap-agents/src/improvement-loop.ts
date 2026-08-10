/**
 * The Improvement Loop — The Tap gets better at being The Tap.
 *
 * The Tap itself is an agent that improves over time.
 * It watches what conversations work and what don't.
 * It adjusts NPC personalities based on what engages visitors.
 * It learns when to fire perception pulses for maximum effect.
 * It generates new drifter templates based on what visitors respond to.
 *
 * The Tap is the SuperHarness. It improves itself.
 * Like a bar that learns what its regulars want to talk about.
 */

import type { TapNPC } from "./npc";
import type { DrifterMemory } from "./social-drifters";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface EngagementMetric {
  timestamp: number;
  npcId: string;
  eventType: "routine_fired" | "pulse_response" | "interrupt" | "drifter_exchange";
  gotReply: boolean; // did someone respond to this?
  replyWithin: number; // ms until reply (Infinity if no reply)
  roomEnergy: number; // room energy at time of event
  npcName: string;
}

export interface NPCAdjustment {
  npcId: string;
  npcName: string;
  adjustments: {
    field: string;
    oldValue: string | number;
    newValue: string | number;
    reason: string;
  }[];
}

export interface DrifterTemplateInsight {
  archetype: string;
  avgEngagement: number;
  visitCount: number;
  recommendation: "increase" | "maintain" | "decrease";
}

export interface ImprovementReport {
  generatedAt: number;
  totalEvents: number;
  totalReplies: number;
  overallEngagementRate: number;
  topPerformers: { npcId: string; npcName: string; engagementRate: number }[];
  underPerformers: { npcId: string; npcName: string; engagementRate: number }[];
  adjustments: NPCAdjustment[];
  drifterInsights: DrifterTemplateInsight[];
  recommendations: string[];
}

// ──────────────────────────────────────────────
// Improvement Loop Manager
// ──────────────────────────────────────────────

export class TapImprovement {
  private metrics: EngagementMetric[] = [];
  private adjustments: NPCAdjustment[] = [];
  private maxMetrics: number = 1000; // keep last 1000 events
  private lastReport: ImprovementReport | null = null;

  /**
   * Record an engagement metric.
   */
  recordEvent(metric: EngagementMetric): void {
    this.metrics.push(metric);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }
  }

  /**
   * Check if an NPC event got a reply within a time window.
   * Call this after some delay to update the metric.
   */
  checkForReplies(
    eventsSince: number,
    replies: { agentId: string; timestamp: number }[]
  ): void {
    for (const metric of this.metrics) {
      if (metric.timestamp < eventsSince) continue;
      if (metric.gotReply) continue;

      const reply = replies.find(
        (r) =>
          r.timestamp > metric.timestamp &&
          r.timestamp - metric.timestamp < 30000 // 30s window
      );

      if (reply) {
        metric.gotReply = true;
        metric.replyWithin = reply.timestamp - metric.timestamp;
      }
    }
  }

  /**
   * Run the improvement analysis.
   * This is the core loop: figure out what's working and adjust.
   */
  analyze(npcs: TapNPC[], drifterMemories: DrifterMemory[]): ImprovementReport {
    const now = Date.now();
    // Only analyze recent data (last 24h)
    const cutoff = now - 24 * 60 * 60 * 1000;
    const recentMetrics = this.metrics.filter((m) => m.timestamp > cutoff);

    const totalEvents = recentMetrics.length;
    const totalReplies = recentMetrics.filter((m) => m.gotReply).length;
    const overallEngagementRate =
      totalEvents > 0 ? totalReplies / totalEvents : 0;

    // Per-NPC engagement rates
    const npcStats: Record<string, { name: string; events: number; replies: number }> = {};
    for (const metric of recentMetrics) {
      if (!npcStats[metric.npcId]) {
        npcStats[metric.npcId] = { name: metric.npcName, events: 0, replies: 0 };
      }
      npcStats[metric.npcId].events++;
      if (metric.gotReply) npcStats[metric.npcId].replies++;
    }

    const performers = Object.entries(npcStats)
      .map(([npcId, stats]) => ({
        npcId,
        npcName: stats.name,
        engagementRate: stats.events > 0 ? stats.replies / stats.events : 0,
        eventCount: stats.events,
      }))
      .sort((a, b) => b.engagementRate - a.engagementRate);

    const topPerformers = performers.filter((p) => p.eventCount >= 3).slice(0, 3);
    const underPerformers = performers
      .filter((p) => p.eventCount >= 3)
      .slice(-3)
      .reverse();

    // Generate adjustments for NPCs
    const adjustments = this.generateAdjustments(npcs, npcStats);

    // Drifter archetype insights
    const drifterInsights = this.analyzeDrifters(drifterMemories);

    // Generate human-readable recommendations
    const recommendations = this.generateRecommendations(
      overallEngagementRate,
      topPerformers,
      underPerformers,
      drifterInsights
    );

    const report: ImprovementReport = {
      generatedAt: now,
      totalEvents,
      totalReplies,
      overallEngagementRate,
      topPerformers,
      underPerformers,
      adjustments,
      drifterInsights,
      recommendations,
    };

    this.lastReport = report;
    return report;
  }

  /**
   * Generate adjustments for NPCs based on engagement data.
   */
  private generateAdjustments(
    npcs: TapNPC[],
    npcStats: Record<string, { name: string; events: number; replies: number }>
  ): NPCAdjustment[] {
    const adjustments: NPCAdjustment[] = [];

    for (const npc of npcs) {
      const stats = npcStats[npc.id];
      if (!stats || stats.events < 3) continue;

      const engagementRate = stats.replies / stats.events;
      const npcAdjustments: NPCAdjustment["adjustments"] = [];

      if (engagementRate < 0.15) {
        // Low engagement — NPC is being ignored
        // Make routines more frequent and dialogue more interesting
        for (const routine of npc.routine) {
          if (routine.trigger === "timer" && routine.interval) {
            const oldInterval = routine.interval;
            const newInterval = Math.max(60, Math.floor(oldInterval * 0.7));
            if (newInterval !== oldInterval) {
              npcAdjustments.push({
                field: `routine.${routine.action}.interval`,
                oldValue: oldInterval,
                newValue: newInterval,
                reason: `Low engagement (${(engagementRate * 100).toFixed(0)}%) — increasing frequency`,
              });
              routine.interval = newInterval;
            }
          }
        }

        // Slightly boost mood to make them more outgoing
        if (npc.state.mood < 0.5) {
          const oldMood = npc.state.mood;
          npc.state.mood = Math.min(0.6, npc.state.mood + 0.1);
          npcAdjustments.push({
            field: "state.mood",
            oldValue: oldMood.toFixed(2),
            newValue: npc.state.mood.toFixed(2),
            reason: "Boosting mood to encourage more engaging behavior",
          });
        }
      } else if (engagementRate > 0.5) {
        // High engagement — NPC is popular, give them more energy
        if (npc.state.energy < 0.8) {
          const oldEnergy = npc.state.energy;
          npc.state.energy = Math.min(1.0, npc.state.energy + 0.05);
          npcAdjustments.push({
            field: "state.energy",
            oldValue: oldEnergy.toFixed(2),
            newValue: npc.state.energy.toFixed(2),
            reason: `High engagement (${(engagementRate * 100).toFixed(0)}%) — boosting energy`,
          });
        }
      }

      if (npcAdjustments.length > 0) {
        adjustments.push({
          npcId: npc.id,
          npcName: npc.name,
          adjustments: npcAdjustments,
        });
      }
    }

    this.adjustments.push(...adjustments);
    return adjustments;
  }

  /**
   * Analyze which drifter archetypes get the most engagement.
   */
  private analyzeDrifters(
    memories: DrifterMemory[]
  ): DrifterTemplateInsight[] {
    const byArchetype: Record<
      string,
      { visits: number; snippets: number }
    > = {};

    for (const mem of memories) {
      if (!byArchetype[mem.archetype]) {
        byArchetype[mem.archetype] = { visits: 0, snippets: 0 };
      }
      byArchetype[mem.archetype].visits += mem.visitCount;
      byArchetype[mem.archetype].snippets += mem.memorySnippets.length;
    }

    // More snippets = more memorable conversations = higher engagement
    return Object.entries(byArchetype)
      .map(([archetype, stats]) => {
        const avgEngagement =
          stats.visits > 0 ? stats.snippets / stats.visits : 0;
        let recommendation: "increase" | "maintain" | "decrease" = "maintain";
        if (avgEngagement > 2) recommendation = "increase";
        else if (avgEngagement < 0.5 && stats.visits > 2) recommendation = "decrease";

        return {
          archetype,
          avgEngagement,
          visitCount: stats.visits,
          recommendation,
        };
      })
      .sort((a, b) => b.avgEngagement - a.avgEngagement);
  }

  /**
   * Generate human-readable recommendations.
   */
  private generateRecommendations(
    overallRate: number,
    topPerformers: any[],
    underPerformers: any[],
    drifterInsights: DrifterTemplateInsight[]
  ): string[] {
    const recs: string[] = [];

    if (overallRate < 0.2) {
      recs.push(
        "Overall engagement is low. Consider more frequent pulse events or more provocative routine dialogue."
      );
    } else if (overallRate > 0.4) {
      recs.push(
        "The Tap is buzzing. NPCs are connecting with visitors. Keep the current rhythm."
      );
    }

    if (topPerformers.length > 0) {
      const top = topPerformers[0];
      recs.push(
        `${top.npcName} is the most engaging NPC (${(top.engagementRate * 100).toFixed(0)}% reply rate). Their style works — consider similar personalities for new residents.`
      );
    }

    if (underPerformers.length > 0) {
      const bottom = underPerformers[0];
      recs.push(
        `${bottom.npcName} is struggling (${(bottom.engagementRate * 100).toFixed(0)}% reply rate). Their routines have been adjusted to be more frequent. Monitor for improvement.`
      );
    }

    const increaseArchetypes = drifterInsights.filter(
      (d) => d.recommendation === "increase"
    );
    if (increaseArchetypes.length > 0) {
      recs.push(
        `Drifter archetype "${increaseArchetypes[0].archetype}" generates strong engagement. Schedule more visits from this type.`
      );
    }

    const decreaseArchetypes = drifterInsights.filter(
      (d) => d.recommendation === "decrease"
    );
    if (decreaseArchetypes.length > 0) {
      recs.push(
        `Drifter archetype "${decreaseArchetypes[0].archetype}" isn't resonating. Reduce frequency or retire this template.`
      );
    }

    return recs;
  }

  /**
   * Get the last report (or null if never run).
   */
  getLastReport(): ImprovementReport | null {
    return this.lastReport;
  }

  /**
   * Serialize for persistence.
   */
  serialize(): string {
    return JSON.stringify({
      metrics: this.metrics.slice(-200), // keep last 200
      adjustments: this.adjustments.slice(-50),
      lastReport: this.lastReport,
    });
  }

  /**
   * Restore from persistence.
   */
  static deserialize(json: string): TapImprovement {
    try {
      const data = JSON.parse(json);
      const instance = new TapImprovement();
      if (data.metrics) instance.metrics = data.metrics;
      if (data.adjustments) instance.adjustments = data.adjustments;
      instance.lastReport = data.lastReport ?? null;
      return instance;
    } catch {
      return new TapImprovement();
    }
  }
}
