/**
 * Strict Zod gate for operator learning-loop writeback (authoritative before any RPC).
 */
import { z } from "npm:zod@4";
import { Constants } from "../../../../src/types/database.types.ts";
import { OPERATOR_RESOLUTION_WRITEBACK_SCHEMA_VERSION } from "../../../../src/types/operatorResolutionWriteback.types.ts";

const decisionModeTuple = Constants.public.Enums.decision_mode as unknown as [string, ...string[]];
const ruleScopeTuple = Constants.public.Enums.rule_scope as unknown as [string, ...string[]];
const threadChannelTuple = Constants.public.Enums.thread_channel as unknown as [string, ...string[]];

const DecisionModeSchema = z.enum(decisionModeTuple);
const RuleScopeSchema = z.enum(ruleScopeTuple);
const ThreadChannelSchema = z.enum(threadChannelTuple);

const optionalParseableIso = z
  .union([z.string(), z.null()])
  .optional()
  .superRefine((val, ctx) => {
    if (val === undefined || val === null) return;
    if (Number.isNaN(Date.parse(val))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "must be a parseable ISO date or datetime string",
      });
    }
  });

const optionalFinite01 = z
  .union([z.number(), z.null()])
  .optional()
  .superRefine((val, ctx) => {
    if (val === undefined || val === null) return;
    if (!Number.isFinite(val) || val < 0 || val > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "confidence must be finite in [0, 1]",
      });
    }
  });

const optionalObsGe1 = z
  .union([z.number(), z.null()])
  .optional()
  .superRefine((val, ctx) => {
    if (val === undefined || val === null) return;
    if (!Number.isFinite(val) || !Number.isInteger(val) || val < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "observationCount must be an integer >= 1 when present",
      });
    }
  });

const CorrelationSchema = z
  .object({
    escalationId: z.string().nullable().optional(),
    threadId: z.string().nullable().optional(),
    weddingId: z.string().nullable().optional(),
    operatorResolutionSummary: z.string().nullable().optional(),
    rawOperatorText: z.string().nullable().optional(),
  })
  .strict();

const AuthorizedCaseExceptionArtifactSchema = z
  .object({
    kind: z.literal("authorized_case_exception"),
    overridesActionKey: z.string().trim().min(1),
    targetPlaybookRuleId: z.union([z.string().uuid(), z.null()]).optional(),
    overridePayload: z.record(z.string(), z.unknown()),
    effectiveFromIso: optionalParseableIso,
    effectiveUntilIso: optionalParseableIso,
    notes: z.string().nullable().optional(),
  })
  .strict();

const MemoryArtifactSchema = z
  .object({
    kind: z.literal("memory"),
    memoryType: z.string().trim().min(1),
    title: z.string(),
    summary: z.string(),
    fullContent: z.string(),
    weddingId: z.union([z.string().uuid(), z.null()]).optional(),
  })
  .strict();

const PlaybookRuleCandidateArtifactSchema = z
  .object({
    kind: z.literal("playbook_rule_candidate"),
    proposedActionKey: z.string().trim().min(1),
    topic: z.string().trim().min(1),
    proposedInstruction: z.string().trim().min(1),
    proposedDecisionMode: DecisionModeSchema,
    proposedScope: RuleScopeSchema,
    proposedChannel: z.union([ThreadChannelSchema, z.null()]).optional(),
    sourceClassification: z.record(z.string(), z.unknown()).optional(),
    confidence: optionalFinite01,
    operatorResolutionSummary: z.string().nullable().optional(),
    originatingOperatorText: z.string().nullable().optional(),
    sourceEscalationId: z.union([z.string().uuid(), z.null()]).optional(),
    threadId: z.union([z.string().uuid(), z.null()]).optional(),
    weddingId: z.union([z.string().uuid(), z.null()]).optional(),
    observationCount: optionalObsGe1,
  })
  .strict();

const OperatorResolutionWritebackArtifactSchema = z.discriminatedUnion("kind", [
  AuthorizedCaseExceptionArtifactSchema,
  MemoryArtifactSchema,
  PlaybookRuleCandidateArtifactSchema,
]);

export const OperatorResolutionWritebackEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(OPERATOR_RESOLUTION_WRITEBACK_SCHEMA_VERSION),
    photographerId: z.string().uuid(),
    correlation: CorrelationSchema,
    artifacts: z.array(OperatorResolutionWritebackArtifactSchema).min(1),
  })
  .strict()
  .superRefine((data, ctx) => {
    const keys = data.artifacts
      .filter((a): a is z.infer<typeof AuthorizedCaseExceptionArtifactSchema> => a.kind === "authorized_case_exception")
      .map((a) => a.overridesActionKey);
    const seen = new Set<string>();
    for (const k of keys) {
      if (seen.has(k)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate overridesActionKey: ${k}`,
          path: ["artifacts"],
        });
        return;
      }
      seen.add(k);
    }

    const exceptionKeys = new Set(
      data.artifacts
        .filter((a): a is z.infer<typeof AuthorizedCaseExceptionArtifactSchema> => a.kind === "authorized_case_exception")
        .map((a) => a.overridesActionKey.trim().toLowerCase()),
    );
    for (const a of data.artifacts) {
      if (a.kind !== "memory") continue;
      const mt = a.memoryType.trim().toLowerCase();
      if (exceptionKeys.has(mt)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `memory memoryType must not match an exception overridesActionKey (${mt})`,
          path: ["artifacts"],
        });
        return;
      }
      const blob = `${a.title}\n${a.summary}\n${a.fullContent}`.toLowerCase();
      for (const key of exceptionKeys) {
        if (key.length < 2) continue;
        if (blob.includes(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `memory text must not restate the same operational override as an exception (action key: ${key})`,
            path: ["artifacts"],
          });
          return;
        }
      }
    }
  });

export type OperatorResolutionWritebackEnvelopeParsed = z.infer<typeof OperatorResolutionWritebackEnvelopeSchema>;

export type ValidationFailedResult = {
  ok: false;
  code: "VALIDATION_FAILED";
  issues: z.ZodFlattenedError<unknown>;
};

export function safeParseOperatorResolutionWritebackEnvelope(
  input: unknown,
): { ok: true; data: OperatorResolutionWritebackEnvelopeParsed } | ValidationFailedResult {
  const r = OperatorResolutionWritebackEnvelopeSchema.safeParse(input);
  if (!r.success) {
    return { ok: false, code: "VALIDATION_FAILED", issues: r.error.flatten() };
  }
  return { ok: true, data: r.data };
}
