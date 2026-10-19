"use client";
import { useState, type FormEvent } from "react";
import type { TriageResult } from "../../lib/schema";
export default function TriagePage() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<{
    triage: TriageResult;
    ticket: { subject: string; body: string };
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState("");
  async function sendTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || explaining) return;
    setLoading(true);
    setError("");
    const ticket = { subject, body };
    try {
      const response = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResult({ triage: data.triage, ticket });
      setExplanation("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to triage. Please retry.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function explain() {
    if (!result || explaining) return;
    setExplaining(true);
    setExplanation("");
    setError("");
    try {
      const response = await fetch("/api/triage/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No explanation stream.");
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const event = JSON.parse(buffer.slice(0, boundary).slice(6));
          buffer = buffer.slice(boundary + 2);
          if (event.error) throw new Error(event.error);
          if (event.text) setExplanation((previous) => previous + event.text);
          if (event.done) completed = true;
        }
      }
      if (!completed) throw new Error("Explanation interrupted. Please retry.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Explanation interrupted.");
    } finally {
      setExplaining(false);
    }
  }
  return (
    <main className="chat">
      <h1>Support ticket triage</h1>
      <p>
        Classify a ticket and propose the next action for your support team.
      </p>
      <form onSubmit={sendTicket} aria-busy={loading}>
        <label htmlFor="subject">Subject</label>
        <input
          id="subject"
          maxLength={500}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={loading || explaining}
        />
        <label htmlFor="body">Ticket description</label>
        <textarea
          id="body"
          rows={7}
          maxLength={5500}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={loading || explaining}
        />
        <small>{subject.length + body.length} / 6000 characters</small>
        <button
          disabled={
            loading ||
            explaining ||
            !body.trim() ||
            subject.length + body.length > 6000
          }
        >
          {loading ? "Classifying…" : "Triage ticket"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result && (
        <section className="result" aria-live="polite">
          <h2>Triage result</h2>
          <dl>
            <dt>Category</dt>
            <dd>{result.triage.category}</dd>
            <dt>Priority</dt>
            <dd>{result.triage.priority}</dd>
            <dt>Summary</dt>
            <dd>{result.triage.summary}</dd>
            <dt>Suggested action</dt>
            <dd>{result.triage.suggested_action}</dd>
          </dl>
          <button
            type="button"
            onClick={explain}
            disabled={explaining || loading}
          >
            {explaining ? "Explaining…" : "Explain"}
          </button>
          <p className="explanation" aria-live="polite">
            {explanation}
          </p>
          <small>
            Explanations are post-hoc justifications, not the model’s hidden
            reasoning.
          </small>
        </section>
      )}
    </main>
  );
}
