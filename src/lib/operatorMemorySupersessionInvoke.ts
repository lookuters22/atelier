/**
 * Body for `supersede-operator-assistant-memory` — newer row id first, older (replaced) second.
 */

export type SupersedeOperatorAssistantMemoryInvokeBody = {
  supersedingMemoryId: string;
  supersededMemoryId: string;
};

/** @param newerMemoryId — current memory that should win in retrieval */
/** @param olderMemoryId — outdated memory to hide via chain pointer */
export function buildSupersedeOperatorAssistantMemoryInvokeBody(
  newerMemoryId: string,
  olderMemoryId: string,
): SupersedeOperatorAssistantMemoryInvokeBody {
  return {
    supersedingMemoryId: newerMemoryId,
    supersededMemoryId: olderMemoryId,
  };
}
