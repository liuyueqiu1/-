"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  B1_OPTIONS,
  B2_OPTIONS,
  B3_OPTIONS,
  B4_OPTIONS,
  COMMON_INSTRUCTIONS,
  GENERALIZATION_NOTE,
  INTRO_PARAGRAPH,
  ITEMS,
  MATERIAL_VERSION,
  RANDOMIZATION_NOTE,
  STORAGE_KEY,
  TIMING_CAVEAT,
  groupPrompt,
} from "@/lib/instrument";
import { clearStoredDraft, createDraft, loadDraft, rollGroup, saveDraft } from "@/lib/draft";
import { exportCsv, exportJson } from "@/lib/export";
import {
  addActiveTime,
  applyChoice,
  applyConfidence,
  choiceLabel,
  isItemComplete,
  leaveItemError,
  lockDraft,
  moveQuestion,
  retrospectiveContactError,
  reviewProblems,
  setLookup,
  setSourceNote,
  skipRetrospective,
  finishDebrief,
  toggleB2,
  type Choice,
  type Draft,
  type Lookup,
} from "@/lib/model";
import { scoreAnswers } from "@/lib/scoring";
import { formatShanghaiISO } from "@/lib/time";

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 16.5 13.2 20.7 23 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const RAIL = [
  ["questions", "判断"],
  ["review", "复核"],
  ["retrospective", "回顾"],
  ["debrief", "说明"],
] as const;

