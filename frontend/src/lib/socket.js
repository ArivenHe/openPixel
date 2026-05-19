import { io } from "socket.io-client";

const DEVICE_KEY_PREFIX = "openpixel-device-id";

const createDeviceId = () => {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID().replaceAll("-", "");
  }
  return `${Date.now()}${Math.random().toString(36).slice(2)}`;
};

export const getDeviceId = (role) => {
  const storageKey = `${DEVICE_KEY_PREFIX}:${role}`;
  const existing = window.localStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }

  const next = createDeviceId();
  window.localStorage.setItem(storageKey, next);
  return next;
};

export const createSocket = (role, adminToken = window.localStorage.getItem("openpixel-admin-token") || "") =>
  io({
    auth: {
      role,
      deviceId: getDeviceId(role),
      ...(role === "admin"
        ? {
            adminToken
          }
        : {})
    }
  });
