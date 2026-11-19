import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createDraft } from "../lib/draft";
import { ITEMS, PROMPT_A, PROMPT_B, PROMPT_C, STORAGE_KEY } from "../lib/instrument";

const ARTIFACTS = "/opt/cursor/artifacts";

async function accept(page: Page) {
  await page.goto("/");
  await page.getByTestId("consent-adult").check();
  await page.getByTestId("consent-voluntary").check();
  await page.getByTestId("start").click();
  await expect(page.getByTestId("item-statement")).toBeVisible();
}

async function answerCurrent(page: Page, choice: "正确" | "有误" | "无法判断", confidence?: number) {
  const testId = choice === "正确" ? "choice-accurate" : choice === "有误" ? "choice-inaccurate" : "choice-unsure";
  await page.getByTestId(testId).getByRole("radio").check();
  if (confidence) await page.getByTestId(`confidence-${confidence}`).getByRole("radio").check();
}

async function answerAll(page: Page, chooser: (index: number) => { choice: "正确" | "有误" | "无法判断"; confidence?: number }) {
  for (let index = 0; index < 12; index += 1) {
    const next = chooser(index);
    await answerCurrent(page, next.choice, next.confidence);
    if (index < 11) await page.getByRole("button", { name: "下一题" }).click();
    else await page.getByRole("button", { name: "进入复核" }).click();
  }
}

test("decline does not assign a group or store a draft", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "暂不参加" }).click();
  await expect(page.getByRole("heading", { name: "这次没有开始" })).toBeVisible();
  await expect(page.getByText("没有分配分组")).toBeVisible();
  const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  expect(stored).toBeNull();
});

test("starting without consent shows an inline error", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start").click();
  await expect(page.locator(".error")).toContainText("18");
  await expect(page.getByTestId("item-statement")).toHaveCount(0);
});

test("group is assigned once and survives reload and back navigation", async ({ page }) => {
  await accept(page);
  await answerCurrent(page, "正确", 2);
  const before = JSON.parse(await page.evaluate((key) => localStorage.getItem(key) || "", STORAGE_KEY));
  await page.getByRole("button", { name: "下一题" }).click();
  await answerCurrent(page, "无法判断");
  await page.getByRole("button", { name: "上一题" }).click();
  await expect(page.getByTestId("choice-accurate").getByRole("radio")).toBeChecked();
  await expect(page.getByTestId("confidence-2").getByRole("radio")).toBeChecked();
  await page.reload();
  const after = JSON.parse(await page.evaluate((key) => localStorage.getItem(key) || "", STORAGE_KEY));
  expect(after.group).toBe(before.group);
  expect(after.attemptId).toBe(before.attemptId);
  await expect(page.getByTestId("group-chip")).toContainText(before.group);
  await expect(page.getByTestId("choice-accurate").getByRole("radio")).toBeChecked();
});

test("prompts stay singular and search permission is shared", async ({ browser }) => {
  const prompts = { A: PROMPT_A, B: PROMPT_B, C: PROMPT_C } as const;
  for (const group of ["A", "B", "C"] as const) {
    const context = await browser.newContext({ locale: "zh-CN" });
    const page = await context.newPage();
    const draft = createDraft(group);
    await page.addInitScript(
      (payload) => localStorage.setItem(payload.key, payload.value),
      { key: STORAGE_KEY, value: JSON.stringify(draft) },
    );
    await page.goto("http://127.0.0.1:4179/");
    await expect(page.getByTestId("group-prompt")).toHaveText(prompts[group]);
    await expect(page.getByTestId("common-instructions")).toContainText("所有体验者均可使用公开网页检索");
    if (group !== "C") await expect(page.getByTestId("group-prompt")).not.toContainText("建议先明确待核对的事实");
    if (group === "A") await expect(page.getByTestId("group-prompt")).not.toContainText("可能不准确");
    await context.close();
  }
});

test("unsure clears confidence and unanswered review cannot lock", async ({ page }) => {
  await accept(page);
  await answerCurrent(page, "正确", 4);
  await answerCurrent(page, "无法判断");
  await expect(page.getByTestId("confidence-4").getByRole("radio")).not.toBeChecked();
  const stored = JSON.parse(await page.evaluate((key) => localStorage.getItem(key) || "", STORAGE_KEY));
  expect(stored.answers[0].choice).toBe("unsure");
  expect(stored.answers[0].confidence).toBeNull();
  await page.getByRole("button", { name: "下一题" }).click();
  await page.getByRole("button", { name: "上一题" }).click();
  await expect(page.getByTestId("choice-unsure").getByRole("radio")).toBeChecked();
  await answerCurrent(page, "正确");
  await expect(page.getByTestId("confidence-4").getByRole("radio")).not.toBeChecked();
  await page.getByRole("button", { name: "下一题" }).click();
  await expect(page.locator(".error")).toContainText("判断信心");
  await answerCurrent(page, "无法判断");
  for (let step = 0; step < 11; step += 1) {
    await page.getByRole("button", { name: "下一题" }).click();
  }
  await page.getByRole("button", { name: "进入复核" }).click();
  await page.getByRole("button", { name: "锁定作答" }).click();
  await expect(page.locator(".error")).toContainText("还没有选择");
  await expect(page.getByRole("heading", { name: "锁定这次判断？" })).toHaveCount(0);
});

