import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "redis";
import { randomUUID } from "node:crypto";
import { DEFAULT_PRIZES, DEFAULT_TOPICS } from "./config.js";

const STATE_KEYS = {
  topics: "openpixel:topics",
  ideas: "openpixel:ideas",
  pixels: "openpixel:pixels",
  pixelEvents: "openpixel:pixel-events",
  codeSubmissions: "openpixel:code-submissions",
  participants: "openpixel:participants",
  deviceStudents: "openpixel:device-students",
  blindBoxShares: "openpixel:blind-box-shares",
  prizes: "openpixel:prizes",
  lotteryDraws: "openpixel:lottery-draws",
  adminAuthStates: "openpixel:admin-auth-states",
  tokenPrefix: "openpixel:token:",
  mutePrefix: "openpixel:mute:",
  starPrefix: "openpixel:stars:"
};

const toInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const PRIZE_ID_PATTERN = /^[a-zA-Z0-9_-]{2,80}$/;

const normalizeNullableInteger = (value, fallback = null) => {
  if (value === null || value === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
};

const normalizePrize = (prize = {}, fallback = {}) => ({
  id: String(prize.id ?? fallback.id ?? "").trim(),
  title: String(prize.title ?? fallback.title ?? "").trim(),
  description: String(prize.description ?? fallback.description ?? "").trim(),
  threshold: normalizeNullableInteger(prize.threshold, fallback.threshold ?? null),
  totalStock: normalizeNullableInteger(prize.totalStock, fallback.totalStock ?? null),
  drawEnabled:
    typeof prize.drawEnabled === "boolean" ? prize.drawEnabled : fallback.drawEnabled === true
});

const normalizePrizes = (prizes, { seedDefaults = false } = {}) => {
  const source = Array.isArray(prizes) ? prizes : [];
  const initialPrizes = source.length > 0 || !seedDefaults ? source : DEFAULT_PRIZES;
  const defaultById = new Map(DEFAULT_PRIZES.map((prize) => [prize.id, prize]));
  const seenPrizeIds = new Set();

  return initialPrizes
    .map((prize) => {
      const rawId = String(prize?.id ?? "").trim();
      const fallback = defaultById.get(rawId) ?? {};
      const isLegacyPrize = prize && typeof prize.drawEnabled !== "boolean";
      return normalizePrize(
        {
          ...prize,
          description: isLegacyPrize ? fallback.description ?? prize.description : prize.description,
          drawEnabled: isLegacyPrize ? fallback.drawEnabled : prize.drawEnabled
        },
        fallback
      );
    })
    .filter((prize) => {
      if (
        !PRIZE_ID_PATTERN.test(prize.id) ||
        seenPrizeIds.has(prize.id) ||
        prize.title.length === 0 ||
        prize.description.length === 0
      ) {
        return false;
      }
      seenPrizeIds.add(prize.id);
      return true;
    });
};

const normalizeTopics = (topics = []) => {
  const normalized = topics
    .filter((topic) => typeof topic?.id === "string" && typeof topic?.title === "string")
    .map((topic) => ({
      id: topic.id.trim(),
      title: topic.title.trim()
    }))
    .filter((topic) => /^[a-zA-Z0-9_-]{2,80}$/.test(topic.id) && topic.title.length > 0);

  return normalized.length > 0 ? normalized : DEFAULT_TOPICS;
};

const normalizeLotteryDraw = (draw) => ({
  ...draw,
  prizeId: draw.prizeId ?? "grand",
  prizeTitle: draw.prizeTitle ?? "终极大奖"
});

const normalizeAdminAuthState = (state = {}) => ({
  failureCount: toInt(state.failureCount, 0),
  lastFailedAt: toInt(state.lastFailedAt, 0),
  bannedUntil: toInt(state.bannedUntil, 0)
});

const normalizeCodeSubmission = (submission) => ({
  language: "JavaScript",
  ...submission
});

const createParticipant = (studentId, createdAt) => ({
  studentId,
  ideaCount: 0,
  pixelCount: 0,
  conflictCount: 0,
  codeSubmissionCount: 0,
  completedCodeTaskIds: [],
  blindBoxParticipated: false,
  createdAt,
  lastActiveAt: createdAt,
  redemptions: {}
});

const normalizeParticipant = (participant) => {
  const legacyRedemptions = {};
  if (participant.redemptions?.stickerAt) {
    legacyRedemptions.sticker = participant.redemptions.stickerAt;
  }
  if (participant.redemptions?.badgeAt) {
    legacyRedemptions.badge = participant.redemptions.badgeAt;
  }

  return {
    ...createParticipant(participant.studentId, participant.createdAt),
    ...participant,
    redemptions: {
      ...legacyRedemptions,
      ...Object.fromEntries(
        Object.entries(participant.redemptions ?? {}).filter(([key]) => !key.endsWith("At"))
      )
    }
  };
};

export class OpenPixelStore {
  constructor(config) {
    this.config = config;
    this.redis = null;
    this.topics = normalizeTopics(DEFAULT_TOPICS);
    this.ideas = [];
    this.canvas = Array.from({ length: config.canvasSize ** 2 }, () => "#ffffff");
    this.pixelEvents = [];
    this.codeSubmissions = [];
    this.tokens = new Map();
    this.mutes = new Map();
    this.starredByIdea = new Map();
    this.participants = new Map();
    this.deviceStudents = new Map();
    this.blindBoxShares = [];
    this.prizes = normalizePrizes(DEFAULT_PRIZES, { seedDefaults: true });
    this.lotteryDraws = [];
    this.adminAuthStates = new Map();
    this.usingRedis = false;
  }

  async init() {
    if (!this.config.redisUrl) {
      await this.loadFromFile();
      console.warn("[store] REDIS_URL not set; using file-backed local storage");
      return;
    }

    try {
      this.redis = createClient({ url: this.config.redisUrl });
      this.redis.on("error", (error) => console.error("[redis]", error.message));
      await this.redis.connect();
      this.usingRedis = true;
      await this.loadFromRedis();
      console.log("[store] connected to redis");
    } catch (error) {
      console.warn(`[store] redis unavailable, falling back to file storage: ${error.message}`);
      this.redis = null;
      this.usingRedis = false;
      await this.loadFromFile();
    }
  }

  async loadFromRedis() {
    const [
      ideas,
      topics,
      pixels,
      pixelEvents,
      codeSubmissions,
      participants,
      deviceStudents,
      blindBoxShares,
      prizes,
      lotteryDraws,
      adminAuthStates
    ] =
      await Promise.all([
        this.redis.lRange(STATE_KEYS.ideas, 0, -1),
        this.redis.get(STATE_KEYS.topics),
        this.redis.hGetAll(STATE_KEYS.pixels),
        this.redis.lRange(STATE_KEYS.pixelEvents, 0, -1),
        this.redis.lRange(STATE_KEYS.codeSubmissions, 0, -1),
        this.redis.hGetAll(STATE_KEYS.participants),
        this.redis.hGetAll(STATE_KEYS.deviceStudents),
        this.redis.lRange(STATE_KEYS.blindBoxShares, 0, -1),
        this.redis.get(STATE_KEYS.prizes),
        this.redis.lRange(STATE_KEYS.lotteryDraws, 0, -1),
        this.redis.hGetAll(STATE_KEYS.adminAuthStates)
      ]);

    this.ideas = ideas.map((item) => JSON.parse(item));
    this.topics = normalizeTopics(topics ? JSON.parse(topics) : DEFAULT_TOPICS);
    Object.entries(pixels).forEach(([index, color]) => {
      this.canvas[toInt(index)] = color;
    });
    this.pixelEvents = pixelEvents.map((item) => JSON.parse(item));
    this.codeSubmissions = codeSubmissions.map((item) => normalizeCodeSubmission(JSON.parse(item)));
    this.participants = new Map(
      Object.entries(participants).map(([studentId, raw]) => [
        studentId,
        normalizeParticipant(JSON.parse(raw))
      ])
    );
    this.deviceStudents = new Map(Object.entries(deviceStudents));
    this.blindBoxShares = blindBoxShares.map((item) => JSON.parse(item));
    this.prizes = normalizePrizes(prizes ? JSON.parse(prizes) : undefined, { seedDefaults: !prizes });
    this.lotteryDraws = lotteryDraws.map((item) => normalizeLotteryDraw(JSON.parse(item)));
    this.adminAuthStates = new Map(
      Object.entries(adminAuthStates).map(([authKey, raw]) => [
        authKey,
        normalizeAdminAuthState(JSON.parse(raw))
      ])
    );

    for (const idea of this.ideas) {
      const starred = await this.redis.sMembers(`${STATE_KEYS.starPrefix}${idea.id}`);
      this.starredByIdea.set(idea.id, new Set(starred));
    }
  }

  async loadFromFile() {
    try {
      const raw = await fs.readFile(this.config.runtimeStatePath, "utf8");
      const state = JSON.parse(raw);
      this.topics = normalizeTopics(state.topics ?? DEFAULT_TOPICS);
      this.ideas = state.ideas ?? [];
      this.canvas =
        Array.isArray(state.canvas) && state.canvas.length === this.config.canvasSize ** 2
          ? state.canvas
          : this.canvas;
      this.pixelEvents = state.pixelEvents ?? [];
      this.codeSubmissions = (state.codeSubmissions ?? []).map(normalizeCodeSubmission);
      this.tokens = new Map(state.tokens ?? []);
      this.mutes = new Map(state.mutes ?? []);
      this.starredByIdea = new Map(
        Object.entries(state.starredByIdea ?? {}).map(([ideaId, deviceIds]) => [
          ideaId,
          new Set(deviceIds)
        ])
      );
      this.participants = new Map(
        Object.entries(state.participants ?? {}).map(([studentId, participant]) => [
          studentId,
          normalizeParticipant(participant)
        ])
      );
      this.deviceStudents = new Map(Object.entries(state.deviceStudents ?? {}));
      this.blindBoxShares = state.blindBoxShares ?? [];
      this.prizes = normalizePrizes(state.prizes, { seedDefaults: !Array.isArray(state.prizes) });
      this.lotteryDraws = (state.lotteryDraws ?? []).map(normalizeLotteryDraw);
      this.adminAuthStates = new Map(
        Object.entries(state.adminAuthStates ?? {}).map(([authKey, authState]) => [
          authKey,
          normalizeAdminAuthState(authState)
        ])
      );
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn(`[store] failed to read local state: ${error.message}`);
      }
    }
  }

  async persistFallback() {
    if (this.redis) {
      return;
    }

    const state = {
      topics: this.topics,
      ideas: this.ideas,
      canvas: this.canvas,
      pixelEvents: this.pixelEvents,
      codeSubmissions: this.codeSubmissions,
      tokens: [...this.tokens.entries()],
      mutes: [...this.mutes.entries()],
      starredByIdea: Object.fromEntries(
        [...this.starredByIdea.entries()].map(([ideaId, devices]) => [ideaId, [...devices]])
      ),
      participants: Object.fromEntries(this.participants),
      deviceStudents: Object.fromEntries(this.deviceStudents),
      blindBoxShares: this.blindBoxShares,
      prizes: this.prizes,
      lotteryDraws: this.lotteryDraws,
      adminAuthStates: Object.fromEntries(this.adminAuthStates)
    };

    await fs.mkdir(path.dirname(this.config.runtimeStatePath), { recursive: true });
    await fs.writeFile(this.config.runtimeStatePath, JSON.stringify(state, null, 2));
  }

  async shutdown() {
    if (this.redis) {
      await this.redis.quit();
    } else {
      await this.persistFallback();
    }
  }

  getIdeas() {
    return this.ideas;
  }

  getTopics() {
    return this.topics;
  }

  getCanvas() {
    return this.canvas;
  }

  getTotalCommits() {
    return this.codeSubmissions.length;
  }

  getCodeSubmissions() {
    return this.codeSubmissions;
  }

  getBlindBoxShares() {
    return this.blindBoxShares;
  }

  getLotteryDraws() {
    return this.lotteryDraws;
  }

  getAdminAuthStatus(authKey, now = Date.now()) {
    const savedState = normalizeAdminAuthState(this.adminAuthStates.get(authKey));
    const withinFailureWindow =
      savedState.lastFailedAt > 0 &&
      now - savedState.lastFailedAt <= this.config.adminAuthFailureWindowMs;
    const failureCount = withinFailureWindow ? savedState.failureCount : 0;
    const banned = savedState.bannedUntil > now;

    return {
      banned,
      bannedUntil: banned ? savedState.bannedUntil : 0,
      failedAttempts: failureCount,
      remainingAttempts: Math.max(0, this.config.adminAuthMaxFailures - failureCount)
    };
  }

  async recordAdminAuthFailure(authKey, now = Date.now()) {
    const currentStatus = this.getAdminAuthStatus(authKey, now);
    if (currentStatus.banned) {
      return currentStatus;
    }

    const nextFailureCount = currentStatus.failedAttempts + 1;
    const banned = nextFailureCount >= this.config.adminAuthMaxFailures;
    const nextState = {
      failureCount: Math.min(nextFailureCount, this.config.adminAuthMaxFailures),
      lastFailedAt: now,
      bannedUntil: banned ? now + this.config.adminAuthBanDurationMs : 0
    };
    this.adminAuthStates.set(authKey, nextState);

    if (this.redis) {
      await this.redis.hSet(STATE_KEYS.adminAuthStates, authKey, JSON.stringify(nextState));
    } else {
      await this.persistFallback();
    }

    return this.getAdminAuthStatus(authKey, now);
  }

  async clearAdminAuthState(authKey) {
    if (!this.adminAuthStates.has(authKey)) {
      return;
    }

    this.adminAuthStates.delete(authKey);
    if (this.redis) {
      await this.redis.hDel(STATE_KEYS.adminAuthStates, authKey);
    } else {
      await this.persistFallback();
    }
  }

  getLotteryPool() {
    const drawnStudentIds = new Set(this.lotteryDraws.map((draw) => draw.studentId));
    return this.getParticipants().filter(
      (participant) => participant.lotteryEligible && !drawnStudentIds.has(participant.studentId)
    );
  }

  getDrawablePrizeOptionsForPoints(points) {
    const awardedCountByPrizeId = new Map();
    this.lotteryDraws.forEach((draw) => {
      awardedCountByPrizeId.set(draw.prizeId, (awardedCountByPrizeId.get(draw.prizeId) ?? 0) + 1);
    });

    return this.prizes
      .map((prize) => {
        const awardedCount = awardedCountByPrizeId.get(prize.id) ?? 0;
        return {
          ...prize,
          awardedCount,
          remaining:
            Number.isInteger(prize.totalStock) && prize.totalStock >= 0
              ? Math.max(0, prize.totalStock - awardedCount)
              : null
        };
      })
      .filter(
        (prize) =>
          prize.drawEnabled &&
          Number.isInteger(prize.threshold) &&
          points >= prize.threshold &&
          (prize.remaining === null || prize.remaining > 0)
      );
  }

  getMvpIdea() {
    return (
      [...this.ideas]
        .filter((idea) => idea.studentId)
        .sort((left, right) => {
          if (right.stars !== left.stars) {
            return right.stars - left.stars;
          }
          return left.createdAt.localeCompare(right.createdAt);
        })[0] ?? null
    );
  }

  summarizeParticipant(participant) {
    if (!participant) {
      return null;
    }

    const points =
      participant.ideaCount +
      Math.floor(participant.codeSubmissionCount / 5) +
      (participant.blindBoxParticipated ? 1 : 0);
    const drawnPrize = this.lotteryDraws.find((draw) => draw.studentId === participant.studentId) ?? null;

    return {
      ...participant,
      points,
      stickerEligible: points >= 2,
      badgeEligible: points >= 3,
      grandEligible: points >= 3,
      lotteryEligible: this.getDrawablePrizeOptionsForPoints(points).length > 0,
      drawnPrize,
      nextCodePointAt: Math.ceil((participant.codeSubmissionCount + 1) / 5) * 5
    };
  }

  getParticipants() {
    return [...this.participants.values()]
      .map((participant) => this.summarizeParticipant(participant))
      .sort((left, right) => left.studentId.localeCompare(right.studentId));
  }

  getParticipantStats() {
    const participants = this.getParticipants();
    return {
      totalParticipants: participants.length,
      stickerEligibleCount: participants.filter((participant) => participant.stickerEligible).length,
      badgeEligibleCount: participants.filter((participant) => participant.badgeEligible).length,
      lotteryEligibleCount: participants.filter((participant) => participant.lotteryEligible).length,
      lotteryDrawnCount: this.lotteryDraws.length
    };
  }

  getPrizeSummaries() {
    return this.prizes.map((prize) => {
      const awardedCount = this.lotteryDraws.filter((draw) => draw.prizeId === prize.id).length;
      const redeemedCount = this.getParticipants().filter(
        (participant) => participant.redemptions[prize.id]
      ).length;
      return {
        ...prize,
        awardedCount,
        redeemedCount,
        remaining:
          Number.isInteger(prize.totalStock) && prize.totalStock >= 0
            ? Math.max(0, prize.totalStock - awardedCount)
            : null
      };
    });
  }

  async getStarredIdeaIds(deviceId) {
    return this.ideas
      .filter((idea) => this.starredByIdea.get(idea.id)?.has(deviceId))
      .map((idea) => idea.id);
  }

  async registerParticipant({ studentId, deviceId, createdAt }) {
    const participant = this.participants.get(studentId) ?? createParticipant(studentId, createdAt);
    participant.lastActiveAt = createdAt;
    this.participants.set(studentId, participant);
    this.deviceStudents.set(deviceId, studentId);

    if (this.redis) {
      await Promise.all([
        this.redis.hSet(STATE_KEYS.participants, studentId, JSON.stringify(participant)),
        this.redis.hSet(STATE_KEYS.deviceStudents, deviceId, studentId)
      ]);
    } else {
      await this.persistFallback();
    }

    return this.summarizeParticipant(participant);
  }

  getStudentIdByDevice(deviceId) {
    return this.deviceStudents.get(deviceId) ?? null;
  }

  getParticipantByDevice(deviceId) {
    const studentId = this.getStudentIdByDevice(deviceId);
    return studentId ? this.summarizeParticipant(this.participants.get(studentId)) : null;
  }

  async updateParticipant(studentId, updater) {
    const participant = this.participants.get(studentId);
    if (!participant) {
      return null;
    }

    updater(participant);
    participant.lastActiveAt = new Date().toISOString();

    if (this.redis) {
      await this.redis.hSet(STATE_KEYS.participants, studentId, JSON.stringify(participant));
    } else {
      await this.persistFallback();
    }

    return this.summarizeParticipant(participant);
  }

  async createIdea({ topicId, text, deviceId, studentId, createdAt }) {
    const idea = {
      id: randomUUID(),
      topicId,
      text,
      stars: 0,
      deviceId,
      studentId,
      createdAt
    };

    this.ideas.push(idea);

    if (this.redis) {
      await this.redis.rPush(STATE_KEYS.ideas, JSON.stringify(idea));
    } else {
      await this.persistFallback();
    }

    return idea;
  }

  async starIdea({ ideaId, deviceId }) {
    const idea = this.ideas.find((candidate) => candidate.id === ideaId);
    if (!idea) {
      return { ok: false, reason: "IDEA_NOT_FOUND" };
    }

    const starred = this.starredByIdea.get(ideaId) ?? new Set();
    if (starred.has(deviceId)) {
      return { ok: false, reason: "ALREADY_STARRED", idea };
    }

    starred.add(deviceId);
    this.starredByIdea.set(ideaId, starred);
    idea.stars += 1;

    if (this.redis) {
      await Promise.all([
        this.redis.sAdd(`${STATE_KEYS.starPrefix}${ideaId}`, deviceId),
        this.rewriteIdeas()
      ]);
    } else {
      await this.persistFallback();
    }

    return { ok: true, idea };
  }

  async persistTopics() {
    if (this.redis) {
      await this.redis.set(STATE_KEYS.topics, JSON.stringify(this.topics));
    } else {
      await this.persistFallback();
    }
  }

  async createTopic({ title }) {
    const topic = {
      id: `topic-${randomUUID().slice(0, 8)}`,
      title: title.trim()
    };
    this.topics.push(topic);
    await this.persistTopics();
    return this.getTopics();
  }

  async updateTopic({ id, title }) {
    const topic = this.topics.find((candidate) => candidate.id === id);
    if (!topic) {
      return { ok: false, reason: "TOPIC_NOT_FOUND" };
    }

    topic.title = title.trim();
    await this.persistTopics();
    return { ok: true, topics: this.getTopics() };
  }

  async deleteTopic({ id }) {
    const topic = this.topics.find((candidate) => candidate.id === id);
    if (!topic) {
      return { ok: false, reason: "TOPIC_NOT_FOUND" };
    }

    const used = this.ideas.some((idea) => idea.topicId === id);
    if (used) {
      return { ok: false, reason: "TOPIC_IN_USE", topics: this.getTopics() };
    }

    this.topics = this.topics.filter((candidate) => candidate.id !== id);
    if (this.topics.length === 0) {
      this.topics = normalizeTopics(DEFAULT_TOPICS);
    }
    await this.persistTopics();
    return { ok: true, topics: this.getTopics() };
  }

  async rewriteIdeas() {
    if (!this.redis) {
      return;
    }

    const multi = this.redis.multi();
    multi.del(STATE_KEYS.ideas);
    this.ideas.forEach((idea) => multi.rPush(STATE_KEYS.ideas, JSON.stringify(idea)));
    await multi.exec();
  }

  getEnergy(deviceId, now = Date.now()) {
    const current = this.tokens.get(deviceId) ?? {
      tokens: this.config.tokenCapacity,
      lastRefillAt: now
    };
    const elapsed = Math.max(0, now - current.lastRefillAt);
    const recovered = Math.floor(elapsed / this.config.tokenRefillMs);

    if (recovered <= 0) {
      return {
        tokens: current.tokens,
        lastRefillAt: current.lastRefillAt,
        nextRefillAt:
          current.tokens >= this.config.tokenCapacity
            ? null
            : current.lastRefillAt + this.config.tokenRefillMs
      };
    }

    const tokens = Math.min(this.config.tokenCapacity, current.tokens + recovered);
    const lastRefillAt =
      tokens >= this.config.tokenCapacity
        ? now
        : current.lastRefillAt + recovered * this.config.tokenRefillMs;

    this.tokens.set(deviceId, { tokens, lastRefillAt });

    return {
      tokens,
      lastRefillAt,
      nextRefillAt:
        tokens >= this.config.tokenCapacity ? null : lastRefillAt + this.config.tokenRefillMs
    };
  }

  async consumeEnergy(deviceId, now = Date.now()) {
    const energy = this.getEnergy(deviceId, now);
    if (energy.tokens <= 0) {
      return {
        ok: false,
        energy
      };
    }

    const nextState = {
      tokens: energy.tokens - 1,
      lastRefillAt: energy.lastRefillAt
    };
    this.tokens.set(deviceId, nextState);

    if (this.redis) {
      await this.redis.hSet(`${STATE_KEYS.tokenPrefix}${deviceId}`, {
        tokens: nextState.tokens,
        lastRefillAt: nextState.lastRefillAt
      });
    } else {
      await this.persistFallback();
    }

    return {
      ok: true,
      energy: {
        tokens: nextState.tokens,
        lastRefillAt: nextState.lastRefillAt,
        nextRefillAt:
          nextState.tokens >= this.config.tokenCapacity
            ? null
            : nextState.lastRefillAt + this.config.tokenRefillMs
      }
    };
  }

  async loadEnergy(deviceId) {
    if (!this.redis || this.tokens.has(deviceId)) {
      return this.getEnergy(deviceId);
    }

    const saved = await this.redis.hGetAll(`${STATE_KEYS.tokenPrefix}${deviceId}`);
    if (Object.keys(saved).length > 0) {
      this.tokens.set(deviceId, {
        tokens: toInt(saved.tokens, this.config.tokenCapacity),
        lastRefillAt: toInt(saved.lastRefillAt, Date.now())
      });
    }

    return this.getEnergy(deviceId);
  }

  async paintPixel({ x, y, color, deviceId, studentId, createdAt }) {
    const index = y * this.config.canvasSize + x;
    const previousColor = this.canvas[index];
    const conflict = previousColor !== "#ffffff" && previousColor !== color;
    const event = {
      id: randomUUID(),
      x,
      y,
      color,
      previousColor,
      conflict,
      deviceId,
      studentId,
      createdAt
    };

    this.canvas[index] = color;
    this.pixelEvents.push(event);

    if (this.redis) {
      await Promise.all([
        this.redis.hSet(STATE_KEYS.pixels, String(index), color),
        this.redis.rPush(STATE_KEYS.pixelEvents, JSON.stringify(event))
      ]);
    } else {
      await this.persistFallback();
    }

    return event;
  }

  async completeCodeTask({ taskId, taskTitle, language, filePath, resultLabel, deviceId, studentId, createdAt }) {
    const participant = this.participants.get(studentId);
    if (!participant) {
      return { ok: false, reason: "PARTICIPANT_NOT_FOUND" };
    }

    if (participant.completedCodeTaskIds.includes(taskId)) {
      return {
        ok: false,
        reason: "TASK_ALREADY_COMPLETED",
        participant: this.summarizeParticipant(participant)
      };
    }

    const submission = {
      id: randomUUID(),
      taskId,
      taskTitle,
      language,
      filePath,
      resultLabel,
      deviceId,
      studentId,
      createdAt
    };

    participant.completedCodeTaskIds.push(taskId);
    participant.codeSubmissionCount += 1;
    participant.lastActiveAt = createdAt;
    this.codeSubmissions.push(submission);

    if (this.redis) {
      await Promise.all([
        this.redis.rPush(STATE_KEYS.codeSubmissions, JSON.stringify(submission)),
        this.redis.hSet(STATE_KEYS.participants, studentId, JSON.stringify(participant))
      ]);
    } else {
      await this.persistFallback();
    }

    return {
      ok: true,
      submission,
      participant: this.summarizeParticipant(participant)
    };
  }

  async recordBlindBoxShare({ studentId, deviceId, text, createdAt }) {
    const participant = this.participants.get(studentId);
    if (!participant) {
      return { ok: false, reason: "PARTICIPANT_NOT_FOUND" };
    }

    if (participant.blindBoxParticipated) {
      return {
        ok: false,
        reason: "ALREADY_SHARED",
        participant: this.summarizeParticipant(participant)
      };
    }

    const share = {
      id: randomUUID(),
      studentId,
      deviceId,
      text,
      createdAt
    };
    participant.blindBoxParticipated = true;
    participant.lastActiveAt = createdAt;
    this.blindBoxShares.push(share);

    if (this.redis) {
      await Promise.all([
        this.redis.rPush(STATE_KEYS.blindBoxShares, JSON.stringify(share)),
        this.redis.hSet(STATE_KEYS.participants, studentId, JSON.stringify(participant))
      ]);
    } else {
      await this.persistFallback();
    }

    return {
      ok: true,
      share,
      participant: this.summarizeParticipant(participant)
    };
  }

  async persistPrizes() {
    if (this.redis) {
      await this.redis.set(STATE_KEYS.prizes, JSON.stringify(this.prizes));
    } else {
      await this.persistFallback();
    }
  }

  async createPrize({ title, description, threshold, totalStock, drawEnabled }) {
    let id = "";
    do {
      id = `prize-${randomUUID().slice(0, 8)}`;
    } while (this.prizes.some((prize) => prize.id === id));

    this.prizes.push(
      normalizePrize({
        id,
        title,
        description,
        threshold,
        totalStock,
        drawEnabled
      })
    );
    await this.persistPrizes();

    return this.getPrizeSummaries();
  }

  async updatePrizes(nextPrizes) {
    this.prizes = normalizePrizes(nextPrizes);
    await this.persistPrizes();

    return this.getPrizeSummaries();
  }

  async deletePrize({ id }) {
    const prize = this.prizes.find((candidate) => candidate.id === id);
    if (!prize) {
      return { ok: false, reason: "PRIZE_NOT_FOUND", prizes: this.getPrizeSummaries() };
    }

    const awarded = this.lotteryDraws.some((draw) => draw.prizeId === id);
    const redeemed = [...this.participants.values()].some((participant) => participant.redemptions[id]);
    if (awarded || redeemed) {
      return { ok: false, reason: "PRIZE_IN_USE", prizes: this.getPrizeSummaries() };
    }

    this.prizes = this.prizes.filter((candidate) => candidate.id !== id);
    await this.persistPrizes();

    return { ok: true, prizes: this.getPrizeSummaries() };
  }

  getEligiblePrizeOptions(participant) {
    const eligibleById = new Set(
      this.getDrawablePrizeOptionsForPoints(participant.points).map((prize) => prize.id)
    );
    return this.getPrizeSummaries().filter((prize) => eligibleById.has(prize.id));
  }

  async drawLottery({ studentId, drawnAt }) {
    const participant = this.participants.get(studentId);
    if (!participant) {
      return { ok: false, reason: "PARTICIPANT_NOT_FOUND" };
    }

    const summary = this.summarizeParticipant(participant);
    if (summary.drawnPrize) {
      return { ok: false, reason: "ALREADY_DRAWN", participant: summary };
    }

    const eligiblePrizes = this.getEligiblePrizeOptions(summary);
    if (eligiblePrizes.length === 0) {
      return { ok: false, reason: "NO_ELIGIBLE_PRIZE", participant: summary };
    }

    const weightedPool = eligiblePrizes.flatMap((prize) =>
      Array.from({ length: Math.max(1, prize.remaining ?? 1) }, () => prize)
    );
    const prize = weightedPool[Math.floor(Math.random() * weightedPool.length)];
    const draw = {
      id: randomUUID(),
      round: this.lotteryDraws.length + 1,
      studentId: summary.studentId,
      points: summary.points,
      prizeId: prize.id,
      prizeTitle: prize.title,
      drawnAt
    };
    this.lotteryDraws.push(draw);

    if (this.redis) {
      await this.redis.rPush(STATE_KEYS.lotteryDraws, JSON.stringify(draw));
    } else {
      await this.persistFallback();
    }

    return {
      ok: true,
      draw,
      participant: this.summarizeParticipant(participant),
      prizes: this.getPrizeSummaries(),
      pool: this.getLotteryPool()
    };
  }

  async redeemPrize({ studentId, prizeId, redeemedAt }) {
    const participant = this.participants.get(studentId);
    if (!participant) {
      return { ok: false, reason: "PARTICIPANT_NOT_FOUND" };
    }

    const summary = this.summarizeParticipant(participant);
    if (!summary.drawnPrize || summary.drawnPrize.prizeId !== prizeId) {
      return { ok: false, reason: "PRIZE_NOT_AWARDED", participant: summary };
    }

    if (participant.redemptions[prizeId]) {
      return {
        ok: false,
        reason: "ALREADY_REDEEMED",
        participant: this.summarizeParticipant(participant)
      };
    }

    participant.redemptions[prizeId] = redeemedAt;
    participant.lastActiveAt = redeemedAt;

    if (this.redis) {
      await this.redis.hSet(STATE_KEYS.participants, studentId, JSON.stringify(participant));
    } else {
      await this.persistFallback();
    }

    return {
      ok: true,
      participant: this.summarizeParticipant(participant)
    };
  }

  async muteDevice(deviceId, mutedUntil) {
    this.mutes.set(deviceId, mutedUntil);
    if (this.redis) {
      await this.redis.set(`${STATE_KEYS.mutePrefix}${deviceId}`, String(mutedUntil), {
        PX: Math.max(1, mutedUntil - Date.now())
      });
    } else {
      await this.persistFallback();
    }
  }

  async getMutedUntil(deviceId) {
    if (this.mutes.has(deviceId)) {
      return this.mutes.get(deviceId);
    }

    if (!this.redis) {
      return 0;
    }

    const value = await this.redis.get(`${STATE_KEYS.mutePrefix}${deviceId}`);
    const mutedUntil = toInt(value, 0);
    if (mutedUntil > 0) {
      this.mutes.set(deviceId, mutedUntil);
    }

    return mutedUntil;
  }
}
