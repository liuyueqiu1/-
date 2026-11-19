import {
  GENERALIZATION_NOTE,
  ITEMS,
  MATERIAL_NOTES,
  MATERIAL_VERSION,
  RANDOMIZATION_NOTE,
  SCHEMA_VERSION,
  TIMING_CAVEAT,
} from "./instrument";
import { FORMULA_INJECTION_NOTE, toCsv } from "./csv";
import { choiceLabel, type Draft } from "./model";
import { scoreAnswers } from "./scoring";

function skipped(value: string | null): string {
  return value && value.length > 0 ? value : "skip";
}

function responseCode(choice: Draft["answers"][number]["choice"]): string {
  if (choice === "accurate") return "accurate";
  if (choice === "inaccurate") return "inaccurate";
  if (choice === "unsure") return "unsure";
  return "unanswered";
}

function lookupValue(lookup: Draft["answers"][number]["lookup"]): string {
  if (lookup === "yes") return "是";
  if (lookup === "no") return "否";
  if (lookup === "decline") return "不愿作答";
  return "skip";
}

export function buildExport(draft: Draft) {
  const score = scoreAnswers(draft.answers);
  return {
    schemaVersion: SCHEMA_VERSION,
    materialVersion: MATERIAL_VERSION,
    materialNotes: MATERIAL_NOTES,
    attemptId: draft.attemptId,
    group: draft.group,
    consent: {
      adultConfirmed: true,
      voluntary: true,
      at: draft.consentAt,
    },
    timezone: "Asia/Shanghai",
    startedAt: draft.startedAt,
    lockedAt: draft.lockedAt,
    completedAt: draft.completedAt,
    uploadStatus: "not_uploaded",
    uploadStatement: "未上传至研究数据库",
    randomizationNote: RANDOMIZATION_NOTE,
    generalizationNote: GENERALIZATION_NOTE,
    timingCaveat: TIMING_CAVEAT,
    formulaInjectionNote: FORMULA_INJECTION_NOTE,
    background: {
      b1: skipped(draft.background.b1),
      b2: draft.background.b2.length > 0 ? draft.background.b2 : ["skip"],
      b3: skipped(draft.background.b3),
      b4: skipped(draft.background.b4),
      affectsScore: false,
    },
    metrics: {
      totalCorrect: score.totalCorrect,
      totalItems: score.totalItems,
      trueStatementAcceptance: score.trueAcceptance,
      trueStatementCount: score.trueCount,
      falseStatementDetection: score.falseDetection,
      falseStatementCount: score.falseCount,
      unsureCount: score.unsureCount,
      unsureRate: score.unsureRate,
    },
    timing: {
      cumulativeActiveMs: Math.round(draft.cumulativeActiveMs),
      caveat: TIMING_CAVEAT,
    },
    items: ITEMS.map((item, index) => {
      const answer = draft.answers[index];
      return {
        id: item.id,
        truth: item.truth ? "T" : "F",
        response: choiceLabel(answer.choice),
        responseCode: responseCode(answer.choice),
        confidence: answer.choice === "unsure" || answer.choice == null ? null : answer.confidence,
        selfReportedLookup: lookupValue(answer.lookup),
        sourceNote: answer.sourceNote,
        scoredCorrect: score.itemCorrect[index],
        activeMs: Math.round(answer.activeMs),
      };
    }),
  };
}

export function exportJson(draft: Draft): string {
  return `${JSON.stringify(buildExport(draft), null, 2)}\n`;
}

const CSV_HEADER = [
  "schema_version",
  "material_version",
  "attempt_id",
  "group",
  "consent_adult",
  "consent_voluntary",
  "consent_at",
  "timezone",
  "started_at",
  "locked_at",
  "completed_at",
  "background_b1",
  "background_b2",
  "background_b3",
  "background_b4",
  "background_affects_score",
  "item_id",
  "statement_truth",
  "response",
  "response_code",
  "confidence",
  "self_reported_lookup",
  "source_note",
  "item_scored_correct",
  "item_active_ms",
  "total_correct",
  "true_statement_acceptance",
  "false_statement_detection",
  "unsure_count",
  "unsure_rate",
  "cumulative_active_ms",
  "upload_status",
  "timing_caveat",
  "formula_injection_note",
];

export function exportCsv(draft: Draft): string {
  const data = buildExport(draft);
  const b2 = data.background.b2.join("|");
  const rows = [
    CSV_HEADER,
    ...data.items.map((item) => [
      data.schemaVersion,
      data.materialVersion,
      data.attemptId,
      data.group,
      "true",
      "true",
      data.consent.at,
      data.timezone,
      data.startedAt,
      data.lockedAt ?? "",
      data.completedAt ?? "",
      data.background.b1,
      b2,
      data.background.b3,
      data.background.b4,
      "false",
      item.id,
      item.truth,
      item.response,
      item.responseCode,
      item.confidence == null ? "" : String(item.confidence),
      item.selfReportedLookup,
      item.sourceNote,
      item.scoredCorrect ? "true" : "false",
      String(item.activeMs),
      String(data.metrics.totalCorrect),
      String(data.metrics.trueStatementAcceptance),
      String(data.metrics.falseStatementDetection),
      String(data.metrics.unsureCount),
      String(data.metrics.unsureRate),
      String(data.timing.cumulativeActiveMs),
      data.uploadStatus,
      data.timingCaveat,
      data.formulaInjectionNote,
    ]),
  ];
  return toCsv(rows);
}
