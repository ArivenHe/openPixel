import { io } from "socket.io-client";
import { CODE_TASKS } from "../src/config.js";

const serverUrl = process.env.SERVER_URL || "http://localhost:3000";
const timeoutMs = 5000;
const unique = Date.now().toString(36);

const connect = (auth) =>
  new Promise((resolve, reject) => {
    const socket = io(serverUrl, {
      auth,
      timeout: timeoutMs,
      reconnection: false
    });

    const timer = setTimeout(() => reject(new Error("connection timeout")), timeoutMs);
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on("connect_error", reject);
  });

const emitWithAck = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

const waitFor = (socket, event) =>
  new Promise((resolve) => socket.once(event, resolve));

const mobile = await connect({ role: "mobile", deviceId: `mobile${unique}` });
const dashboard = await connect({ role: "dashboard", deviceId: `dashboard${unique}` });
const admin = await connect({
  role: "admin",
  deviceId: `admin${unique}`,
  adminToken: process.env.ADMIN_TOKEN || ""
});

try {
  const registerAck = await emitWithAck(mobile, "participant:register", {
    studentId: `2026${Date.now().toString().slice(-8)}`
  });
  const ideaCreated = waitFor(dashboard, "idea:created");
  const createAck = await emitWithAck(mobile, "idea:create", {
    topicId: "course-info",
    text: "统一课程入口并支持订阅提醒"
  });
  const createdIdea = await ideaCreated;

  const ideaStarred = waitFor(dashboard, "idea:starred");
  const starAck = await emitWithAck(mobile, "idea:star", {
    ideaId: createAck.idea.id
  });
  const starredIdea = await ideaStarred;

  const codeAcks = [];
  let latestSubmission = null;
  for (const task of CODE_TASKS.slice(0, 5)) {
    const codeCompleted = waitFor(dashboard, "code:completed");
    codeAcks.push(
      await emitWithAck(mobile, "code:submit", {
        taskId: task.id,
        choiceId: task.correctChoiceId
      })
    );
    latestSubmission = await codeCompleted;
  }

  const blindBoxAck = await emitWithAck(mobile, "blindbox:share", {
    text: "Fork 是复制仓库并开始协作的起点"
  });
  const lotteryAck = await emitWithAck(admin, "lottery:draw", {
    studentId: registerAck.participant.studentId
  });

  const expectations = [
    registerAck.ok === true,
    createAck.ok === true,
    createdIdea.id === createAck.idea.id,
    starAck.ok === true,
    starredIdea.stars === 1,
    codeAcks.every((ack) => ack.ok === true),
    latestSubmission.taskId === CODE_TASKS[4].id,
    blindBoxAck.ok === true,
    blindBoxAck.participant.points === 3,
    blindBoxAck.participant.lotteryEligible === true,
    lotteryAck.ok === true,
    lotteryAck.draw.studentId === registerAck.participant.studentId,
    typeof lotteryAck.draw.prizeTitle === "string"
  ];

  if (expectations.some((value) => !value)) {
    throw new Error("smoke test assertions failed");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        ideaId: createdIdea.id,
        starredIdeaStars: starredIdea.stars,
        participantPoints: blindBoxAck.participant.points,
        latestCodeTask: latestSubmission.taskId,
        lotteryWinner: lotteryAck.draw.studentId,
        lotteryPrize: lotteryAck.draw.prizeTitle
      },
      null,
      2
    )
  );
} finally {
  mobile.disconnect();
  dashboard.disconnect();
  admin.disconnect();
}
