import "server-only";
import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
export type CallLog = {
  ts: string;
  request_id?: string;
  route: string;
  api: string;
  prompt_version: string;
  provider: string;
  model: string;
  status: number;
  error_code?: string;
  latency_ms: number;
  attempts: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  mode: string;
};
export async function logCall(row: CallLog) {
  await mkdir("logs", { recursive: true });
  await appendFile("logs/llm-calls.jsonl", JSON.stringify(row) + "\n");
}
export async function readLogs(): Promise<CallLog[]> {
  try {
    return (await readFile("logs/llm-calls.jsonl", "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}
export async function readRuns() {
  try {
    const files = (await readdir("runs")).filter((f) => f.endsWith(".json"));
    return await Promise.all(
      files.map(async (file) => ({
        file,
        ...JSON.parse(await readFile(path.join("runs", file), "utf8")),
      })),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}
