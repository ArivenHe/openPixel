const maskStudentId = (studentId) => `${studentId.slice(0, 3)}****${studentId.slice(-3)}`;

export const CodeWall = ({ tasks, submissions }) => {
  const latestSubmissions = [...submissions].reverse().slice(0, 6);
  const completedTaskIds = new Set(submissions.map((submission) => submission.taskId));
  const languageCounts = tasks.reduce((counts, task) => {
    counts.set(task.language, (counts.get(task.language) ?? 0) + 1);
    return counts;
  }, new Map());

  return (
    <div className="code-wall">
      <section className="repo-panel">
        <div className="code-wall-heading">
          <p className="eyebrow">repository</p>
          <div className="language-mini-list">
            {[...languageCounts.entries()].map(([language, count]) => (
              <span key={language}>
                {language} · {count}
              </span>
            ))}
          </div>
        </div>
        <div className="repo-task-list">
          {tasks.map((task) => (
            <article className={completedTaskIds.has(task.id) ? "repo-task done" : "repo-task"} key={task.id}>
              <span>{task.language} · {task.filePath}</span>
              <strong>{task.title}</strong>
              <em>{completedTaskIds.has(task.id) ? "tests passed" : "todo"}</em>
            </article>
          ))}
        </div>
      </section>

      <section className="commit-feed">
        <p className="eyebrow">latest commits</p>
        {latestSubmissions.length === 0 && <p className="empty">等待第一条 Commit。</p>}
        {latestSubmissions.map((submission) => (
          <article key={submission.id}>
            <strong>{submission.taskTitle}</strong>
            <span>
              {submission.language} · {maskStudentId(submission.studentId)}
            </span>
            <em>{submission.resultLabel}</em>
          </article>
        ))}
      </section>
    </div>
  );
};
