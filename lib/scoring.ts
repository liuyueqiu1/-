import { ITEMS } from "./instrument";
import type { Choice, ItemResponse } from "./model";

export interface ScoreSummary {
  totalCorrect: number;
  totalItems: number;
  trueAcceptance: number;
  trueCount: number;
  falseDetection: number;
  falseCount: number;
  unsureCount: number;
  unsureRate: number;
  itemCorrect: boolean[];
}

export function itemIsCorrect(truth: boolean, choice: Choice | null): boolean {
  if (truth) return choice === "accurate";
  return choice === "inaccurate";
}

export function scoreAnswers(answers: Pick<ItemResponse, "choice">[]): ScoreSummary {
  let totalCorrect = 0;
  let trueAcceptance = 0;
  let trueCount = 0;
  let falseDetection = 0;
  let falseCount = 0;
  let unsureCount = 0;
  const itemCorrect = ITEMS.map((item, index) => {
    const choice = answers[index]?.choice ?? null;
    if (choice === "unsure") unsureCount += 1;
    const correct = itemIsCorrect(item.truth, choice);
    if (item.truth) {
      trueCount += 1;
      if (choice === "accurate") trueAcceptance += 1;
    } else {
      falseCount += 1;
      if (choice === "inaccurate") falseDetection += 1;
    }
    if (correct) totalCorrect += 1;
    return correct;
  });
  return {
    totalCorrect,
    totalItems: ITEMS.length,
    trueAcceptance,
    trueCount,
    falseDetection,
    falseCount,
    unsureCount,
    unsureRate: unsureCount / ITEMS.length,
    itemCorrect,
  };
}