export function QuizApp() {
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [declined, setDeclined] = useState(false);
  const [adult, setAdult] = useState(false);
  const [voluntary, setVoluntary] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);
  const [reviewErrors, setReviewErrors] = useState<string[]>([]);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [confirmLock, setConfirmLock] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  useEffect(() => {
    try {
      const existing = loadDraft();
      if (existing) setDraft(existing);
      else if (window.localStorage.getItem(STORAGE_KEY)) {
        window.localStorage.removeItem(STORAGE_KEY);
        setStorageWarning("上一份本地草稿无法读取，已忽略。没有上传任何内容。");
      }
    } catch {
      setStorageWarning("浏览器没有允许读取本地草稿。这次仍可作答，但刷新后不会自动恢复。");
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !draft) return;
    try {
      saveDraft(draft);
    } catch {
      setStorageWarning("本机草稿暂时写不进去。当前页面还留着作答，但刷新后可能丢失。没有上传。");
    }
  }, [draft, ready]);

  useEffect(() => {
    if (!draft) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      setDraft((current) => (current ? addActiveTime(current, delta) : current));
    }, 1000);
    return () => window.clearInterval(id);
    // Restart only when the attempt, phase, or question changes. Depending on the whole draft would reset the clock every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.attemptId, draft?.phase, draft?.questionIndex]);

  useEffect(() => {
    if (!draft && !declined) return;
    headingRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.phase, draft?.questionIndex, declined]);

  function clearLocal() {
    try {
      clearStoredDraft();
    } catch {
      /* The in-memory attempt is still discarded below. */
    }
    setDraft(null);
    setDeclined(false);
    setAdult(false);
    setVoluntary(false);
    setItemError(null);
    setReviewErrors([]);
    setNoteError(null);
    setConfirmClear(false);
    setConfirmLock(false);
  }

  function start() {
    if (!adult || !voluntary) {
      setConsentError("请先确认已满 18 周岁，并且自愿开始。");
      return;
    }
    setConsentError(null);
    setDeclined(false);
    setDraft(createDraft(rollGroup()));
  }

  if (!ready) {
    return (
      <Shell>
        <p>正在读取本机草稿…</p>
      </Shell>
    );
  }

  if (!draft && declined) {
    return (
      <Shell>
        <section className="card rise" aria-labelledby={titleId}>
          <p className="eyebrow">已退出</p>
          <h1 id={titleId} ref={headingRef} tabIndex={-1}>
            这次没有开始
          </h1>
          <p>这次没有开始作答，没有分配分组，也没有写入本地草稿。你不需要联系研究者来撤回，因为还没有记录。</p>
          <div className="actions">
            <button className="btn primary" type="button" onClick={() => setDeclined(false)}>
              返回说明
            </button>
          </div>
        </section>
      </Shell>
    );
  }

  if (!draft) {
    return (
      <Shell storageWarning={storageWarning}>
        <Landing
          adult={adult}
          voluntary={voluntary}
          error={consentError}
          onAdult={setAdult}
          onVoluntary={setVoluntary}
          onStart={start}
          onDecline={() => {
            setConsentError(null);
            setDeclined(true);
          }}
          headingRef={headingRef}
        />
      </Shell>
    );
  }

  const now = () => formatShanghaiISO(new Date());

  return (
    <Shell
      storageWarning={storageWarning}
      onClear={() => setConfirmClear(true)}
      phase={draft.phase}
    >
      {draft.phase === "questions" && (
        <QuestionScreen
          draft={draft}
          error={itemError}
          headingRef={headingRef}
          onChoice={(choice) => {
            setItemError(null);
            setDraft(applyChoice(draft, draft.questionIndex, choice));
          }}
          onConfidence={(value) => setDraft(applyConfidence(draft, draft.questionIndex, value))}
          onPrev={() => {
            const error = leaveItemError(draft.answers[draft.questionIndex]);
            if (error) {
              setItemError(error);
              return;
            }
            setItemError(null);
            setDraft(moveQuestion(draft, draft.questionIndex - 1));
          }}
          onNext={() => {
            const error = leaveItemError(draft.answers[draft.questionIndex]);
            if (error) {
              setItemError(error);
              return;
            }
            setItemError(null);
            if (draft.questionIndex === ITEMS.length - 1) setDraft({ ...draft, phase: "review" });
            else setDraft(moveQuestion(draft, draft.questionIndex + 1));
          }}
        />
      )}
      {draft.phase === "review" && (
        <ReviewScreen
          draft={draft}
          errors={reviewErrors}
          headingRef={headingRef}
          onJump={(index) => {
            setReviewErrors([]);
            setDraft(moveQuestion(draft, index));
          }}
          onLock={() => {
            const problems = reviewProblems(draft);
            setReviewErrors(problems);
            if (problems.length === 0) setConfirmLock(true);
          }}
        />
      )}
      {draft.phase === "retrospective" && (
        <RetrospectiveScreen
          draft={draft}
          noteError={noteError}
          headingRef={headingRef}
          onBackground={(background) => setDraft({ ...draft, background })}
          onLookup={(index, lookup) => setDraft(setLookup(draft, index, lookup))}
          onNote={(index, note) => {
            setNoteError(null);
            setDraft(setSourceNote(draft, index, note));
          }}
          onSkip={() => setDraft(skipRetrospective(draft, now()))}
          onContinue={() => {
            const contact = retrospectiveContactError(draft);
            if (contact) {
              setNoteError(contact);
              return;
            }
            setDraft(finishDebrief(draft, now()));
          }}
        />
      )}
      {draft.phase === "debrief" && (
        <DebriefScreen
          draft={draft}
          headingRef={headingRef}
          onJson={() => download(`factcheck-v0.2-${draft.attemptId}.json`, exportJson(draft), "application/json;charset=utf-8")}
          onCsv={() => download(`factcheck-v0.2-${draft.attemptId}.csv`, exportCsv(draft), "text/csv;charset=utf-8")}
          onClear={() => setConfirmClear(true)}
        />
      )}
      <ConfirmDialog
        open={confirmLock}
        title="锁定这次判断？"
        body="锁定后不能再修改十二条的判断和信心。接下来是可选回顾，回顾结束或跳过之后才会显示事实说明。"
        confirmLabel="确认锁定"
        onCancel={() => setConfirmLock(false)}
        onConfirm={() => {
          setConfirmLock(false);
          setDraft(lockDraft(draft, now()));
        }}
      />
      <ConfirmDialog
        open={confirmClear}
        title="清除本机草稿？"
        body="这会删除这台浏览器里的本次草稿。已经下载的文件不会被删除，本页也不能远程撤回那些文件。这里没有研究者可供联系。清除后可以重新开始，分组会重新抽取。"
        confirmLabel="确认清除"
        onCancel={() => setConfirmClear(false)}
        onConfirm={clearLocal}
      />
    </Shell>
  );
}

