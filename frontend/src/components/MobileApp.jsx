import { useEffect, useMemo, useRef, useState } from "react";
import { createSocket } from "../lib/socket.js";

const getMobilePage = () => {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const page = segments[1] ?? "home";
  return page === "pixels" ? "code" : page;
};

const go = (path) => {
  window.location.assign(path);
};

const ProgressSummary = ({ participant, prizes }) => {
  const nextThreshold = prizes
    .filter((prize) => prize.drawEnabled && Number.isInteger(prize.threshold))
    .map((prize) => prize.threshold)
    .sort((left, right) => left - right)
    .find((threshold) => threshold > (participant?.points ?? 0));

  return (
    <section className="panel reward-summary">
      <div>
        <p className="eyebrow">当前学号</p>
        <strong>{participant?.studentId ?? "未登记"}</strong>
      </div>
      <div>
        <p className="eyebrow">当前积分</p>
        <strong>{participant?.points ?? 0}</strong>
      </div>
      <div>
        <p className="eyebrow">奖励进度</p>
        <span>
          {participant?.drawnPrize
            ? `已抽中 ${participant.drawnPrize.prizeTitle}`
            : participant?.lotteryEligible
              ? "可由工作人员抽奖"
              : nextThreshold
                ? `满 ${nextThreshold} 分可参与抽奖`
                : "等待工作人员开放奖池"}
        </span>
      </div>
      <div className="reward-mini-list">
        {prizes
          .filter((prize) => prize.drawEnabled)
          .map((prize) => (
            <span key={prize.id}>
              {prize.title} · {prize.remaining ?? "∞"} 剩余
            </span>
          ))}
      </div>
    </section>
  );
};

