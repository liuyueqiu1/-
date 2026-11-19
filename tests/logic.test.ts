import assert from "node:assert/strict";
import test from "node:test";
import { FORMULA_INJECTION_NOTE, escapeCsvCell } from "../lib/csv.ts";
import { createDraft, parseDraft } from "../lib/draft.ts";
import { exportCsv, exportJson } from "../lib/export.ts";
import { ITEMS, PROMPT_A, PROMPT_B, PROMPT_C, groupPrompt } from "../lib/instrument.ts";
import {
  applyChoice,
  applyConfidence,
  lockDraft,
  reviewProblems,
  skipRetrospective,
  toggleB2,
} from "../lib/model.ts";
import { scoreAnswers } from "../lib/scoring.ts";
import { formatShanghaiISO } from "../lib/time.ts";

const STEMS = [
  "在现行国际单位制中，米这一长度单位是通过把真空中的光速的数值固定为299792458（单位为米每秒）来定义的。",
  "在诺贝尔奖官方公布的授奖理由中，阿尔伯特·爱因斯坦获得诺贝尔物理学奖，是因为他提出了相对论。",
  "根据公开的任务记录，美国国家航空航天局实施的阿波罗11号载人登月任务，其登月舱于1969年7月20日（协调世界时，UTC；对应北京时间7月21日）在月球表面着陆。",
  "原子序数为118的元素，目前由国际纯粹与应用化学联合会公布的正式名称是ununoctium。",
  "罗塞塔石碑收藏于英国伦敦的大英博物馆。",
  "秦始皇兵马俑的发现始于1974年。",
  "第一届现代夏季奥林匹克运动会于1896年在法国巴黎举行。",
  "2012年7月4日，欧洲核子研究中心的ATLAS和CMS实验组宣布，观测到一种与长期寻找的希格斯玻色子相符的新粒子。",
  "位于甘肃的敦煌莫高窟藏经洞，是在1920年被发现的。",
  "用于天文观测的哈勃空间望远镜，由美国国家航空航天局于1981年通过航天飞机送入太空。",
  "1957年10月4日，苏联成功发射了人造地球卫星斯普特尼克1号（Sputnik 1）。",
  "当前千克的官方定义，仍然取决于保存在法国的国际千克原器的质量。",
];

test("dataset keeps the authoritative v0.2 stems, order, and six true/six false keys", () => {
  assert.equal(ITEMS.length, 12);
  assert.deepEqual(
    ITEMS.map((item) => item.truth),
    [true, false, true, false, true, true, false, true, false, false, true, false],
  );
  assert.deepEqual(
    ITEMS.map((item) => item.statement),
    STEMS,
  );
  assert.equal(ITEMS.filter((item) => item.truth).length, 6);
  assert.equal(ITEMS[3].statement.includes("ununoctium"), true);
  assert.equal(ITEMS[3].statement.includes("oganesson"), false);
  assert.equal(ITEMS[7].statement.includes("相符"), true);
  assert.equal(ITEMS[5].statement, "秦始皇兵马俑的发现始于1974年。");
});

test("group prompts share one baseline and do not hint at inserted errors", () => {
  assert.equal(groupPrompt("A"), PROMPT_A);
  assert.equal(groupPrompt("B"), PROMPT_B);
  assert.equal(groupPrompt("C"), PROMPT_C);
  assert.equal(PROMPT_B.startsWith(PROMPT_A), true);
  assert.equal(PROMPT_C.startsWith(PROMPT_B), true);
  assert.equal(PROMPT_A.includes("不能"), false);
  assert.equal(PROMPT_A.includes("检索"), false);
  assert.equal(PROMPT_C.includes("姓名"), false);
});

test("scoring separates acceptance, detection, and unsure", () => {
  const perfect = ITEMS.map((item) => ({ choice: item.truth ? "accurate" as const : "inaccurate" as const }));
  const perfectScore = scoreAnswers(perfect);
  assert.equal(perfectScore.totalCorrect, 12);
  assert.equal(perfectScore.trueAcceptance, 6);
  assert.equal(perfectScore.falseDetection, 6);
  assert.equal(perfectScore.unsureCount, 0);

  const reversed = ITEMS.map((item) => ({ choice: item.truth ? "inaccurate" as const : "accurate" as const }));
  const reversedScore = scoreAnswers(reversed);
  assert.equal(reversedScore.totalCorrect, 0);
  assert.equal(reversedScore.trueAcceptance, 0);
  assert.equal(reversedScore.falseDetection, 0);

  const unsure = ITEMS.map(() => ({ choice: "unsure" as const }));
  const unsureScore = scoreAnswers(unsure);
  assert.equal(unsureScore.totalCorrect, 0);
  assert.equal(unsureScore.unsureCount, 12);
  assert.equal(unsureScore.unsureRate, 1);

  const withBackgroundMissing = scoreAnswers(perfect);
  assert.deepEqual(withBackgroundMissing, perfectScore);
});

