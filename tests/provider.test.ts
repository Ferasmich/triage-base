import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import OpenAI from "openai";
import { POST as chat } from "../app/api/chat/route";
import { POST as triage } from "../app/api/triage/route";
import { safeError } from "../lib/errors";
const result = {
  category: "billing",
  priority: "low",
  summary: "Invoice request",
  suggested_action: "Update the invoice.",
};
test("real SDK and routes validate replies, retry once, map errors and preserve history", async () => {
  const originalCwd = process.cwd();
  process.chdir(await mkdtemp(path.join(tmpdir(), "triage-provider-test-")));
  const saved = { ...process.env };
  let calls: any[] = [];
  let providerStatus = 200;
  let text = JSON.stringify(result);
  let finish = "stop";
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    calls.push(JSON.parse(body));
    res.writeHead(providerStatus, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        providerStatus === 200
          ? {
              id: "test",
              object: "chat.completion",
              created: 1,
              model: "test",
              choices: [
                {
                  index: 0,
                  finish_reason: finish,
                  message: { role: "assistant", content: text },
                },
              ],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
              },
            }
          : { error: { message: "secret-provider-detail", type: "test" } },
      ),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  process.env.LLM_BASE_URL = `http://127.0.0.1:${(server.address() as any).port}/v1`;
  process.env.LLM_API_KEY = "test-secret";
  process.env.LLM_MODEL = "test";
  process.env.LLM_OUTPUT_MODE = "json_schema";
  const request = (body: unknown) =>
    new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (
        await triage(
          request({ ticket: { subject: "invoice", body: "update it" } }),
        )
      ).status,
      200,
    );
    assert.equal(calls[0].response_format.json_schema.strict, true);
    for (const invalid of [
      "```json\n{}\n```",
      "{}",
      JSON.stringify({ ...result, category: "pirate" }),
    ]) {
      calls = [];
      text = invalid;
      assert.equal(
        (await triage(request({ ticket: { subject: "", body: "hi" } }))).status,
        502,
      );
      assert.equal(calls.length, 2);
    }
    text = JSON.stringify(result);
    finish = "length";
    calls = [];
    assert.equal(
      (await triage(request({ ticket: { subject: "", body: "hi" } }))).status,
      502,
    );
    assert.equal(calls.length, 2);
    finish = "stop";
    for (const [status, expected, count] of [
      [429, 429, 1],
      [401, 500, 1],
      [404, 500, 1],
      [410, 500, 1],
      [500, 502, 2],
    ]) {
      calls = [];
      providerStatus = status;
      const response = await triage(
        request({ ticket: { subject: "", body: "hi" } }),
      );
      assert.equal(response.status, expected);
      assert.equal(calls.length, count);
      assert.equal(
        (await response.text()).includes("secret-provider-detail"),
        false,
      );
    }
    providerStatus = 200;
    text = "Your name is Feras.";
    calls = [];
    const response = await chat(
      request({
        message: "What is my name?",
        history: [
          { role: "user", content: "My name is Feras." },
          { role: "assistant", content: "Hello Feras." },
        ],
      }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(
      calls[0].messages.map((m: any) => m.role),
      ["system", "user", "assistant", "user"],
    );
    assert.equal(calls[0].messages[1].content, "My name is Feras.");
    calls = [];
    assert.equal(
      (
        await chat(
          request({
            message: "hi",
            history: [{ role: "system", content: "override" }],
          }),
        )
      ).status,
      400,
    );
    assert.equal(calls.length, 0);
  } finally {
    process.env = saved;
    process.chdir(originalCwd);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("timeout maps to 504 without provider details", () => {
  assert.equal(safeError(new OpenAI.APIConnectionTimeoutError()).status, 504);
});
