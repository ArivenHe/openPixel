export const parseAdminAuthError = (error) => {
  const reason = error?.data?.reason ?? error?.message;
  const remainingAttempts = error?.data?.remainingAttempts;
  const bannedUntil = error?.data?.bannedUntil ?? 0;

  if (reason === "ADMIN_AUTH_BANNED" || bannedUntil > Date.now()) {
    return {
      message: "连续输错 3 次，当前已被封禁",
      bannedUntil
    };
  }

  if (reason === "INVALID_ADMIN_TOKEN") {
    return {
      message:
        Number.isInteger(remainingAttempts) && remainingAttempts > 0
          ? `Token 无效，还可尝试 ${remainingAttempts} 次`
          : "Token 无效",
      bannedUntil
    };
  }

  return {
    message: "连接失败，请稍后重试",
    bannedUntil: 0
  };
};

export const formatBanRemaining = (bannedUntil, now = Date.now()) => {
  const remainingMs = Math.max(0, bannedUntil - now);
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} 分 ${String(seconds).padStart(2, "0")} 秒`;
};