export const MobileApp = () => {
  const socketRef = useRef(null);
  const page = getMobilePage();
  const [connected, setConnected] = useState(false);
  const [topics, setTopics] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [codeTasks, setCodeTasks] = useState([]);
  const [starredIdeaIds, setStarredIdeaIds] = useState(new Set());
  const [participant, setParticipant] = useState(null);
  const [prizes, setPrizes] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [studentIdInput, setStudentIdInput] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [ideaFilterTopicId, setIdeaFilterTopicId] = useState("all");
  const [ideaQuery, setIdeaQuery] = useState("");
  const [ideaSort, setIdeaSort] = useState("hot");
  const [ideaText, setIdeaText] = useState("");
  const [shareText, setShareText] = useState("");
  const [selectedChoices, setSelectedChoices] = useState({});
  const [selectedLanguage, setSelectedLanguage] = useState("全部");
  const [toast, setToast] = useState("");
  const [mutedUntil, setMutedUntil] = useState(0);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const socket = createSocket("mobile");
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("snapshot", (snapshot) => {
      setTopics(snapshot.topics);
      setIdeas(snapshot.ideas);
      setCodeTasks(snapshot.codeTasks ?? []);
      setStarredIdeaIds(new Set(snapshot.starredIdeaIds));
      setParticipant(snapshot.participant);
      setPrizes(snapshot.prizes);
      setStudentIdInput(snapshot.participant?.studentId ?? "");
      setSelectedTopicId(snapshot.topics[0]?.id ?? "");
      setHydrated(true);
    });
    socket.on("idea:created", (idea) => {
      setIdeas((current) => [...current, idea]);
    });
    socket.on("idea:starred", (idea) => {
      setIdeas((current) => current.map((item) => (item.id === idea.id ? idea : item)));
    });
    socket.on("topics:updated", (nextTopics) => {
      setTopics(nextTopics);
      setSelectedTopicId((current) =>
        nextTopics.some((topic) => topic.id === current) ? current : nextTopics[0]?.id ?? ""
      );
      setIdeaFilterTopicId((current) =>
        current === "all" || nextTopics.some((topic) => topic.id === current) ? current : "all"
      );
    });
    socket.on("participant:updated", (nextParticipant) => {
      setParticipant((current) =>
        nextParticipant.studentId === current?.studentId || !current ? nextParticipant : current
      );
    });
    socket.on("prizes:updated", setPrizes);

    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => forceTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const topicById = useMemo(
    () => new Map(topics.map((topic) => [topic.id, topic])),
    [topics]
  );

  const ideaCountsByTopic = useMemo(() => {
    const counts = new Map(topics.map((topic) => [topic.id, 0]));
    ideas.forEach((idea) => counts.set(idea.topicId, (counts.get(idea.topicId) ?? 0) + 1));
    return counts;
  }, [ideas, topics]);

  const visibleIdeas = useMemo(
    () => {
      const query = ideaQuery.trim().toLowerCase();
      return ideas
        .filter((idea) => ideaFilterTopicId === "all" || idea.topicId === ideaFilterTopicId)
        .filter((idea) => {
          if (!query) {
            return true;
          }
          const topicTitle = topicById.get(idea.topicId)?.title ?? "";
          return `${topicTitle} ${idea.text}`.toLowerCase().includes(query);
        })
        .sort((left, right) => {
          if (ideaSort === "hot" && right.stars !== left.stars) {
            return right.stars - left.stars;
          }
          return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
        });
    },
    [ideaFilterTopicId, ideaQuery, ideaSort, ideas, topicById]
  );

  const codeLanguages = useMemo(
    () => ["全部", ...new Set(codeTasks.map((task) => task.language).filter(Boolean))],
    [codeTasks]
  );

  const visibleCodeTasks = useMemo(
    () =>
      selectedLanguage === "全部"
        ? codeTasks
        : codeTasks.filter((task) => task.language === selectedLanguage),
    [codeTasks, selectedLanguage]
  );

  const register = (event) => {
    event.preventDefault();
    socketRef.current?.emit("participant:register", { studentId: studentIdInput }, (response) => {
      if (!response.ok) {
        setToast("请输入正确学号");
        return;
      }

      setParticipant(response.participant);
      go("/mobile");
    });
  };

  const submitIdea = (event) => {
    event.preventDefault();
    socketRef.current?.emit(
      "idea:create",
      {
        topicId: selectedTopicId,
        text: ideaText
      },
      (response) => {
        if (!response.ok) {
          if (response.reason === "REGISTRATION_REQUIRED") {
            go("/mobile/register");
            return;
          }
          if (response.reason === "MODERATED") {
            setMutedUntil(response.mutedUntil);
            setToast(`内容触发审计：${response.sanitizedText}`);
            return;
          }
          if (response.reason === "MUTED") {
            setMutedUntil(response.mutedUntil);
            setToast("你当前处于 5 分钟禁言中");
            return;
          }

          setToast("提交失败，请检查内容");
          return;
        }

        setParticipant(response.participant);
        setIdeaText("");
        setToast("PR 已提交，+1 分");
      }
    );
  };

  const starIdea = (ideaId) => {
    socketRef.current?.emit("idea:star", { ideaId }, (response) => {
      if (!response.ok) {
        if (response.reason === "ALREADY_STARRED") {
          setToast("这个分支你已经 Star 过了");
        }
        return;
      }

      setStarredIdeaIds((current) => new Set([...current, ideaId]));
    });
  };

  const submitCodeTask = (taskId) => {
    socketRef.current?.emit("code:submit", { taskId, choiceId: selectedChoices[taskId] }, (response) => {
      if (!response.ok) {
        if (response.reason === "REGISTRATION_REQUIRED") {
          go("/mobile/register");
          return;
        }
        if (response.reason === "TEST_FAILED") {
          setToast("测试未通过，再想想");
          return;
        }
        if (response.reason === "TASK_ALREADY_COMPLETED") {
          setToast("这个任务你已经提交过了");
          return;
        }
        setToast("提交失败，请稍后重试");
        return;
      }

      setParticipant(response.participant);
      setToast(
        response.participant.codeSubmissionCount % 5 === 0 ? "累计 5 次 Commit，+1 分" : "测试通过，Commit +1"
      );
    });
  };

  const submitBlindBox = (event) => {
    event.preventDefault();
    socketRef.current?.emit("blindbox:share", { text: shareText }, (response) => {
      if (!response.ok) {
        if (response.reason === "ALREADY_SHARED") {
          setToast("你已经完成过盲盒知识共享");
          return;
        }
        if (response.reason === "REGISTRATION_REQUIRED") {
          go("/mobile/register");
          return;
        }
        if (response.reason === "MODERATED") {
          setMutedUntil(response.mutedUntil);
          setToast(`内容触发审计：${response.sanitizedText}`);
          return;
        }
        setToast("提交失败，请检查内容");
        return;
      }

      setParticipant(response.participant);
      setShareText("");
      setToast("知识共享完成，+1 分");
    });
  };

  const isMuted = mutedUntil > Date.now();

  if (!hydrated) {
    return (
      <main className="mobile-shell">
        <section className="panel centered-card">
          <p className="eyebrow">OpenPixel</p>
          <h2>正在加载活动状态…</h2>
        </section>
      </main>
    );
  }

  if (!participant && page !== "register") {
    go("/mobile/register");
    return null;
  }

  if (participant && page === "register") {
    go("/mobile");
    return null;
  }

  return (
    <main className={`mobile-shell spacious mobile-page-${page}`}>
      <header className="hero compact mobile-topbar">
        <div>
          <p className="eyebrow">OpenPixel · Mobile</p>
          <h1>现场共创</h1>
          <p className="muted">{connected ? "实时已连接" : "正在连接实时服务…"}</p>
        </div>
        {participant && (
          <button type="button" className="ghost-button" onClick={() => go("/mobile/rewards")}>
            {participant.points} 分
          </button>
        )}
      </header>

      {participant && <ProgressSummary participant={participant} prizes={prizes} />}

      {page === "register" && (
        <section className="panel centered-card">
          <p className="eyebrow">开始之前</p>
          <h2>登记学号</h2>
          <p className="muted">积分、奖品兑换和抽奖资格都将按学号统计。</p>
          <form className="idea-form" onSubmit={register}>
            <label>
              学号
              <input
                value={studentIdInput}
                onChange={(event) => setStudentIdInput(event.target.value)}
                placeholder="请输入学号"
                inputMode="numeric"
              />
            </label>
            <button type="submit">进入活动</button>
          </form>
        </section>
      )}

      {page === "home" && participant && (
        <section className="page-grid">
          <button type="button" className="feature-card" onClick={() => go("/mobile/ideas")}>
            <span>01</span>
            <strong>灵感开源墙</strong>
            <em>提交 PR，得 1 分</em>
          </button>
          <button type="button" className="feature-card" onClick={() => go("/mobile/code")}>
            <span>02</span>
            <strong>代码补全墙</strong>
            <em>每 5 次 Commit，得 1 分</em>
          </button>
          <button type="button" className="feature-card" onClick={() => go("/mobile/blind-box")}>
            <span>03</span>
            <strong>盲盒知识共享</strong>
            <em>首次参与，得 1 分</em>
          </button>
          <button type="button" className="feature-card" onClick={() => go("/mobile/rewards")}>
            <span>04</span>
            <strong>奖励中心</strong>
            <em>查看兑换与抽奖资格</em>
          </button>
        </section>
      )}

      {page === "ideas" && participant && (
        <section className="panel idea-page-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">01</p>
              <h2>灵感开源墙</h2>
            </div>
            {isMuted && <span className="pill danger">禁言中</span>}
          </div>

          <form className="idea-form" onSubmit={submitIdea}>
            <label>
              主干话题
              <select value={selectedTopicId} onChange={(event) => setSelectedTopicId(event.target.value)}>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              你的分支方案
              <textarea
                maxLength={50}
                value={ideaText}
                onChange={(event) => setIdeaText(event.target.value)}
                placeholder="50 字以内，提交一个更好的校园方案"
              />
            </label>
            <button type="submit" disabled={!ideaText.trim() || isMuted}>
              Fork &amp; PR
            </button>
          </form>

          <div className="idea-browser">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Fork Browser</p>
                <h3>浏览分支</h3>
              </div>
              <span className="muted">{visibleIdeas.length} / {ideas.length}</span>
            </div>

            <div className="idea-controls">
              <input
                value={ideaQuery}
                onChange={(event) => setIdeaQuery(event.target.value)}
                placeholder="搜索 Fork 内容或话题"
              />
              <select value={ideaSort} onChange={(event) => setIdeaSort(event.target.value)}>
                <option value="hot">按 Star 热度</option>
                <option value="recent">按最新提交</option>
              </select>
            </div>

            <div className="topic-filter-tabs" aria-label="话题筛选">
              <button
                type="button"
                className={ideaFilterTopicId === "all" ? "active" : ""}
                onClick={() => setIdeaFilterTopicId("all")}
              >
                全部 · {ideas.length}
              </button>
              {topics.map((topic) => (
                <button
                  type="button"
                  key={topic.id}
                  className={ideaFilterTopicId === topic.id ? "active" : ""}
                  onClick={() => setIdeaFilterTopicId(topic.id)}
                >
                  {topic.title} · {ideaCountsByTopic.get(topic.id) ?? 0}
                </button>
              ))}
            </div>

            <div className="idea-list readable">
              {visibleIdeas.length === 0 && <p className="empty">没有匹配的分支，换个话题或关键词试试。</p>}
              {visibleIdeas.map((idea) => {
                const topic = topicById.get(idea.topicId);
                const maskedStudentId = idea.studentId
                  ? `${idea.studentId.slice(0, 3)}****${idea.studentId.slice(-3)}`
                  : "匿名贡献者";
                return (
                  <article className="idea-card idea-branch-card" key={idea.id}>
                    <div className="idea-card-main">
                      <div className="idea-meta-row">
                        <span>{topic?.title ?? "未知话题"}</span>
                        <em>{maskedStudentId}</em>
                      </div>
                      <p>{idea.text}</p>
                    </div>
                    <button
                      type="button"
                      className="star-button"
                      disabled={starredIdeaIds.has(idea.id)}
                      onClick={() => starIdea(idea.id)}
                    >
                      ⭐ {idea.stars}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {page === "code" && participant && (
        <section className="panel code-page-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">02</p>
              <h2>代码补全墙</h2>
            </div>
            <div className="commit-summary">
              <strong>{participant.codeSubmissionCount}</strong>
              <span>累计 Commit</span>
            </div>
          </div>

          <div className="inline-metrics">
            <span>已完成 {participant.completedCodeTaskIds.length} / {codeTasks.length}</span>
            <span>下一积分点：{participant.nextCodePointAt} 次 Commit</span>
          </div>

          <div className="language-tabs" aria-label="语言筛选">
            {codeLanguages.map((language) => (
              <button
                type="button"
                key={language}
                className={selectedLanguage === language ? "active" : ""}
                onClick={() => setSelectedLanguage(language)}
              >
                {language}
              </button>
            ))}
          </div>

          <div className="code-task-grid">
            {visibleCodeTasks.map((task) => {
              const completed = participant.completedCodeTaskIds.includes(task.id);
              return (
                <article className={completed ? "code-task-card completed" : "code-task-card"} key={task.id}>
                  <div className="code-task-heading">
                    <div>
                      <p className="eyebrow">{task.filePath}</p>
                      <h3>{task.title}</h3>
                    </div>
                    <div className="code-card-badges">
                      <span className="language-badge">{task.language}</span>
                      {completed && <span className="pill">已提交</span>}
                    </div>
                  </div>
                  <p className="muted">{task.prompt}</p>
                  <pre>
                    <code>{task.snippet.join("\n")}</code>
                  </pre>
                  <div className="choice-list">
                    {task.choices.map((choice) => (
                      <button
                        type="button"
                        key={choice.id}
                        className={selectedChoices[task.id] === choice.id ? "choice active" : "choice"}
                        disabled={completed}
                        onClick={() =>
                          setSelectedChoices((current) => ({
                            ...current,
                            [task.id]: choice.id
                          }))
                        }
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="commit-button"
                    disabled={completed || !selectedChoices[task.id]}
                    onClick={() => submitCodeTask(task.id)}
                  >
                    {completed ? "已 Commit" : "运行测试并 Commit"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {page === "blind-box" && participant && (
        <section className="panel centered-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">03</p>
              <h2>盲盒知识共享</h2>
            </div>
            {participant.blindBoxParticipated && <span className="pill">已完成</span>}
          </div>
          <p className="muted">分享一个你今天学到的开源知识点，首次参与可得 1 分。</p>
          <form className="idea-form" onSubmit={submitBlindBox}>
            <label>
              我的知识卡片
              <textarea
                maxLength={80}
                value={shareText}
                onChange={(event) => setShareText(event.target.value)}
                placeholder="例如：Fork 是复制仓库后继续协作的起点"
              />
            </label>
            <button type="submit" disabled={!shareText.trim() || participant.blindBoxParticipated || isMuted}>
              提交知识卡片
            </button>
          </form>
        </section>
      )}

      {page === "rewards" && participant && (
        <section className="reward-layout">
          <article className="panel reward-card">
            <p className="eyebrow">奖励中心</p>
            <h2>{participant.points} 分</h2>
            <ul>
              <li>PR 提交：{participant.ideaCount} 次</li>
              <li>代码提交：{participant.codeSubmissionCount} 次</li>
              <li>盲盒共享：{participant.blindBoxParticipated ? "已完成" : "未完成"}</li>
            </ul>
          </article>
          {prizes.map((prize) => {
            const hasThreshold = Number.isInteger(prize.threshold);
            return (
              <article className="panel reward-card" key={prize.id}>
                <p className="eyebrow">{prize.id.toUpperCase()}</p>
                <h3>{prize.title}</h3>
                <p>{prize.description}</p>
                {hasThreshold ? (
                  <strong>
                    {participant.points >= prize.threshold
                      ? "已进入可抽奖范围"
                      : `满 ${prize.threshold} 分可参与抽取`}
                  </strong>
                ) : (
                  <strong>现场工作人员评定 / 发放</strong>
                )}
              </article>
            );
          })}
        </section>
      )}

      {page !== "register" && (
        <nav className="mobile-nav">
          <button type="button" onClick={() => go("/mobile")}>
            首页
          </button>
          <button type="button" onClick={() => go("/mobile/ideas")}>
            灵感
          </button>
          <button type="button" onClick={() => go("/mobile/code")}>
            代码
          </button>
          <button type="button" onClick={() => go("/mobile/blind-box")}>
            盲盒
          </button>
          <button type="button" onClick={() => go("/mobile/rewards")}>
            奖励
          </button>
        </nav>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
};