test("unsure clears confidence and lock blocks edits", () => {
  let draft = createDraft("A", new Date("2026-11-16T00:00:00Z"));
  draft = applyChoice(draft, 0, "accurate");
  draft = applyConfidence(draft, 0, 4);
  draft = applyChoice(draft, 0, "unsure");
  assert.equal(draft.answers[0].confidence, null);
  draft = applyChoice(draft, 0, "accurate");
  assert.equal(draft.answers[0].confidence, null);
  for (let index = 0; index < ITEMS.length; index += 1) {
    draft = applyChoice(draft, index, "unsure");
  }
  assert.equal(reviewProblems(draft).length, 0);
  const locked = lockDraft(draft, "2026-11-16T08:00:00+08:00");
  assert.equal(locked.phase, "retrospective");
  const edited = applyChoice(locked, 0, "accurate");
  assert.equal(edited.answers[0].choice, "unsure");
  const skipped = skipRetrospective(locked, "2026-11-16T08:05:00+08:00");
  assert.equal(skipped.phase, "debrief");
  assert.equal(skipped.background.b1, null);
  assert.equal(scoreAnswers(skipped.answers).totalCorrect, 0);
  assert.equal(scoreAnswers(skipped.answers).unsureCount, 12);
});

test("background multiselect treats 不愿作答 as exclusive and missingness is not a score", () => {
  assert.deepEqual(toggleB2(["作业或学习答疑"], "不愿作答"), ["不愿作答"]);
  assert.deepEqual(toggleB2(["不愿作答"], "翻译或润色文字"), ["翻译或润色文字"]);
  let draft = createDraft("B");
  for (let index = 0; index < ITEMS.length; index += 1) {
    const truth = ITEMS[index].truth;
    draft = applyChoice(draft, index, truth ? "accurate" : "inaccurate");
    draft = applyConfidence(draft, index, 3);
  }
  const bare = scoreAnswers(draft.answers).totalCorrect;
  draft = {
    ...draft,
    background: { b1: null, b2: [], b3: "不愿作答", b4: null },
  };
  assert.equal(scoreAnswers(draft.answers).totalCorrect, bare);
});

test("csv escapes formula injection and json keeps material version", () => {
  let draft = createDraft("C", new Date("2026-11-16T02:00:00Z"));
  draft = applyChoice(draft, 0, "unsure");
  draft = lockDraft({ ...draft, answers: draft.answers.map((answer) => ({ ...answer, choice: "unsure" })) }, "2026-11-16T10:00:00+08:00");
  draft = {
    ...draft,
    phase: "debrief",
    completedAt: "2026-11-16T10:05:00+08:00",
    answers: draft.answers.map((answer, index) =>
      index === 0 ? { ...answer, lookup: "yes", sourceNote: "=1+1" } : answer,
    ),
  };
  const csv = exportCsv(draft);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /'=1\+1/);
  assert.match(csv, /formula_injection_note/);
  assert.equal(escapeCsvCell("=cmd|'/c calc"), "'=cmd|'/c calc");
  const parsed = JSON.parse(exportJson(draft));
  assert.equal(parsed.materialVersion, "v0.2");
  assert.equal(parsed.schemaVersion, "1.0.0");
  assert.equal(parsed.uploadStatus, "not_uploaded");
  assert.equal(parsed.group, "C");
  assert.equal(parsed.timezone, "Asia/Shanghai");
  assert.equal(parsed.items[0].sourceNote, "=1+1");
  assert.equal(parsed.background.affectsScore, false);
  assert.match(FORMULA_INJECTION_NOTE, /前导单引号/);
});

test("shanghai timestamp uses +08:00 and locked drafts survive parsing", () => {
  assert.equal(formatShanghaiISO(new Date("2026-11-16T00:30:00Z")), "2026-11-16T08:30:00+08:00");
  let draft = createDraft("A", new Date("2026-11-16T00:00:00Z"));
  draft = {
    ...draft,
    answers: draft.answers.map((answer) => ({ ...answer, choice: "unsure" })),
  };
  draft = lockDraft(draft, "2026-11-16T08:00:00+08:00");
  const restored = parseDraft(JSON.stringify({ ...draft, phase: "questions" }));
  assert.equal(restored?.phase, "retrospective");
  assert.equal(restored?.group, "A");
  assert.equal(restored?.lockedAt, "2026-11-16T08:00:00+08:00");
});
