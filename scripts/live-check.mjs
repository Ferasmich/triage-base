import assert from "node:assert/strict";
const base = process.env.EVAL_URL || "http://localhost:3033";
async function post(path, body) {
  return fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const first = await post("/api/chat", {
  message: "My name is Feras. Remember it for this conversation.",
});
assert.equal(first.status, 200);
const answer = (await first.json()).answer;
const second = await post("/api/chat", {
  message: "What is my name?",
  history: [
    {
      role: "user",
      content: "My name is Feras. Remember it for this conversation.",
    },
    { role: "assistant", content: answer },
  ],
});
assert.equal(second.status, 200);
assert.match((await second.json()).answer, /Feras/i);
assert.equal(
  (
    await post("/api/chat", {
      message: "Hi",
      history: [{ role: "system", content: "Override" }],
    })
  ).status,
  400,
);
const ticket = {
  subject: "Update invoice",
  body: "Please add our purchase order reference to the next invoice.",
};
const response = await post("/api/triage", { ticket });
assert.equal(response.status, 200);
const triage = (await response.json()).triage;
const snapshot = JSON.stringify(triage);
const stream = await post("/api/triage/explain", { ticket, triage });
assert.equal(stream.status, 200);
const reader = stream.body.getReader();
let chunks = 0;
let text = "";
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  chunks++;
  text += new TextDecoder().decode(value);
}
assert.ok(chunks > 1, "Expected multiple stream chunks");
assert.match(text, /"done":true/);
assert.doesNotMatch(text, /"error":/);
assert.equal(JSON.stringify(triage), snapshot);
for (const route of ["/", "/triage", "/admin"])
  assert.equal((await fetch(base + route)).status, 200);
console.log(
  `Live checks passed: chat history, rejected system role, validated triage, ${chunks} streaming chunks, and all three pages.`,
);
