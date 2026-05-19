import http from "node:http";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import { CODE_TASKS, CONFIG } from "./config.js";
import { moderateText } from "./moderation.js";
import { OpenPixelStore } from "./store.js";
import { canvasToPngBuffer } from "./canvasExport.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CONFIG.clientOrigin
  }
});

const store = new OpenPixelStore(CONFIG);
await store.init();

const activeMobileSockets = new Map();
const activeSocketKeys = new Map();

app.use(
  cors({
    origin: CONFIG.clientOrigin
  })
);
app.use(express.json({ limit: "32kb" }));

const getStats = () => ({
  activeContributors: activeMobileSockets.size,
  totalCommits: store.getTotalCommits(),
  ...store.getParticipantStats(),
  mvpIdea: store.getMvpIdea(),
  lotteryPoolCount: store.getLotteryPool().length
});

const emitStats = () => io.emit("stats:update", getStats());
const emitPrizeState = (prizes = store.getPrizeSummaries()) => {
  io.emit("prizes:updated", prizes);
  io.emit("lotteryPool:updated", store.getLotteryPool());
  io.emit("participants:updated", store.getParticipants());
  emitStats();
};

const shuffleTasks = (tasks) => {
  const nextTasks = [...tasks];
  for (let index = nextTasks.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextTasks[index], nextTasks[swapIndex]] = [nextTasks[swapIndex], nextTasks[index]];
  }
  return nextTasks;
};

const getPublicCodeTasks = ({ randomize = false } = {}) => {
  const tasks = CODE_TASKS.map(({ correctChoiceId: _correctChoiceId, ...task }) => task);
  return randomize ? shuffleTasks(tasks) : tasks;
};

const buildSnapshot = async (deviceId, role) => ({
  topics: store.getTopics(),
  ideas: store.getIdeas(),
  codeTasks: getPublicCodeTasks({ randomize: role === "mobile" }),
  codeSubmissions: role === "dashboard" || role === "admin" ? store.getCodeSubmissions() : undefined,
  canvas: store.getCanvas(),
  stats: getStats(),
  energy: await store.loadEnergy(deviceId),
  starredIdeaIds: await store.getStarredIdeaIds(deviceId),
  participant: store.getParticipantByDevice(deviceId),
  prizes: store.getPrizeSummaries(),
  lotteryPool: role === "dashboard" || role === "admin" ? store.getLotteryPool() : undefined,
  lotteryDraws: role === "dashboard" || role === "admin" ? store.getLotteryDraws() : undefined,
  participants: role === "admin" ? store.getParticipants() : undefined,
  blindBoxShares: role === "admin" ? store.getBlindBoxShares() : undefined
});

const getClientIp = (socket) => {
  const forwarded = socket.handshake.headers["x-forwarded-for"];
  return Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(",")[0]?.trim() || socket.handshake.address;
};

const createSocketError = (reason, data = {}) => {
  const error = new Error(reason);
  error.data = { reason, ...data };
  return error;
};

const isValidDeviceId = (value) => typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value);
const isValidColor = (value) => /^#[0-9a-fA-F]{6}$/.test(value);
const isValidStudentId = (value) => typeof value === "string" && /^\d{6,20}$/.test(value);
const isValidTopicTitle = (value) =>
  typeof value === "string" && value.trim().length > 0 && value.trim().length <= 30;
const isValidPrizeId = (value) => typeof value === "string" && /^[a-zA-Z0-9_-]{2,80}$/.test(value);
const isValidPrizeThreshold = (value) =>
  value === null || (Number.isInteger(value) && value >= 0 && value <= 99);
const isValidPrizeStock = (value) =>
  value === null || (Number.isInteger(value) && value >= 0 && value <= 100000);
