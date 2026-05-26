import { useEffect, useRef, useState } from "react";
import { formatBanRemaining, parseAdminAuthError } from "../lib/adminAuth.js";
import { createSocket } from "../lib/socket.js";

const maskStudentId = (studentId) => `${studentId.slice(0, 3)}****${studentId.slice(-3)}`;

export const LotteryApp = () => {
  const drawnStudentIdsRef = useRef(new Set());
  const [connected, setConnected] = useState(false);
  const [tokenInput, setTokenInput] = useState(window.localStorage.getItem("openpixel-admin-token") || "");
  const [authToken, setAuthToken] = useState(window.localStorage.getItem("openpixel-admin-token") || "");
  const [authError, setAuthError] = useState("");
  const [bannedUntil, setBannedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [lotteryPool, setLotteryPool] = useState([]);
  const [lotteryDraws, setLotteryDraws] = useState([]);
  const [prizes, setPrizes] = useState([]);
  const [latestDraw, setLatestDraw] = useState(null);

  useEffect(() => {
    if (!authToken) {
      return undefined;
    }

    const socket = createSocket("admin", authToken);
    const applyActivityState = (snapshot) => {
      const nextDraws = snapshot.lotteryDraws ?? [];
      setLotteryPool(snapshot.lotteryPool ?? []);
      setLotteryDraws(nextDraws);
      drawnStudentIdsRef.current = new Set(nextDraws.map((draw) => draw.studentId));
      setPrizes(snapshot.prizes ?? []);
      setLatestDraw(nextDraws.at(-1) ?? null);
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
    socket.on("activity:reset", applyActivityState);
    socket.on("participant:updated", (participant) => {
      setLotteryPool((current) => {
        const exists = current.some((item) => item.studentId === participant.studentId);
        if (participant.lotteryEligible && !drawnStudentIdsRef.current.has(participant.studentId)) {
          return exists ? current : [...current, participant];
        }
        return current.filter((item) => item.studentId !== participant.studentId);
      });
    });
    socket.on("lotteryPool:updated", setLotteryPool);
    socket.on("prizes:updated", setPrizes);
    socket.on("lottery:drawn", (draw) => {
      drawnStudentIdsRef.current.add(draw.studentId);
      setLatestDraw(draw);
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

  const drawPrizes = prizes.filter((prize) => prize.drawEnabled && Number.isInteger(prize.threshold));

  const enterLottery = () => {
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

  const isBanned = bannedUntil > now;

  if (!connected) {
    return (
      <main className="auth-shell lottery-auth-shell">
        <section className="panel auth-card">
          <p className="eyebrow">OpenPixel · Lottery</p>
          <h1>进入抽奖大屏</h1>
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
            <button type="button" onClick={enterLottery} disabled={isBanned}>
              打开抽奖大屏
            </button>
          </div>
          {authError && <p className="auth-error">{authError}</p>}
          {isBanned && <p className="auth-ban">剩余封禁时间：{formatBanRemaining(bannedUntil, now)}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="lottery-shell lottery-screen">
      <header className="lottery-header">
        <p className="eyebrow">OpenPixel · Lottery</p>
        <h1>现场奖品抽取</h1>
        <span className={connected ? "status online" : "status"}>{connected ? "LIVE" : "OFFLINE"}</span>
      </header>

      <section className="lottery-stage prize-stage hero-lottery-stage">
        <p>{latestDraw ? maskStudentId(latestDraw.studentId) : "等待管理员指定学号"}</p>
        <strong>{latestDraw?.prizeTitle ?? "等待开奖"}</strong>
        <span>{latestDraw ? `第 ${latestDraw.round} 次抽奖` : "工作人员在抽奖操作页发起抽奖后，这里会实时展示结果"}</span>
      </section>

      <section className="lottery-columns lottery-screen-columns">
        <article className="panel">
          <p className="eyebrow">可抽奖用户</p>
          <h2>{lotteryPool.length} 人</h2>
          <div className="lottery-chip-list large">
            {lotteryPool.map((participant) => (
              <span key={participant.studentId}>{maskStudentId(participant.studentId)}</span>
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
        <p className="eyebrow">抽奖历史</p>
        <ol className="draw-history">
          {[...lotteryDraws].reverse().map((draw) => (
            <li key={draw.id}>
              第 {draw.round} 次 · {maskStudentId(draw.studentId)} · {draw.prizeTitle}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
};
