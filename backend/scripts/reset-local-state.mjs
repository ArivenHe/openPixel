import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const statePath = path.resolve(__dirname, "../runtime/state.json");

await fs.rm(statePath, { force: true });
console.log("Local runtime state cleared.");