const isValidPrizeDraft = (prize, { requireId = false } = {}) =>
  prize &&
  (!requireId || isValidPrizeId(prize.id)) &&
  typeof prize.title === "string" &&
  prize.title.trim().length > 0 &&
  prize.title.trim().length <= 50 &&
  typeof prize.description === "string" &&
  prize.description.trim().length > 0 &&
  prize.description.trim().length <= 120 &&
  isValidPrizeThreshold(prize.threshold) &&
  isValidPrizeStock(prize.totalStock) &&
  typeof prize.drawEnabled === "boolean";
const isValidPrizePayload = (prizes) =>
  Array.isArray(prizes) &&
  prizes.length <= 50 &&
  new Set(prizes.map((prize) => prize.id)).size === prizes.length &&
  prizes.every((prize) => isValidPrizeDraft(prize, { requireId: true }));

const getParticipantOrAck = (deviceId, ack) => {
  const participant = store.getParticipantByDevice(deviceId);
  if (!participant) {
    ack({ ok: false, reason: "REGISTRATION_REQUIRED" });
    return null;
  }
  return participant;
};

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    storage: store.usingRedis ? "redis" : "file"
  });
});

app.get("/api/export/ideas", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", 'attachment; filename="ideas.json"');
  res.send(JSON.stringify(store.getIdeas(), null, 2));
});

app.get("/api/export/canvas", (_req, res) => {
  const buffer = canvasToPngBuffer(store.getCanvas(), CONFIG.canvasSize);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", 'attachment; filename="canvas_output.png"');
  res.send(buffer);
});

app.get("/api/export/code-submissions", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", 'attachment; filename="code_submissions.json"');
  res.send(JSON.stringify(store.getCodeSubmissions(), null, 2));
});

app.get("/api/export/participants", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", 'attachment; filename="participants.json"');
  res.send(JSON.stringify(store.getParticipants(), null, 2));
});

app.get("/api/export/blind-box-shares", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", 'attachment; filename="blind_box_shares.json"');
  res.send(JSON.stringify(store.getBlindBoxShares(), null, 2));
});

app.get("/api/export/lottery", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", 'attachment; filename="lottery_draws.json"');
  res.send(JSON.stringify(store.getLotteryDraws(), null, 2));
});

io.use(async (socket, next) => {
  const { deviceId, role, adminToken } = socket.handshake.auth ?? {};
  if (!isValidDeviceId(deviceId)) {
    next(new Error("INVALID_DEVICE_ID"));
    return;
  }

  socket.data.deviceId = deviceId;
  socket.data.clientIp = getClientIp(socket);
  if (role === "admin") {
    const authKey = `ip:${socket.data.clientIp}`;
    const authStatus = store.getAdminAuthStatus(authKey);
    if (authStatus.banned) {
      next(createSocketError("ADMIN_AUTH_BANNED", authStatus));
      return;
    }

    if (!CONFIG.adminToken || adminToken !== CONFIG.adminToken) {
      const failureStatus = await store.recordAdminAuthFailure(authKey);
      next(
        createSocketError(
          failureStatus.banned ? "ADMIN_AUTH_BANNED" : "INVALID_ADMIN_TOKEN",
          failureStatus
        )
      );
      return;
    }

    await store.clearAdminAuthState(authKey);
    socket.data.role = "admin";
  } else {
    socket.data.role = role === "dashboard" ? "dashboard" : "mobile";
  }
  next();
});

