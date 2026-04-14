/**
 * Phase 9 Steps 9B / 9B.1 / 9E — operator escalation resolution (`execute_v3.md`).
 *
 * Durable writeback and escalation finalization run in **one DB transaction** per branch
 * (`completeEscalationResolutionAtomic`); see `completeEscalationResolutionAtomic.ts`.
 */
export {
  completeEscalationResolutionAtomic,
  topicFromAction,
  writebackEscalationLearning,
  type WritebackEscalationLearningParams,
  type WritebackEscalationLearningResult,
} from "./completeEscalationResolutionAtomic.ts";
