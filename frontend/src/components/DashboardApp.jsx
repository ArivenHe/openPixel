import { useEffect, useRef, useState } from "react";
import { createSocket } from "../lib/socket.js";
import { CodeWall } from "./CodeWall.jsx";
import { TreeCanvas } from "./TreeCanvas.jsx";

export const DashboardApp = () => {
  const [connected, setConnected] = useState(false);
  const [topics, setTopics] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [codeTasks, setCodeTasks] = useState([]);
  const [codeSubmissions, setCodeSubmissions] = useState([]);
  const [stats, setStats] = useState({ activeContributors: 0, totalCommits: 0 });
  const [prizes, setPrizes] = useState([]);
  const [lotteryDraws, setLotteryDraws] = useState([]);
  const [pulseIdeaId, setPulseIdeaId] = useState("");
  const cleanupTimers = useRef([]);

  useEffect(() => {
    const socket = createSocket("dashboard");
    const timers = cleanupTimers.current;
    const applyActivityState = (snapshot) => {
      setTopics(snapshot.topics ?? []);
      setIdeas(snapshot.ideas ?? []);
      setCodeSubmissions(snapshot.codeSubmissions ?? []);
      setStats(snapshot.stats ?? { activeContributors: 0, totalCommits: 0 });
      setPrizes(snapshot.prizes ?? []);
      setLotteryDraws(snapshot.lotteryDraws ?? []);
      setPulseIdeaId("");
    };

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("snapshot", (snapshot) => {
      applyActivityState(snapshot);
      setCodeTasks(snapshot.codeTasks ?? []);
    });
    socket.on("activity:reset", applyActivityState);
    socket.on("idea:created", (idea) => {
      setIdeas((current) => [...current, idea]);
      setPulseIdeaId(idea.id);
    });
    socket.on("idea:starred", (idea) => {
      setIdeas((current) => current.map((item) => (item.id === idea.id ? idea : item)));
      setPulseIdeaId(idea.id);
    });
    socket.on("topics:updated", setTopics);
    socket.on("code:completed", (submission) => setCodeSubmissions((current) => [...current, submission]));
    socket.on("stats:update", setStats);
    socket.on("prizes:updated", setPrizes);
    socket.on("lottery:drawn", (draw) => setLotteryDraws((current) => [...current, draw]));

    return () => {
      timers.forEach(window.clearTimeout);
      socket.disconnect();
    };
  }, []);

  const codeLanguageCount = new Set(codeTasks.map((task) => task.language)).size;

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">OpenPixel · Dashboard</p>
          <h1>开源精神现场共创</h1>
        </div>
        <div className="dashboard-actions">
          <a href="/api/export/ideas" download>
            导出 ideas.json
          </a>
          <a href="/api/export/code-submissions" download>
            导出 code_submissions.json
          </a>
          <a href="/lottery">抽奖展示大屏</a>
          <span className={connected ? "status online" : "status"}>{connected ? "LIVE" : "RECONNECTING"}</span>
        </div>
      </header>

      <section className="dashboard-grid">
        <article className="visual-card tree-card">
          <div className="card-heading">
            <h2>灵感开源树</h2>
            <span>{ideas.length} 个分支</span>
          </div>
          <TreeCanvas topics={topics} ideas={ideas} pulseIdeaId={pulseIdeaId} />
        </article>

        <article className="visual-card code-wall-card">
          <div className="card-heading">
            <h2>代码共创墙</h2>
            <span>
              {codeLanguageCount} 种语言 · {codeSubmissions.length} 条 Commit
            </span>
          </div>
          <CodeWall tasks={codeTasks} submissions={codeSubmissions} />
        </article>
      </section>

      <aside className="stats-rail">
        <div>
          <span>Active Contributor</span>
          <strong>{stats.activeContributors}</strong>
        </div>
        <div>
          <span>Total Commits</span>
          <strong>{stats.totalCommits}</strong>
        </div>
        <div>
          <span>Drawable Users</span>
          <strong>{stats.lotteryPoolCount ?? 0}</strong>
        </div>
      </aside>

      <section className="dashboard-bottom-grid">
        <article className="visual-card">
          <div className="card-heading">
            <h2>实时奖品</h2>
            <span>可动态调整</span>
          </div>
          <div className="dashboard-prizes">
            {prizes.map((prize) => (
              <div key={prize.id}>
                <strong>{prize.title}</strong>
                <span>{prize.description}</span>
                <em>{prize.remaining ?? "∞"} 剩余</em>
              </div>
            ))}
          </div>
        </article>

        <article className="visual-card">
          <div className="card-heading">
            <h2>MVP & 抽奖</h2>
            <span>{lotteryDraws.length} 轮已开奖</span>
          </div>
          <div className="mvp-card">
            <strong>{stats.mvpIdea?.text ?? "等待创意上榜"}</strong>
            <span>{stats.mvpIdea ? `⭐ ${stats.mvpIdea.stars}` : "暂无 Star"}</span>
          </div>
        </article>
      </section>
    </main>
  );
};
