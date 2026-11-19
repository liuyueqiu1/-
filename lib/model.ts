import { B2_OPTIONS, type GroupId, ITEMS, MATERIAL_VERSION, SCHEMA_VERSION } from "./instrument";

export type Phase = "questions" | "review" | "retrospective" | "debrief";
export type Choice = "accurate" | "inaccurate" | "unsure";
export type Lookup = "yes" | "no" | "decline";

export interface ItemResponse {
  choice: Choice | null;
  confidence: number | null;
  lookup: Lookup | null;
  sourceNote: string;
  activeMs: number;
}

export interface BackgroundAnswers {
  b1: string | null;
  b2: string[];
  b3: string | null;
  b4: string | null;
}

export interface Draft {
  schemaVersion: typeof SCHEMA_VERSION;
  materialVersion: typeof MATERIAL_VERSION;
  attemptId: string;
  group: GroupId;
  phase: Phase;
  questionIndex: number;
  consentAt: string;
  startedAt: string;
  lockedAt: string | null;
  completedAt: string | null;
  answers: ItemResponse[];
  background: BackgroundAnswers;
  cumulativeActiveMs: number;
}

export function emptyBackground(): BackgroundAnswers {
  return { b1: null, b2: [], b3: null, b4: null };
}

export function emptyAnswers(): ItemResponse[] {
  return ITEMS.map(() => ({
    choice: null,
    confidence: null,
    lookup: null,
    sourceNote: "",
    activeMs: 0,
  }));
}

export function choiceLabel(choice: Choice | null): string {
  if (choice === "accurate") return "正确";
  if (choice === "inaccurate") return "有误";
  if (choice === "unsure") return "无法判断";
  return "尚未作答";
}

export function leaveItemError(answer: ItemResponse): string | null {
  if (answer.choice === "accurate" || answer.choice === "inaccurate") {
    if (answer.confidence == null) {
      return "选择「正确」或「有误」后，请填写 1 到 5 的判断信心。";
    }
  }
  return null;
}

export function reviewProblems(draft: Draft): string[] {
  const problems: string[] = [];
  draft.answers.forEach((answer, index) => {
    if (!answer.choice) {
      problems.push(`第 ${index + 1} 题还没有选择。`);
      return;
    }
    const confidenceError = leaveItemError(answer);
    if (confidenceError) {
      problems.push(`第 ${index + 1} 题还没有填写判断信心。`);
    }
  });
  return problems;
}

export function isItemComplete(answer: ItemResponse): boolean {
  return Boolean(answer.choice) && leaveItemError(answer) == null;
}

function clampIndex(index: number): number {
  return Math.min(ITEMS.length - 1, Math.max(0, index));
}

export function applyChoice(draft: Draft, index: number, choice: Choice): Draft {
  if (draft.lockedAt) return draft;
  const safeIndex = clampIndex(index);
  const answers = draft.answers.map((answer, i) => {
    if (i !== safeIndex) return answer;
    return {
      ...answer,
      choice,
      confidence: choice === "unsure" ? null : answer.confidence,
    };
  });
  return { ...draft, answers };
}

export function applyConfidence(draft: Draft, index: number, confidence: number): Draft {
  if (draft.lockedAt) return draft;
  if (!Number.isInteger(confidence) || confidence < 1 || confidence > 5) return draft;
  const safeIndex = clampIndex(index);
  const current = draft.answers[safeIndex];
  if (current.choice !== "accurate" && current.choice !== "inaccurate") return draft;
  const answers = draft.answers.map((answer, i) =>
    i === safeIndex ? { ...answer, confidence } : answer,
  );
  return { ...draft, answers };
}

export function moveQuestion(draft: Draft, index: number): Draft {
  if (draft.lockedAt) return draft;
  return { ...draft, phase: "questions", questionIndex: clampIndex(index) };
}

export function lockDraft(draft: Draft, at: string): Draft {
  if (reviewProblems(draft).length > 0) return draft;
  return { ...draft, phase: "retrospective", lockedAt: draft.lockedAt ?? at };
}

export function clearRetrospective(draft: Draft): Draft {
  return {
    ...draft,
    background: emptyBackground(),
    answers: draft.answers.map((answer) => ({ ...answer, lookup: null, sourceNote: "" })),
  };
}

export function finishDebrief(draft: Draft, at: string): Draft {
  return {
    ...draft,
    phase: "debrief",
    lockedAt: draft.lockedAt ?? at,
    completedAt: draft.completedAt ?? at,
  };
}

export function skipRetrospective(draft: Draft, at: string): Draft {
  return finishDebrief(clearRetrospective(draft), at);
}

export function normalizeB2(values: string[]): string[] {
  const unique = new Set(values);
  if (unique.has("不愿作答")) return ["不愿作答"];
  return B2_OPTIONS.filter((option) => unique.has(option) && option !== "不愿作答");
}

export function toggleB2(current: string[], value: string): string[] {
  if (value === "不愿作答") {
    return current.length === 1 && current[0] === "不愿作答" ? [] : ["不愿作答"];
  }
  const withoutDecline = current.filter((item) => item !== "不愿作答");
  const next = withoutDecline.includes(value)
    ? withoutDecline.filter((item) => item !== value)
    : [...withoutDecline, value];
  return normalizeB2(next);
}

export function setLookup(draft: Draft, index: number, lookup: Lookup): Draft {
  if (!draft.lockedAt || draft.phase === "debrief") return draft;
  const answers = draft.answers.map((answer, i) => {
    if (i !== index) return answer;
    return {
      ...answer,
      lookup,
      sourceNote: lookup === "yes" ? answer.sourceNote : "",
    };
  });
  return { ...draft, answers };
}

export function setSourceNote(draft: Draft, index: number, sourceNote: string): Draft {
  if (!draft.lockedAt || draft.phase === "debrief") return draft;
  const current = draft.answers[index];
  if (!current || current.lookup !== "yes") return draft;
  const answers = draft.answers.map((answer, i) =>
    i === index ? { ...answer, sourceNote: sourceNote.slice(0, 80) } : answer,
  );
  return { ...draft, answers };
}

export function looksLikePersonalContact(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) return true;
  if (/(?:\+?\d[\d\s\-()]{7,}\d)/.test(value)) return true;
  return false;
}

export function retrospectiveContactError(draft: Draft): string | null {
  const hit = draft.answers.find((answer) => looksLikePersonalContact(answer.sourceNote));
  if (!hit) return null;
  return "来源备注里像是电话或邮箱。请删掉个人信息；不需要填写账号或截图。";
}

export function addActiveTime(draft: Draft, deltaMs: number): Draft {
  if (deltaMs <= 0 || documentHiddenSafe()) return draft;
  const whole = Math.round(deltaMs);
  const answers = draft.answers.map((answer, index) => {
    if (draft.phase === "questions" && index === draft.questionIndex) {
      return { ...answer, activeMs: answer.activeMs + whole };
    }
    return answer;
  });
  return { ...draft, answers, cumulativeActiveMs: draft.cumulativeActiveMs + whole };
}

function documentHiddenSafe(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}
