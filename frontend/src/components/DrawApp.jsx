import { useEffect, useMemo, useRef, useState } from "react";
import { formatBanRemaining, parseAdminAuthError } from "../lib/adminAuth.js";
import { createSocket } from "../lib/socket.js";

export const DrawApp = () => {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [tokenInput, setTokenInput] = useState(window.localStorage.getItem("openpixel-admin-token") || "");
  const [authToken, setAuthToken] = useState(window.localStorage.getItem("openpixel-admin-token") || "");
  const [authError, setAuthError] = useState("");
  const [bannedUntil, setBannedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [participants, setParticipants] = useState([]);
  const [lotteryPool, setLotteryPool] = useState([]);
  const [lotteryDraws, setLotteryDraws] = useState([]);
  const [prizes, setPrizes] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!authToken) {
      return undefined;
    }

    const socket = createSocket("admin", authToken);
    socketRef.current = socket;
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
    socket.on("snapshot", (snapshot) => {
      setParticipants(snapshot.participants ?? []);
      setLotteryPool(snapshot.lotteryPool ?? []);
      setLotteryDraws(snapshot.lotteryDraws ?? []);
      setPrizes(snapshot.prizes ?? []);
    });
    socket.on("participant:updated", (participant) => {
      setParticipants((current) => {
        const exists = current.some((item) => item.studentId === participant.studentId);
        return exists
          ? current.map((item) => (item.studentId === participant.studentId ? participant : item))
          : [...current, participant].sort((left, right) => left.studentId.localeCompare(right.studentId));
      });
      setLotteryPool((current) => {
        const exists = current.some((item) => item.studentId === participant.studentId);
        if (participant.lotteryEligible && !participant.drawnPrize) {
          return exists
            ? current.map((item) => (item.studentId === participant.studentId ? participant : item))
            : [...current, participant];
        }
        return current.filter((item) => item.studentId !== participant.studentId);
      });
    });
    socket.on("participants:updated", setParticipants);
    socket.on("lotteryPool:updated", setLotteryPool);
    socket.on("prizes:updated", setPrizes);
    socket.on("lottery:drawn", (draw) => {
      setLotteryDraws((current) => [...current, draw]);
      setLotteryPool((current) => current.filter((participant) => participant.studentId !== draw.studentId));
    });

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

  useEffect(() => {
    if (
      selectedStudentId &&
      !lotteryPool.some((participant) => participant.studentId === selectedStudentId)
    ) {
      setSelectedStudentId("");
    }
  }, [lotteryPool, selectedStudentId]);

  const isBanned = bannedUntil > now;
  const latestDraw = lotteryDraws.at(-1) ?? null;
  const sortedLotteryPool = useMemo(
    () => [...lotteryPool].sort((left, right) => left.studentId.localeCompare(right.studentId)),
    [lotteryPool]
  );
  const selectedParticipant = useMemo(
    () => participants.find((participant) => participant.studentId === selectedStudentId.trim()) ?? null,
    [participants, selectedStudentId]
  );
  const drawPrizes = prizes.filter((prize) => prize.drawEnabled && Number.isInteger(prize.threshold));

  const enterDrawPage = () => {
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

  const drawPrize = () => {
    socketRef.current?.emit("lottery:draw", { studentId: selectedStudentId.trim() }, (response) => {
      if (response.ok) {
        setToast(`${response.draw.studentId} 抽中：${response.draw.prizeTitle}`);
        return;
      }

      const messages = {
        INVALID_STUDENT_ID: "请输入正确学号",
        PARTICIPANT_NOT_FOUND: "未找到该学号",
        ALREADY_DRAWN: "该学号已经抽过奖",
        NO_ELIGIBLE_PRIZE: "该学号当前还不能抽奖"
      };
      setToast(messages[response.reason] ?? "抽奖失败");
    });
  };

  if (!connected) {
    return (
      <main className="auth-shell">
        <section className="panel auth-card">
          <p className="eyebrow">OpenPixel · Draw</p>
          <h1>进入抽奖操作页</h1>
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
            <button type="button" onClick={enterDrawPage} disabled={isBanned}>
              打开抽奖操作页
            </button>
          </div>
          {authError && <p className="auth-error">{authError}</p>}
          {isBanned && <p className="auth-ban">剩余封禁时间：{formatBanRemaining(bannedUntil, now)}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell draw-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">OpenPixel · Draw</p>
          <h1>抽奖操作页</h1>
        </div>
        <div className="dashboard-actions">
          <a href="/lottery">打开抽奖展示大屏</a>
          <a href="/admin">返回管理台</a>
          <button type="button" className="quiet-button" onClick={logout}>
            退出
          </button>
          <span className="status online">LIVE</span>
        </div>
      </header>

      <section className="lottery-columns draw-operator-columns">
        <article className="panel">
          <p className="eyebrow">抽奖</p>
          <h2>指定学号开奖</h2>
          <div className="inline-form draw-form">
            <select
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
            >
              <option value="">请选择可抽奖学号</option>
              {sortedLotteryPool.map((participant) => (
                <option key={participant.studentId} value={participant.studentId}>
                  {participant.studentId} · {participant.points} 分
                </option>
              ))}
            </select>
            <button type="button" onClick={drawPrize} disabled={!selectedStudentId}>
              为该用户抽奖
            </button>
          </div>
          <p className="muted">2 分可抽贴纸；3 分可抽贴纸、徽章或终极大奖。每个学号默认只抽一次。</p>
          <div className="draw-student-status">
            <strong>{selectedParticipant?.studentId ?? "等待输入学号"}</strong>
            <span>
              {selectedParticipant
                ? `${selectedParticipant.points} 分 · ${
                    selectedParticipant.drawnPrize?.prizeTitle ??
                    (selectedParticipant.lotteryEligible ? "可抽奖" : "未达抽奖")
                  }`
                : "输入后会显示当前资格"}
            </span>
          </div>
        </article>

        <article className="panel">
          <p className="eyebrow">最新结果</p>
          <h2>{latestDraw?.prizeTitle ?? "等待开奖"}</h2>
          <p className="draw-latest-student">{latestDraw?.studentId ?? "暂无抽奖记录"}</p>
          <p className="muted">{latestDraw ? `第 ${latestDraw.round} 次抽奖` : "抽奖后会同步到展示大屏"}</p>
        </article>
      </section>

      <section className="lottery-columns draw-operator-columns">
        <article className="panel">
          <p className="eyebrow">可抽奖用户</p>
          <h2>{sortedLotteryPool.length} 人</h2>
          <div className="lottery-chip-list">
            {sortedLotteryPool.map((participant) => (
              <span key={participant.studentId}>{participant.studentId}</span>
            ))}
          </div>
        </article>
        <article className="panel">
          <p className="eyebrow">奖品池</p>
          <h2>{drawPrizes.length} 类奖品</h2>
          <div className="prize-history">
            {drawPrizes.map((prize) => (
              <div key={prize.id}>
                <strong>{prize.title}</strong>
                <span>剩余 {prize.remaining ?? "∞"}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel draw-log-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">历史</p>
            <h2>抽奖记录</h2>
          </div>
          <span>{lotteryDraws.length} 次</span>
        </div>
        <ol className="draw-history">
          {[...lotteryDraws].reverse().map((draw) => (
            <li key={draw.id}>
              第 {draw.round} 次 · {draw.studentId} · {draw.prizeTitle}
            </li>
          ))}
        </ol>
      </section>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
};