io.on("connection", async (socket) => {
  const { deviceId, role } = socket.data;
  const socketKey = role === "mobile" ? deviceId : `${role}:${deviceId}`;

  const previousSocketId = activeSocketKeys.get(socketKey);
  if (previousSocketId) {
    io.sockets.sockets.get(previousSocketId)?.disconnect(true);
  }
  activeSocketKeys.set(socketKey, socket.id);

  if (role === "mobile") {
    activeMobileSockets.set(deviceId, socket.id);
    emitStats();
  }

  socket.emit("snapshot", await buildSnapshot(deviceId, role));

  socket.on("participant:register", async (payload = {}, ack = () => {}) => {
    const studentId = typeof payload.studentId === "string" ? payload.studentId.trim() : "";
    if (!isValidStudentId(studentId)) {
      ack({ ok: false, reason: "INVALID_STUDENT_ID" });
      return;
    }

    const participant = await store.registerParticipant({
      studentId,
      deviceId,
      createdAt: new Date().toISOString()
    });

    io.emit("participant:updated", participant);
    emitStats();
    ack({ ok: true, participant });
  });

  socket.on("idea:create", async (payload = {}, ack = () => {}) => {
    const participant = getParticipantOrAck(deviceId, ack);
    if (!participant) {
      return;
    }

    const now = Date.now();
    const mutedUntil = await store.getMutedUntil(deviceId);
    if (mutedUntil > now) {
      ack({ ok: false, reason: "MUTED", mutedUntil });
      return;
    }

    const topicExists = store.getTopics().some((topic) => topic.id === payload.topicId);
    const rawText = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!topicExists || rawText.length === 0 || rawText.length > 50) {
      ack({ ok: false, reason: "INVALID_IDEA" });
      return;
    }

    const moderation = moderateText(rawText, CONFIG.sensitiveWords);
    if (moderation.flagged) {
      const nextMutedUntil = now + CONFIG.muteDurationMs;
      await store.muteDevice(deviceId, nextMutedUntil);
      ack({
        ok: false,
        reason: "MODERATED",
        mutedUntil: nextMutedUntil,
        sanitizedText: moderation.sanitizedText
      });
      return;
    }

    const idea = await store.createIdea({
      topicId: payload.topicId,
      text: moderation.sanitizedText,
      deviceId,
      studentId: participant.studentId,
      createdAt: new Date(now).toISOString()
    });
    const nextParticipant = await store.updateParticipant(participant.studentId, (draft) => {
      draft.ideaCount += 1;
    });

    io.emit("idea:created", idea);
    io.emit("participant:updated", nextParticipant);
    emitStats();
    ack({ ok: true, idea, participant: nextParticipant });
  });

  socket.on("topic:create", async (payload = {}, ack = () => {}) => {
    if (role !== "admin") {
      ack({ ok: false, reason: "FORBIDDEN" });
      return;
    }

    if (!isValidTopicTitle(payload.title)) {
      ack({ ok: false, reason: "INVALID_TOPIC" });
      return;
    }

    const topics = await store.createTopic({ title: payload.title });
    io.emit("topics:updated", topics);
    ack({ ok: true, topics });
  });

  socket.on("topic:update", async (payload = {}, ack = () => {}) => {
    if (role !== "admin") {
      ack({ ok: false, reason: "FORBIDDEN" });
      return;
    }

    if (typeof payload.id !== "string" || !isValidTopicTitle(payload.title)) {
      ack({ ok: false, reason: "INVALID_TOPIC" });
      return;
    }

    const result = await store.updateTopic({ id: payload.id, title: payload.title });
    if (result.ok) {
      io.emit("topics:updated", result.topics);
    }
    ack(result);
  });

  socket.on("topic:delete", async (payload = {}, ack = () => {}) => {
    if (role !== "admin") {
      ack({ ok: false, reason: "FORBIDDEN" });
      return;
    }

    if (typeof payload.id !== "string") {
      ack({ ok: false, reason: "INVALID_TOPIC" });
      return;
    }

    const result = await store.deleteTopic({ id: payload.id });
    if (result.ok) {
      io.emit("topics:updated", result.topics);
    }
    ack(result);
  });

  socket.on("idea:star", async (payload = {}, ack = () => {}) => {
    const result = await store.starIdea({
      ideaId: payload.ideaId,
      deviceId
    });

    if (!result.ok) {
      ack(result);
      return;
    }

    io.emit("idea:starred", result.idea);
    ack({ ok: true, idea: result.idea });
  });

  socket.on("pixel:paint", async (payload = {}, ack = () => {}) => {
    const participant = getParticipantOrAck(deviceId, ack);
    if (!participant) {
      return;
    }

    const { x, y, color } = payload;
    const coordinatesValid =
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      y >= 0 &&
      x < CONFIG.canvasSize &&
      y < CONFIG.canvasSize;

    if (!coordinatesValid || !isValidColor(color)) {
      ack({ ok: false, reason: "INVALID_PIXEL" });
      return;
    }

    const energyResult = await store.consumeEnergy(deviceId);
    if (!energyResult.ok) {
      ack({ ok: false, reason: "NO_ENERGY", energy: energyResult.energy });
      return;
    }

    const event = await store.paintPixel({
      x,
      y,
      color,
      deviceId,
      studentId: participant.studentId,
      createdAt: new Date().toISOString()
    });
    const nextParticipant = await store.updateParticipant(participant.studentId, (draft) => {
      draft.pixelCount += 1;
      if (event.conflict) {
        draft.conflictCount += 1;
      }
    });

    io.emit("pixel:painted", event);
    io.emit("participant:updated", nextParticipant);
    emitStats();
    ack({
      ok: true,
      event,
      energy: energyResult.energy,
      participant: nextParticipant
    });
  });

  socket.on("code:submit", async (payload = {}, ack = () => {}) => {
    const participant = getParticipantOrAck(deviceId, ack);
    if (!participant) {
      return;
    }

    const task = CODE_TASKS.find((candidate) => candidate.id === payload.taskId);
    if (!task || typeof payload.choiceId !== "string") {
      ack({ ok: false, reason: "INVALID_CODE_TASK" });
      return;
    }

    if (payload.choiceId !== task.correctChoiceId) {
      ack({ ok: false, reason: "TEST_FAILED" });
      return;
    }

    const result = await store.completeCodeTask({
      taskId: task.id,
      taskTitle: task.title,
      language: task.language,
      filePath: task.filePath,
      resultLabel: task.resultLabel,
      deviceId,
      studentId: participant.studentId,
      createdAt: new Date().toISOString()
    });

    if (!result.ok) {
      ack(result);
      return;
    }

    io.emit("code:completed", result.submission);
    io.emit("participant:updated", result.participant);
    emitStats();
    ack(result);
  });

  socket.on("blindbox:share", async (payload = {}, ack = () => {}) => {
    const participant = getParticipantOrAck(deviceId, ack);
    if (!participant) {
      return;
    }

    const now = Date.now();
    const mutedUntil = await store.getMutedUntil(deviceId);
    if (mutedUntil > now) {
      ack({ ok: false, reason: "MUTED", mutedUntil });
      return;
    }

    const rawText = typeof payload.text === "string" ? payload.text.trim() : "";
    if (rawText.length === 0 || rawText.length > 80) {
      ack({ ok: false, reason: "INVALID_SHARE" });
      return;
    }

    const moderation = moderateText(rawText, CONFIG.sensitiveWords);
    if (moderation.flagged) {
      const nextMutedUntil = now + CONFIG.muteDurationMs;
      await store.muteDevice(deviceId, nextMutedUntil);
      ack({
        ok: false,
        reason: "MODERATED",
        mutedUntil: nextMutedUntil,
        sanitizedText: moderation.sanitizedText
      });
      return;
    }

    const result = await store.recordBlindBoxShare({
      studentId: participant.studentId,
      deviceId,
      text: moderation.sanitizedText,
      createdAt: new Date(now).toISOString()
    });

    if (!result.ok) {
      ack(result);
      return;
    }

    io.emit("blindbox:shared", result.share);
    io.emit("participant:updated", result.participant);
    emitStats();
    ack(result);
  });

  socket.on("energy:refresh", async (_payload = {}, ack = () => {}) => {
    ack({
      ok: true,
      energy: await store.loadEnergy(deviceId)
    });
  });

  socket.on("prizes:update", async (payload = {}, ack = () => {}) => {
    if (role !== "admin") {
      ack({ ok: false, reason: "FORBIDDEN" });
      return;
    }

    if (!isValidPrizePayload(payload.prizes)) {
      ack({ ok: false, reason: "INVALID_PRIZES" });
      return;
    }

    const prizes = await store.updatePrizes(payload.prizes);
    emitPrizeState(prizes);
    ack({ ok: true, prizes });
  });

  socket.on("prize:create", async (payload = {}, ack = () => {}) => {
    if (role !== "admin") {
      ack({ ok: false, reason: "FORBIDDEN" });
      return;
    }

    if (!isValidPrizeDraft(payload)) {
      ack({ ok: false, reason: "INVALID_PRIZE" });
      return;
    }

    const prizes = await store.createPrize({
      title: payload.title,
      description: payload.description,
      threshold: payload.threshold,
      totalStock: payload.totalStock,
      drawEnabled: payload.drawEnabled
    });
    emitPrizeState(prizes);
    ack({ ok: true, prizes });
  });

  socket.on("prize:delete", async (payload = {}, ack = () => {}) => {
    if (role !== "admin") {
      ack({ ok: false, reason: "FORBIDDEN" });
      return;
    }

    if (!isValidPrizeId(payload.id)) {
      ack({ ok: false, reason: "INVALID_PRIZE" });
      return;
    }

    const result = await store.deletePrize({ id: payload.id });
    if (result.ok) {
      emitPrizeState(result.prizes);
    }
    ack(result);
  });

  socket.on("participant:redeem", async (payload = {}, ack = () => {}) => {
    if (role !== "admin") {
      ack({ ok: false, reason: "FORBIDDEN" });
      return;
    }

    if (!isValidStudentId(payload.studentId) || !isValidPrizeId(payload.prizeId)) {
      ack({ ok: false, reason: "INVALID_REDEMPTION" });
      return;
    }

    const result = await store.redeemPrize({
      studentId: payload.studentId,
      prizeId: payload.prizeId,
      redeemedAt: new Date().toISOString()
    });

    if (result.ok) {
      io.emit("participant:updated", result.participant);
      emitPrizeState();
    }

    ack(result);
  });

  socket.on("lottery:draw", async (payload = {}, ack = () => {}) => {
    if (role !== "admin") {
      ack({ ok: false, reason: "FORBIDDEN" });
      return;
    }

    if (!isValidStudentId(payload.studentId)) {
      ack({ ok: false, reason: "INVALID_STUDENT_ID" });
      return;
    }

    const result = await store.drawLottery({
      studentId: payload.studentId,
      drawnAt: new Date().toISOString()
    });
    if (result.ok) {
      io.emit("lottery:drawn", result.draw);
      io.emit("participant:updated", result.participant);
      io.emit("prizes:updated", result.prizes);
      io.emit("lotteryPool:updated", result.pool);
      io.emit("participants:updated", store.getParticipants());
      emitStats();
    }

    ack({
      ...result,
      pool: store.getLotteryPool(),
      draws: store.getLotteryDraws()
    });
  });

  socket.on("disconnect", () => {
    if (activeSocketKeys.get(socketKey) === socket.id) {
      activeSocketKeys.delete(socketKey);
    }

    if (role === "mobile" && activeMobileSockets.get(deviceId) === socket.id) {
      activeMobileSockets.delete(deviceId);
      emitStats();
    }
  });
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `[server] port ${CONFIG.port} is already in use. Another OpenPixel backend is probably still running.`
    );
    console.error(`[server] stop the old process first, or start with another PORT value.`);
    process.exit(1);
    return;
  }

  throw error;
});

server.listen(CONFIG.port, () => {
  console.log(`[server] listening on :${CONFIG.port}`);
  if (CONFIG.adminToken) {
    console.log(`[server] admin token: ${CONFIG.adminToken}`);
  } else {
    console.warn("[server] ADMIN_TOKEN not set; admin and lottery screens cannot be unlocked.");
  }
});

const shutdown = async () => {
  await store.shutdown();
  io.close(() => {
    server.close(() => process.exit(0));
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