test("all twelve can finish, skip retrospective, and score the key", async ({ page }) => {
  await accept(page);
  await answerAll(page, (index) => ({
    choice: ITEMS[index].truth ? "正确" : "有误",
    confidence: 5,
  }));
  await page.getByRole("button", { name: "锁定作答" }).click();
  await page.getByRole("button", { name: "确认锁定" }).click();
  await expect(page.getByRole("heading", { name: "可选回顾" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "可选回顾" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "正确" })).toHaveCount(0);
  await page.getByRole("button", { name: "跳过回顾，查看说明" }).click();
  await expect(page.getByRole("heading", { name: "本机作答已完成，未上传至研究数据库" })).toBeVisible();
  await expect(page.getByTestId("score-total")).toHaveText("12/12");
  await expect(page.getByTestId("score-accept")).toHaveText("6/6");
  await expect(page.getByTestId("score-detect")).toHaveText("6/6");
  await expect(page.getByTestId("score-unsure")).toHaveText("0/12");
  await expect(page.getByText("光电效应")).toBeVisible();
  await expect(page.getByText("oganesson")).toBeVisible();
  const hrefs = await page.locator("a.link").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  expect(hrefs).toEqual(ITEMS.map((item) => item.sourceUrl));
});

test("reversed judgments do not swap acceptance and detection", async ({ page }) => {
  await accept(page);
  await answerAll(page, (index) => ({
    choice: ITEMS[index].truth ? "有误" : "正确",
    confidence: 1,
  }));
  await page.getByRole("button", { name: "锁定作答" }).click();
  await page.getByRole("button", { name: "确认锁定" }).click();
  await page.getByRole("button", { name: "跳过回顾，查看说明" }).click();
  await expect(page.getByTestId("score-total")).toHaveText("0/12");
  await expect(page.getByTestId("score-accept")).toHaveText("0/6");
  await expect(page.getByTestId("score-detect")).toHaveText("0/6");
});

test("exports json and csv, then clear removes only the local draft", async ({ page }) => {
  await accept(page);
  await answerAll(page, () => ({ choice: "无法判断" }));
  await page.getByRole("button", { name: "锁定作答" }).click();
  await page.getByRole("button", { name: "确认锁定" }).click();
  await page.getByTestId("lookup-0-yes").getByRole("radio").check();
  await page.getByTestId("source-note-0").fill("=1+1");
  await page.getByRole("button", { name: "完成回顾，查看说明" }).click();
  await expect(page.getByTestId("score-unsure")).toHaveText("12/12");
  await expect(page.getByTestId("score-total")).toHaveText("0/12");

  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON" }).click();
  const jsonFile = await jsonDownload;
  const jsonText = fs.readFileSync((await jsonFile.path()) ?? "", "utf8");
  const payload = JSON.parse(jsonText);
  expect(payload.materialVersion).toBe("v0.2");
  expect(payload.uploadStatus).toBe("not_uploaded");
  expect(payload.metrics.unsureCount).toBe(12);
  expect(payload.background.b1).toBe("skip");
  expect(payload.background.affectsScore).toBe(false);
  expect(payload.items[0].sourceNote).toBe("=1+1");
  expect(payload.items[0].scoredCorrect).toBe(false);

  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 CSV" }).click();
  const csvFile = await csvDownload;
  const csv = fs.readFileSync((await csvFile.path()) ?? "", "utf8");
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain("'=1+1");

  await page.getByRole("button", { name: "清除本机草稿" }).click();
  await page.getByRole("button", { name: "确认清除" }).click();
  await expect(page.getByRole("heading", { name: "判断短文本里的关键事实" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "判断短文本里的关键事实" })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
});

test("mobile and desktop screenshots", async ({ page }) => {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.screenshot({ path: `${ARTIFACTS}/landing-desktop.png`, fullPage: true });
  await page.getByTestId("consent-adult").check();
  await page.getByTestId("consent-voluntary").check();
  await page.getByTestId("start").click();
  await page.screenshot({ path: `${ARTIFACTS}/question-desktop.png`, fullPage: true });

  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.screenshot({ path: `${ARTIFACTS}/landing-mobile.png`, fullPage: true });
  const startBox = await page.getByTestId("start").boundingBox();
  expect(startBox && startBox.height).toBeGreaterThanOrEqual(44);
  await page.getByTestId("consent-adult").check();
  await page.getByTestId("consent-voluntary").check();
  await page.getByTestId("start").click();
  const choiceBox = await page.getByTestId("choice-accurate").boundingBox();
  expect(choiceBox && choiceBox.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `${ARTIFACTS}/question-mobile.png`, fullPage: true });
  await answerAll(page, () => ({ choice: "无法判断" }));
  await page.getByRole("button", { name: "锁定作答" }).click();
  await page.getByRole("button", { name: "确认锁定" }).click();
  await page.getByRole("button", { name: "跳过回顾，查看说明" }).click();
  await page.screenshot({ path: `${ARTIFACTS}/debrief-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: `${ARTIFACTS}/debrief-desktop.png`, fullPage: true });
});