function Shell({
  children,
  storageWarning,
  onClear,
  phase,
}: {
  children: React.ReactNode;
  storageWarning?: string | null;
  onClear?: () => void;
  phase?: Draft["phase"];
}) {
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <header className="topbar">
        <div className="brand">
          <Mark />
          <div>
            <span className="brand-name">事实判断体验</span>
            <span className="brand-sub">材料 {MATERIAL_VERSION} · 独立页面，不是学校官网</span>
          </div>
        </div>
        <span className="badge">预试体验版</span>
      </header>
      <main id="main" className="wrap">
        {phase && (
          <ol className="rail" aria-label="进度">
            {RAIL.map(([id, label]) => (
              <li key={id} aria-current={phase === id ? "step" : undefined}>
                {label}
              </li>
            ))}
          </ol>
        )}
        {storageWarning && (
          <p className="error" role="status">
            {storageWarning}
          </p>
        )}
        {children}
        {onClear && phase !== "debrief" && (
          <p className="footer-note">
            <button className="btn ghost" type="button" onClick={onClear}>
              清除本机草稿
            </button>
            同一台设备上的其他人可能看到未清除的草稿。清除只影响这台浏览器，不会上传或撤回已下载的文件。
          </p>
        )}
      </main>
    </div>
  );
}

function Landing({
  adult,
  voluntary,
  error,
  onAdult,
  onVoluntary,
  onStart,
  onDecline,
  headingRef,
}: {
  adult: boolean;
  voluntary: boolean;
  error: string | null;
  onAdult: (value: boolean) => void;
  onVoluntary: (value: boolean) => void;
  onStart: () => void;
  onDecline: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <div className="rise">
      <div className="hero">
        <p className="eyebrow">预试体验版，尚非正式研究招募</p>
        <h1 ref={headingRef} tabIndex={-1}>
          判断短文本里的关键事实
        </h1>
        <p className="lede">十二条相同顺序的短文本。开始后随机看到一种作答提示，刷新后保持不变。</p>
      </div>
      <div className="grid split">
        <section className="card stack">
          <h2>开始之前</h2>
          <p>{INTRO_PARAGRAPH}</p>
          <p>这些短文本由研究者编写或改编，不是未经整理的模型原始输出，也不用来判断文字是不是人工智能生成的。</p>
          <p>{GENERALIZATION_NOTE}</p>
          <p>若以后用于正式招募，需要补充研究者身份和联系方式、数据保存期限与退出办法，并完成学校要求的程序。本页没有这些内容，也不表示已经获得伦理审查通过。</p>
        </section>
        <section className="card">
          <h2>这次会经过</h2>
          <ol className="steps">
            <li>
              <span className="step-index">1</span>
              <span>确认自愿参加</span>
            </li>
            <li>
              <span className="step-index">2</span>
              <span>逐题判断，可前后返回</span>
            </li>
            <li>
              <span className="step-index">3</span>
              <span>复核后锁定，不能再改判断</span>
            </li>
            <li>
              <span className="step-index">4</span>
              <span>可选的事后回顾，可以全部跳过</span>
            </li>
            <li>
              <span className="step-index">5</span>
              <span>查看事实说明，并可在本机导出</span>
            </li>
          </ol>
        </section>
      </div>
      <section className="card" style={{ marginTop: 16 }}>
        <h2>数据实际怎么处理</h2>
        <p>同意后，分组、判断、信心和可选回顾保存在这台浏览器的本地存储，键名是 {STORAGE_KEY}。页面不会把作答发到研究数据库。</p>
        <p>导出只在你点击之后下载到本机，不会自动上传。清除草稿只删除这份本地记录；已经下载的文件仍留在你的设备上。</p>
        <p>如果经由网站服务器打开本页，服务器通常仍会留下普通访问日志，例如时间和网络地址。因此不能承诺绝对匿名，也不能说没有任何服务器记录。</p>
        <p>请不要输入姓名、学号、电话或邮箱。共用这台设备的人，可能看到还没清除的草稿。</p>
      </section>
      <section className="card" style={{ marginTop: 16 }} aria-labelledby="consent-title">
        <h2 id="consent-title">自愿确认</h2>
        <p className="muted">{COMMON_INSTRUCTIONS}</p>
        <label className="checkline">
          <input data-testid="consent-adult" type="checkbox" checked={adult} onChange={(event) => onAdult(event.target.checked)} />
          <span>我确认自己已满 18 周岁。</span>
        </label>
        <label className="checkline">
          <input data-testid="consent-voluntary" type="checkbox" checked={voluntary} onChange={(event) => onVoluntary(event.target.checked)} />
          <span>我自愿开始这次本机体验。我知道这不是正式研究招募，可以随时退出。</span>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button className="btn primary" type="button" data-testid="start" onClick={onStart}>
            同意并开始
          </button>
          <button className="btn" type="button" onClick={onDecline}>
            暂不参加
          </button>
        </div>
        <p className="muted">两项都勾选后才能开始。暂不参加不会分配分组。</p>
      </section>
    </div>
  );
}

