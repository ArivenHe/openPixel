import { useEffect, useMemo, useRef, useState } from "react";
import { formatBanRemaining, parseAdminAuthError } from "../lib/adminAuth.js";
import { createSocket } from "../lib/socket.js";

const DEFAULT_PRIZES = [
  {
    id: "sticker",
    title: "“开源贡献者”像素风贴纸",
    description: "满 2 分后可参与抽取",
    threshold: 2,
    totalStock: 200,
    drawEnabled: true
  },
  {
    id: "badge",
    title: "“OpenPixel 共创者”金属徽章",
    description: "满 3 分后可参与抽取",
    threshold: 3,
    totalStock: 100,
    drawEnabled: true
  },
  {
    id: "grand",
    title: "终极大奖",
    description: "满 3 分后可参与抽取",
    threshold: 3,
    totalStock: 1,
    drawEnabled: true
  },
  {
    id: "mvp",
    title: "“最具价值贡献者”大奖",
    description: "活动结束时 Star 数最高的创意作者获得",
    threshold: null,
    totalStock: 1,
    drawEnabled: false
  }
];

const NEW_PRIZE_TEMPLATE = {
  title: "",
  description: "现场抽奖奖品",
  threshold: 2,
  totalStock: 20,
  drawEnabled: true
};

export const AdminApp = () => {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [topics, setTopics] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [prizes, setPrizes] = useState(DEFAULT_PRIZES);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newPrize, setNewPrize] = useState(NEW_PRIZE_TEMPLATE);
  const [tokenInput, setTokenInput] = useState(window.localStorage.getItem("openpixel-admin-token") || "");
  const [authToken, setAuthToken] = useState(window.localStorage.getItem("openpixel-admin-token") || "");
  const [authError, setAuthError] = useState("");
  const [bannedUntil, setBannedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!authToken) {
      return undefined;
    }

    const socket = createSocket("admin", authToken);
    socketRef.current = socket;
    const applyActivityState = (snapshot) => {
      setTopics(snapshot.topics ?? []);
      setIdeas(snapshot.ideas ?? []);
      setParticipants(snapshot.participants ?? []);
      setPrizes(snapshot.prizes ?? DEFAULT_PRIZES);
    };

    socket.on("connect", () => {
      setConnected(true);
      setAuthError("");
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", (error) => {
      const nextAuthState = parseAdminAuthError(error);
      setConnected(false);
      setAuthError(nextAuthState.message);
      setBannedUntil(nextAuthState.bannedUntil);
      window.localStorage.removeItem("openpixel-admin-token");
      setAuthToken("");
      socket.disconnect();
    });
    socket.on("snapshot", applyActivityState);
    socket.on("activity:reset", (snapshot) => {
      applyActivityState(snapshot);
      setNewTopicTitle("");
      setNewPrize(NEW_PRIZE_TEMPLATE);
    });
    socket.on("topics:updated", setTopics);
    socket.on("idea:created", (idea) => setIdeas((current) => [...current, idea]));
    socket.on("participant:updated", (participant) => {
      setParticipants((current) => {
        const exists = current.some((item) => item.studentId === participant.studentId);
        return exists
          ? current.map((item) => (item.studentId === participant.studentId ? participant : item))
          : [...current, participant].sort((left, right) => left.studentId.localeCompare(right.studentId));
      });
    });
    socket.on("participants:updated", setParticipants);
    socket.on("prizes:updated", setPrizes);

    return () => socket.disconnect();
  }, [authToken]);

  useEffect(() => {
    if (bannedUntil <= now) {
      return undefined;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [bannedUntil, now]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const sortedParticipants = useMemo(
    () => [...participants].sort((left, right) => right.points - left.points || left.studentId.localeCompare(right.studentId)),
    [participants]
  );

  const ideaCountsByTopic = useMemo(() => {
    const counts = new Map(topics.map((topic) => [topic.id, 0]));
    ideas.forEach((idea) => counts.set(idea.topicId, (counts.get(idea.topicId) ?? 0) + 1));
    return counts;
  }, [ideas, topics]);

  const saveToken = () => {
    if (bannedUntil > Date.now()) {
      return;
    }

    const nextToken = tokenInput.trim();
    if (!nextToken) {
      setAuthError("请输入 token");
      return;
    }

    window.localStorage.setItem("openpixel-admin-token", nextToken);
    setAuthError("");
    setBannedUntil(0);
    setAuthToken(nextToken);
  };

  const logout = () => {
    window.localStorage.removeItem("openpixel-admin-token");
    setAuthToken("");
    setTokenInput("");
    setConnected(false);
  };

  const isBanned = bannedUntil > now;

  const parseNullableInteger = (value) => {
    if (value === "") {
      return null;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };

  const updatePrize = (id, field, value) => {
    setPrizes((current) =>
      current.map((prize) =>
        prize.id === id
          ? {
              ...prize,
              [field]: ["threshold", "totalStock"].includes(field) ? parseNullableInteger(value) : value
            }
          : prize
      )
    );
  };

  const updateNewPrize = (field, value) => {
    setNewPrize((current) => ({
      ...current,
      [field]: ["threshold", "totalStock"].includes(field) ? parseNullableInteger(value) : value
    }));
  };

  const savePrizes = () => {
    socketRef.current?.emit("prizes:update", { prizes }, (response) => {
      if (response.ok) {
        setPrizes(response.prizes);
        setToast("奖品已实时更新");
        return;
      }
      setToast("奖品更新失败，请检查名称、说明、积分和库存");
    });
  };

  const createPrize = () => {
    if (!newPrize.title.trim()) {
      setToast("请输入奖品名称");
      return;
    }

    socketRef.current?.emit("prize:create", newPrize, (response) => {
      if (response.ok) {
        setPrizes(response.prizes);
        setNewPrize(NEW_PRIZE_TEMPLATE);
        setToast("奖品已新增");
        return;
      }
      setToast("奖品新增失败，请检查填写内容");
    });
  };

  const deletePrize = (prize) => {
    socketRef.current?.emit("prize:delete", { id: prize.id }, (response) => {
      if (response.ok) {
        setPrizes(response.prizes);
        setToast("奖品已删除");
        return;
      }
      setToast(response.reason === "PRIZE_IN_USE" ? "已中奖或已核销的奖品不能删除" : "奖品删除失败");
    });
  };

  const createTopic = () => {
    const title = newTopicTitle.trim();
    if (!title) {
      setToast("请输入话题标题");
      return;
    }

    socketRef.current?.emit("topic:create", { title }, (response) => {
      if (response.ok) {
        setNewTopicTitle("");
        setToast("话题已新增");
        return;
      }
      setToast("话题新增失败");
    });
  };

  const updateTopicTitle = (id, title) => {
    setTopics((current) =>
      current.map((topic) => (topic.id === id ? { ...topic, title } : topic))
    );
  };

  const saveTopic = (topic) => {
    socketRef.current?.emit("topic:update", { id: topic.id, title: topic.title }, (response) => {
      setToast(response.ok ? "话题已更新" : "话题更新失败");
    });
  };

  const deleteTopic = (topic) => {
    socketRef.current?.emit("topic:delete", { id: topic.id }, (response) => {
      if (response.ok) {
        setToast("话题已删除");
        return;
      }
      setToast(response.reason === "TOPIC_IN_USE" ? "已有 Fork 的话题不能删除" : "话题删除失败");
    });
  };

  const redeem = (studentId, prizeId) => {
    socketRef.current?.emit("participant:redeem", { studentId, prizeId }, (response) => {
      setToast(response.ok ? "核销成功" : "当前不可核销");
    });
  };

  const resetAllData = () => {
    if (resetting || !socketRef.current) {
      return;
    }

    const confirmed = window.confirm(
      "确定要清空所有活动数据吗？这会清空学号、创意、提交、盲盒、抽奖、核销记录，并恢复默认话题和奖品。"
    );
    if (!confirmed) {
      return;
    }

    setResetting(true);
    socketRef.current.emit("admin:reset-data", {}, (response) => {
      setResetting(false);
      if (response.ok) {
        setToast("所有活动数据已清空");
        return;
      }
      setToast("清空失败，请稍后重试");
    });
  };

  if (!connected) {
    return (
      <main className="auth-shell">
        <section className="panel auth-card">
          <p className="eyebrow">OpenPixel · Admin</p>
          <h1>进入活动管理台</h1>
          <p className="muted">请输入管理员 token 后继续。</p>
          <div className="idea-form">
            <label>
              管理 token
              <input
                value={tokenInput}
                onChange={(event) => {
                  setTokenInput(event.target.value);
                  if (!isBanned) {
                    setAuthError("");
                  }
                }}
                placeholder="请输入 token"
                type="password"
                disabled={isBanned}
              />
            </label>
            <button type="button" onClick={saveToken} disabled={isBanned}>
              进入管理台
            </button>
          </div>
          {authError && <p className="auth-error">{authError}</p>}
          {isBanned && <p className="auth-ban">剩余封禁时间：{formatBanRemaining(bannedUntil, now)}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">OpenPixel · Admin</p>
          <h1>活动管理台</h1>
        </div>
        <div className="dashboard-actions">
          <a href="/draw">抽奖操作页</a>
          <a href="/lottery">抽奖展示大屏</a>
          <button type="button" className="quiet-button" onClick={logout}>
            退出
          </button>
          <span className="status online">LIVE</span>
        </div>
      </header>

      <section className="admin-grid">
        <article className="panel">
          <p className="eyebrow">导出</p>
          <h2>活动资产</h2>
          <div className="export-list">
            <a href="/api/export/participants">participants.json</a>
            <a href="/api/export/ideas">ideas.json</a>
            <a href="/api/export/code-submissions">code_submissions.json</a>
            <a href="/api/export/blind-box-shares">blind_box_shares.json</a>
            <a href="/api/export/lottery">lottery_draws.json</a>
          </div>
        </article>
        <article className="panel danger-zone">
          <p className="eyebrow">危险操作</p>
          <h2>清空所有数据</h2>
          <p className="muted">
            会清空学号、创意、代码提交、盲盒、抽奖、核销、画布和设备状态，并恢复默认话题与奖品。
          </p>
          <button type="button" className="danger-button" onClick={resetAllData} disabled={resetting}>
            {resetting ? "正在清空…" : "清空所有数据"}
          </button>
        </article>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">灵感</p>
            <h2>主干话题管理</h2>
          </div>
          <span>{topics.length} 个话题</span>
        </div>
        <div className="inline-form topic-create-form">
          <input
            value={newTopicTitle}
            onChange={(event) => setNewTopicTitle(event.target.value)}
            placeholder="新增主干话题，例如：校园二手交易不方便"
            maxLength={30}
          />
          <button type="button" onClick={createTopic}>
            新增话题
          </button>
        </div>
        <div className="admin-topic-list">
          {topics.map((topic) => {
            const ideaCount = ideaCountsByTopic.get(topic.id) ?? 0;
            return (
              <article key={topic.id}>
                <div>
                  <input
                    value={topic.title}
                    onChange={(event) => updateTopicTitle(topic.id, event.target.value)}
                    maxLength={30}
                  />
                  <span>{ideaCount} 个 Fork</span>
                </div>
                <button type="button" onClick={() => saveTopic(topic)}>
                  保存
                </button>
                <button type="button" disabled={ideaCount > 0} onClick={() => deleteTopic(topic)}>
                  删除
                </button>
              </article>
            );
          })}
        </div>
        <p className="muted">已有 Fork 的话题只能改名，不能删除，避免历史内容丢失归属。</p>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">奖品</p>
            <h2>实时奖品配置</h2>
          </div>
          <button type="button" onClick={savePrizes}>
            保存奖品
          </button>
        </div>
        <div className="inline-form prize-create-form">
          <label>
            奖品名称
            <input
              value={newPrize.title}
              onChange={(event) => updateNewPrize("title", event.target.value)}
              placeholder="例如：限定鼠标垫"
              maxLength={50}
            />
          </label>
          <label>
            说明
            <input
              value={newPrize.description}
              onChange={(event) => updateNewPrize("description", event.target.value)}
              placeholder="例如：满 3 分后可参与抽取"
              maxLength={120}
            />
          </label>
          <label>
            所需积分
            <input
              type="number"
              min="0"
              value={newPrize.threshold ?? ""}
              onChange={(event) => updateNewPrize("threshold", event.target.value)}
            />
          </label>
          <label>
            库存
            <input
              type="number"
              min="0"
              value={newPrize.totalStock ?? ""}
              onChange={(event) => updateNewPrize("totalStock", event.target.value)}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={newPrize.drawEnabled}
              onChange={(event) => updateNewPrize("drawEnabled", event.target.checked)}
            />
            加入奖池
          </label>
          <button type="button" onClick={createPrize}>
            新增奖品
          </button>
        </div>
        <div className="admin-prize-grid">
          {prizes.map((prize) => {
            const cannotDelete = prize.awardedCount > 0 || prize.redeemedCount > 0;
            return (
              <article className="admin-prize-card" key={prize.id}>
                <div className="admin-prize-meta">
                  <strong>{prize.id}</strong>
                  <span>
                    已抽 {prize.awardedCount ?? 0} · 已核销 {prize.redeemedCount ?? 0}
                  </span>
                </div>
                <input
                  value={prize.title}
                  onChange={(event) => updatePrize(prize.id, "title", event.target.value)}
                  maxLength={50}
                />
                <textarea
                  value={prize.description}
                  onChange={(event) => updatePrize(prize.id, "description", event.target.value)}
                  maxLength={120}
                />
                <label>
                  所需积分
                  <input
                    type="number"
                    min="0"
                    value={prize.threshold ?? ""}
                    onChange={(event) => updatePrize(prize.id, "threshold", event.target.value)}
                    placeholder="不参与抽奖可留空"
                  />
                </label>
                <label>
                  库存
                  <input
                    type="number"
                    min="0"
                    value={prize.totalStock ?? ""}
                    onChange={(event) => updatePrize(prize.id, "totalStock", event.target.value)}
                    placeholder="留空表示不限量"
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={prize.drawEnabled}
                    onChange={(event) => updatePrize(prize.id, "drawEnabled", event.target.checked)}
                  />
                  参与随机奖池
                </label>
                <footer>
                  <span>剩余 {prize.remaining ?? "∞"}</span>
                  <button type="button" disabled={cannotDelete} onClick={() => deletePrize(prize)}>
                    删除
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
        <p className="muted">MVP、贴纸、徽章和自定义奖品都可以删除；只要已经产生中奖或核销记录，就会自动禁止删除。</p>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">核销</p>
            <h2>学号与奖励</h2>
          </div>
          <span>{participants.length} 人</span>
        </div>
        <div className="participant-table">
          {sortedParticipants.map((participant) => (
            <article key={participant.studentId}>
              <strong>{participant.studentId}</strong>
              <span>{participant.points} 分</span>
              <span>PR {participant.ideaCount}</span>
              <span>代码 {participant.codeSubmissionCount}</span>
              <span>{participant.drawnPrize?.prizeTitle ?? (participant.lotteryEligible ? "可抽奖" : "未达抽奖")}</span>
              <button
                type="button"
                disabled={!participant.drawnPrize || participant.redemptions[participant.drawnPrize.prizeId]}
                onClick={() => redeem(participant.studentId, participant.drawnPrize?.prizeId)}
              >
                {participant.drawnPrize && participant.redemptions[participant.drawnPrize.prizeId]
                  ? "奖品已核销"
                  : "核销已中奖品"}
              </button>
            </article>
          ))}
        </div>
      </section>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
};
