import { ITEMS, type GroupId, MATERIAL_VERSION, SCHEMA_VERSION, STORAGE_KEY } from "./instrument";
import { emptyAnswers, emptyBackground, type Draft, type Phase } from "./model";
import { formatShanghaiISO } from "./time";

export function rollGroup(): GroupId {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (["A", "B", "C"] as const)[buf[0] % 3];
}

export function createAttemptId(): string {
  return crypto.randomUUID();
}

export function createDraft(group: GroupId, now = new Date()): Draft {
  const stamp = formatShanghaiISO(now);
  return {
    schemaVersion: SCHEMA_VERSION,
    materialVersion: MATERIAL_VERSION,
    attemptId: createAttemptId(),
    group,
    phase: "questions",
    questionIndex: 0,
    consentAt: stamp,
    startedAt: stamp,
    lockedAt: null,
    completedAt: null,
    answers: emptyAnswers(),
    background: emptyBackground(),
    cumulativeActiveMs: 0,
  };
}

function isPhase(value: unknown): value is Phase {
  return value === "questions" || value === "review" || value === "retrospective" || value === "debrief";
}

export function parseDraft(raw: string): Draft | null {
  try {
    const data = JSON.parse(raw) as Partial<Draft>;
    if (data.schemaVersion !== SCHEMA_VERSION || data.materialVersion !== MATERIAL_VERSION) return null;
    if (data.group !== "A" && data.group !== "B" && data.group !== "C") return null;
    if (!isPhase(data.phase)) return null;
    if (!Array.isArray(data.answers) || data.answers.length !== ITEMS.length) return null;
    if (typeof data.attemptId !== "string" || data.attemptId.length < 8) return null;
    const answers = data.answers.map((answer) => ({
      choice: answer.choice === "accurate" || answer.choice === "inaccurate" || answer.choice === "unsure" ? answer.choice : null,
      confidence: typeof answer.confidence === "number" ? answer.confidence : null,
      lookup: answer.lookup === "yes" || answer.lookup === "no" || answer.lookup === "decline" ? answer.lookup : null,
      sourceNote: typeof answer.sourceNote === "string" ? answer.sourceNote.slice(0, 80) : "",
      activeMs: typeof answer.activeMs === "number" ? answer.activeMs : 0,
    }));
    const draft: Draft = {
      schemaVersion: SCHEMA_VERSION,
      materialVersion: MATERIAL_VERSION,
      attemptId: data.attemptId,
      group: data.group,
      phase: data.phase,
      questionIndex: Math.min(ITEMS.length - 1, Math.max(0, Number(data.questionIndex) || 0)),
      consentAt: String(data.consentAt ?? ""),
      startedAt: String(data.startedAt ?? ""),
      lockedAt: data.lockedAt ? String(data.lockedAt) : null,
      completedAt: data.completedAt ? String(data.completedAt) : null,
      answers,
      background: {
        b1: data.background?.b1 ?? null,
        b2: Array.isArray(data.background?.b2) ? data.background.b2.map(String) : [],
        b3: data.background?.b3 ?? null,
        b4: data.background?.b4 ?? null,
      },
      cumulativeActiveMs: typeof data.cumulativeActiveMs === "number" ? data.cumulativeActiveMs : 0,
    };
    if (draft.lockedAt && (draft.phase === "questions" || draft.phase === "review")) {
      draft.phase = "retrospective";
    }
    answers.forEach((answer) => {
      if (answer.choice === "unsure") answer.confidence = null;
    });
    return draft;
  } catch {
    return null;
  }
}

export function loadDraft(): Draft | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return parseDraft(raw);
}

export function saveDraft(draft: Draft): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function clearStoredDraft(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