function QuestionScreen({
  draft,
  error,
  headingRef,
  onChoice,
  onConfidence,
  onPrev,
  onNext,
}: {
  draft: Draft;
  error: string | null;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onChoice: (choice: Choice) => void;
  onConfidence: (value: number) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const item = ITEMS[draft.questionIndex];
  const answer = draft.answers[draft.questionIndex];
  const needsConfidence = answer.choice === "accurate" || answer.choice === "inaccurate";
  const done = draft.answers.filter(isItemComplete).length;
  return (
    <section className="card rise" aria-labelledby="q-title">
      <div className="progress-meta">
        <span>
          第 {draft.questionIndex + 1} 题，共 {ITEMS.length} 题
        </span>
        <span>已完成 {done}</span>
      </div>
      <div
        className="track"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={ITEMS.length}
        aria-valuenow={draft.questionIndex + 1}
        aria-valuetext={`第 ${draft.questionIndex + 1} 题，共 ${ITEMS.length} 题`}
      >
        <span style={{ width: `${((draft.questionIndex + 1) / ITEMS.length) * 100}%` }} />
      </div>
      <p className="muted" data-testid="group-chip" style={{ marginTop: 14 }}>
        分组 {draft.group}
      </p>
      <p className="prompt" data-testid="group-prompt">
        {groupPrompt(draft.group)}
      </p>
      <p className="muted" data-testid="common-instructions">
        {COMMON_INSTRUCTIONS}
      </p>
      <h1 id="q-title" ref={headingRef} tabIndex={-1}>
        第 {draft.questionIndex + 1} 题
      </h1>
      <p className="statement" data-testid="item-statement">
        {item.statement}
      </p>
      <fieldset style={{ border: 0, padding: 0, margin: "16px 0" }}>
        <legend className="muted">这条短文本的关键事实是？</legend>
        <div className="choices">
          <Choice name="choice" value="accurate" label="正确" checked={answer.choice === "accurate"} onChange={() => onChoice("accurate")} testId="choice-accurate" />
          <Choice name="choice" value="inaccurate" label="有误" checked={answer.choice === "inaccurate"} onChange={() => onChoice("inaccurate")} testId="choice-inaccurate" />
          <Choice name="choice" value="unsure" label="无法判断" checked={answer.choice === "unsure"} onChange={() => onChoice("unsure")} testId="choice-unsure" />
        </div>
      </fieldset>
      <fieldset style={{ border: 0, padding: 0 }} disabled={!needsConfidence}>
        <legend>判断信心{needsConfidence ? "" : "（选择「无法判断」或尚未选择时不填写）"}</legend>
        {answer.choice === "unsure" && <p className="muted">已选择「无法判断」，信心已清空。</p>}
        <div className="scale" role="radiogroup" aria-label="判断信心，1 为很不确定，5 为很确定">
          {[1, 2, 3, 4, 5].map((value) => (
            <Choice
              key={value}
              name={`confidence-${draft.questionIndex}`}
              value={String(value)}
              label={value === 1 ? "1 很不确定" : value === 5 ? "5 很确定" : String(value)}
              checked={answer.confidence === value}
              onChange={() => onConfidence(value)}
              testId={`confidence-${value}`}
            />
          ))}
        </div>
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions nav-actions">
        <button className="btn" type="button" onClick={onPrev} disabled={draft.questionIndex === 0}>
          上一题
        </button>
        <button className="btn primary" type="button" onClick={onNext}>
          {draft.questionIndex === ITEMS.length - 1 ? "进入复核" : "下一题"}
        </button>
      </div>
    </section>
  );
}

function Choice({
  name,
  value,
  label,
  checked,
  onChange,
  testId,
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
  onChange: () => void;
  testId: string;
}) {
  return (
    <label className="choice" data-checked={checked} data-testid={testId}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

function ReviewScreen({
  draft,
  errors,
  headingRef,
  onJump,
  onLock,
}: {
  draft: Draft;
  errors: string[];
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onJump: (index: number) => void;
  onLock: () => void;
}) {
  return (
    <section className="card rise">
      <p className="muted" data-testid="group-chip">
        分组 {draft.group}
      </p>
      <p className="prompt" data-testid="group-prompt">
        {groupPrompt(draft.group)}
      </p>
      <h1 ref={headingRef} tabIndex={-1}>
        复核后再锁定
      </h1>
      <p>十二条都需要作出选择。「无法判断」算已作答。选择「正确」或「有误」时还要有信心。这里还不显示对错。</p>
      <div className="review-list">
        {ITEMS.map((item, index) => {
          const answer = draft.answers[index];
          return (
            <div className="review-row" key={item.id}>
              <div>
                <strong>第 {index + 1} 题</strong>
                <div className="muted">
                  {choiceLabel(answer.choice)}
                  {answer.confidence ? ` · 信心 ${answer.confidence}` : ""}
                </div>
              </div>
              <button className="btn" type="button" onClick={() => onJump(index)}>
                修改此题
              </button>
            </div>
          );
        })}
      </div>
      {errors.length > 0 && (
        <div className="error" role="alert">
          {errors.map((problem) => (
            <p key={problem} style={{ margin: "4px 0" }}>
              {problem}
            </p>
          ))}
        </div>
      )}
      <div className="actions">
        <button className="btn primary" type="button" onClick={onLock}>
          锁定作答
        </button>
      </div>
    </section>
  );
}

function RetrospectiveScreen({
  draft,
  noteError,
  headingRef,
  onBackground,
  onLookup,
  onNote,
  onSkip,
  onContinue,
}: {
  draft: Draft;
  noteError: string | null;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onBackground: (background: Draft["background"]) => void;
  onLookup: (index: number, lookup: Lookup) => void;
  onNote: (index: number, note: string) => void;
  onSkip: () => void;
  onContinue: () => void;
}) {
  const background = draft.background;
  return (
    <section className="card rise stack">
      <h1 ref={headingRef} tabIndex={-1}>
        可选回顾
      </h1>
      <p>判断和信心已经锁定，不能返回修改。下面是事后回忆和自我报告，不是对查阅行为的客观记录。可以全部跳过。跳过或完成后才会显示事实说明。</p>
      <fieldset style={{ border: 0, padding: 0 }}>
        <legend>过去三个月里，你使用生成式人工智能工具的频率是？</legend>
        {B1_OPTIONS.map((option) => (
          <label className="checkline" key={option}>
            <input
              type="radio"
              name="b1"
              checked={background.b1 === option}
              onChange={() => onBackground({ ...background, b1: option })}
            />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
      <fieldset style={{ border: 0, padding: 0 }}>
        <legend>你主要用它做哪些事？可以多选。「不愿作答」不能和其他选项同时选。</legend>
        {B2_OPTIONS.map((option) => (
          <label className="checkline" key={option}>
            <input
              type="checkbox"
              name="b2"
              checked={background.b2.includes(option)}
              onChange={() => onBackground({ ...background, b2: toggleB2(background.b2, option) })}
            />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
      <fieldset style={{ border: 0, padding: 0 }}>
        <legend>平时看到人工智能给出的事实陈述，你再去查证的习惯是？</legend>
        {B3_OPTIONS.map((option) => (
          <label className="checkline" key={option}>
            <input
              type="radio"
              name="b3"
              checked={background.b3 === option}
              onChange={() => onBackground({ ...background, b3: option })}
            />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
      <fieldset style={{ border: 0, padding: 0 }}>
        <legend>你目前的年级是？</legend>
        {B4_OPTIONS.map((option) => (
          <label className="checkline" key={option}>
            <input
              type="radio"
              name="b4"
              checked={background.b4 === option}
              onChange={() => onBackground({ ...background, b4: option })}
            />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
      <div className="stack">
        <h2>逐题自陈</h2>
        <p className="muted">作答时是否查阅过公开网页？选「是」可以写一行来源类型或名称。请勿填写姓名、学号、电话、邮箱或账号。</p>
        {ITEMS.map((item, index) => {
          const answer = draft.answers[index];
          return (
            <div className="result" key={item.id}>
              <strong>第 {index + 1} 题</strong>
              <div className="choices" style={{ marginTop: 8 }}>
                {(
                  [
                    ["yes", "是"],
                    ["no", "否"],
                    ["decline", "不愿作答"],
                  ] as const
                ).map(([value, label]) => (
                  <Choice
                    key={value}
                    name={`lookup-${index}`}
                    value={value}
                    label={label}
                    checked={answer.lookup === value}
                    onChange={() => onLookup(index, value)}
                    testId={`lookup-${index}-${value}`}
                  />
                ))}
              </div>
              {answer.lookup === "yes" && (
                <label className="stack" style={{ marginTop: 8 }}>
                  <span>来源类型或名称（可选）</span>
                  <input
                    className="note-input"
                    data-testid={`source-note-${index}`}
                    maxLength={80}
                    value={answer.sourceNote}
                    onChange={(event) => onNote(index, event.target.value)}
                    placeholder="例如机构网站。不要写个人信息。"
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>
      {noteError && (
        <p className="error" role="alert">
          {noteError}
        </p>
      )}
      <div className="actions">
        <button className="btn" type="button" onClick={onSkip}>
          跳过回顾，查看说明
        </button>
        <button className="btn primary" type="button" onClick={onContinue}>
          完成回顾，查看说明
        </button>
      </div>
    </section>
  );
}

function DebriefScreen({
  draft,
  headingRef,
  onJson,
  onCsv,
  onClear,
}: {
  draft: Draft;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onJson: () => void;
  onCsv: () => void;
  onClear: () => void;
}) {
  const score = scoreAnswers(draft.answers);
  const percent = Math.round(score.unsureRate * 100);
  return (
    <div className="rise stack">
      <section className="card">
        <p className="eyebrow">本机体验</p>
        <h1 ref={headingRef} tabIndex={-1}>
          本机作答已完成，未上传至研究数据库
        </h1>
        <p data-testid="group-chip">本次分组 {draft.group}。尝试编号 {draft.attemptId}。</p>
        <p>{GENERALIZATION_NOTE}</p>
        <p>这些短文本由研究者编写或改编。分数只说明你对这十二条关键事实的判断，不说明智力，也不说明你在所有人工智能错误信息上的能力。</p>
        <div className="scores">
          <div className="score">
            <span>判断相符</span>
            <b data-testid="score-total">
              {score.totalCorrect}/{score.totalItems}
            </b>
          </div>
          <div className="score">
            <span>正确陈述接受</span>
            <b data-testid="score-accept">
              {score.trueAcceptance}/{score.trueCount}
            </b>
          </div>
          <div className="score">
            <span>错误陈述识别</span>
            <b data-testid="score-detect">
              {score.falseDetection}/{score.falseCount}
            </b>
          </div>
          <div className="score">
            <span>无法判断</span>
            <b data-testid="score-unsure">
              {score.unsureCount}/{score.totalItems}
            </b>
          </div>
        </div>
        <p className="muted">
          正确陈述接受，是把关键事实准确的陈述判为「正确」，共 {score.trueCount} 条。错误陈述识别，是把关键事实有误的陈述判为「有误」，共 {score.falseCount} 条。把一条准确陈述判成「有误」，不会算进错误陈述识别。无法判断占 {percent}%，单独列出，不计入上面两项。背景题有没有填，不影响这些数字。
        </p>
        <p className="muted">
          前台累计约 {Math.round(draft.cumulativeActiveMs / 1000)} 秒。{TIMING_CAVEAT}
        </p>
        <p className="muted">{RANDOMIZATION_NOTE}</p>
        <div className="actions">
          <button className="btn primary" type="button" onClick={onJson}>
            导出 JSON
          </button>
          <button className="btn" type="button" onClick={onCsv}>
            导出 CSV
          </button>
          <button className="btn" type="button" onClick={onClear}>
            清除本机草稿
          </button>
        </div>
        <p className="muted">导出由你点击触发，文件只下载到本机。清除草稿不会删除已经下载的文件。</p>
      </section>
      <div className="result-list">
        {ITEMS.map((item, index) => {
          const answer = draft.answers[index];
          const correct = score.itemCorrect[index];
          return (
            <article className="result" key={item.id} data-testid={`debrief-${item.id}`}>
              <p className="muted">
                {item.id} · 参照：关键事实{item.truth ? "准确" : "有误"}
              </p>
              <h2>{item.statement}</h2>
              <p>
                你的判断：{choiceLabel(answer.choice)}
                {answer.confidence ? `，信心 ${answer.confidence}` : ""}。本次{correct ? "相符" : "不相符"}。
              </p>
              <p>事实说明：{item.debrief}</p>
              <p>
                <a className="link" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {item.sourceUrl}
                </a>
              </p>
              <p className="muted">
                事后自陈查阅：
                {answer.lookup === "yes" ? "是" : answer.lookup === "no" ? "否" : answer.lookup === "decline" ? "不愿作答" : "未填"}
                {answer.sourceNote ? `。备注：${answer.sourceNote}` : ""}
                。这不是客观记录。
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      onClose={onCancel}
    >
      <h2>{title}</h2>
      <p>{body}</p>
      <div className="actions">
        <button className="btn" type="button" onClick={onCancel}>
          返回
        </button>
        <button className="btn primary" type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
