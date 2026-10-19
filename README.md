# Kestrel Analytics support triage

Course project by Feras Mich. Next.js app with server-side LLM calls, chat history, validated ticket triage, usage reporting, evaluation and streamed explanations.

## Run locally

Requires Node.js 20.9 or newer. Use Node 22 for the same environment as CI.

```sh
npm ci
cp .env.example .env.local
# Fill LLM_BASE_URL, LLM_API_KEY and LLM_MODEL in .env.local.
npm run dev
```

Open http://localhost:3033 for chat, `/triage` for ticket classification and `/admin` for usage and saved run comparisons. Keys stay on the server. Chat history lives in the page and resets on reload; failed requests retain the conversation and draft. The triage result remains available if a later request fails.

## Contract and architecture

`lib/llm.ts` owns every SDK call and provider setting. `lib/prompt.ts` owns prompts and `PROMPT_VERSION=triage-v2.1`. `lib/schema.ts` defines the shared Zod contract used both to generate JSON Schema and to validate provider responses. Routes validate request bodies before contacting a provider. Browser components never import the client.

`POST /api/chat` accepts `{message, history?: [{role: "user" | "assistant", content}]}`. History is limited to 40 entries, each message to 6000 characters, and total conversation text to 24000 characters. Client-supplied system roles are rejected.

`POST /api/triage` accepts `{ticket: {subject, body}}`. Subjects may be empty (some dev-set tickets have no subject); body must contain text. Subject limit: 500 characters; body limit: 5500; combined limit: 6000. All routes also bound request bodies to 128000 bytes. Oversized inputs return 400 without a provider call.

The response is `{triage: {category, priority, summary, suggested_action}, prompt_version}`. Categories: `billing`, `technical_bug`, `account`, `feature_request`. Priorities: `low`, `medium`, `high`. Summary is 1–300 characters; action is 1–500. Empty, whitespace-only, truncated, refused, fenced, non-JSON or schema-invalid output is rejected; extra keys are rejected. Priority follows impact rather than tone; how-to questions use technical_bug/low. Ticket text is wrapped in `<ticket>` after escaping angle brackets; prompt instructions treat it as untrusted data.

`POST /api/triage/explain` accepts the ticket and validated triage object. The result streams as SSE events containing `text`, `done` or a safe `error`. A mid-stream failure is shown to the user even though HTTP 200 has already started. The page explains that this is a post-hoc justification, not the model's hidden reasoning. The original result is never replaced by explanation text.

## Configuration and controlled failures

Set `LLM_OUTPUT_MODE=prompt` for portable prompt-only JSON, or `json_schema` to send the generated schema through `response_format`. Local Zod checks always run. No silent fallback hides unsupported provider parameters. Base URL, API key, model, provider label and token prices come from environment variables.

The SDK has a 30-second timeout and zero implicit retries. Our complete-call wrapper permits one explicit retry for invalid model output or upstream/network failures with 300ms backoff (at most two attempts). Rate limits, timeout and configuration failures are not automatically retried. Streaming uses one attempt and supports cancellation.

| Failure                                                               | HTTP status | Code                 |
| --------------------------------------------------------------------- | ----------- | -------------------- |
| Invalid request / oversized input                                     | 400         | invalid_request      |
| Invalid or truncated model result                                     | 502         | invalid_model_output |
| Provider rate limit                                                   | 429         | rate_limited         |
| Timeout                                                               | 504         | triage_timeout       |
| Wrong key, removed model, unsupported parameter or other provider 4xx | 500         | internal_error       |
| Provider 5xx / network                                                | 502         | triage_unavailable   |

Only safe messages reach the browser; raw errors, stack traces and provider details do not. `logs/llm-calls.jsonl` records one row per logical provider request with timestamp, route, API, prompt version, provider, model, mode, status, attempts, latency, input/output tokens and estimated USD cost. Triage responses include a generated request ID to correlate concurrent evaluation calls with their logs. Retry token usage is summed when known; missing usage or pricing stays `null`. Logs exclude API keys and full ticket text and are ignored by Git. Input validation does not create an LLM-call row because no LLM was called.

Set `LLM_INPUT_PRICE_PER_MILLION` and `LLM_OUTPUT_PRICE_PER_MILLION` to verified USD prices. Leave them empty when unknown; zero is valid only when the relevant service really has no charge. `/admin` shows call rows, error status counts and totals grouped by prompt/API/provider/model. Refresh to load new calls. Missing pricing or usage is displayed as unknown.

## Evaluation and experiments

The repository includes 500 synthetic tickets and the instructor's 100 labelled dev tickets. Evaluation sends subject/body only; expected labels never enter the prompt. No hold-out labels are used or invented.

With the app running:

```sh
npm run experiments  # Five varied dev-set tickets, written to EXPERIMENTS.md
npm run evaluate     # All 100 labelled tickets through /api/triage
# Optional small smoke run:
EVAL_LIMIT=5 EVAL_CONCURRENCY=1 npm run evaluate
```

`EVAL_URL` selects the server (default http://localhost:3033); `EVAL_CONCURRENCY` is bounded to 1–4, default 3. A run file under `runs/<timestamp>-<prompt-version>-<model>.json` contains ticket IDs, expected labels, validated outputs, statuses, latency, usage, outcomes, confusion matrices and tag slices. It excludes raw ticket text. All-ticket accuracy counts failed requests as incorrect; successful-only accuracy is also reported. Confusion matrices include `NO_OUTPUT`, so failures are visible. Labels and generated summaries/actions are retained for review; the provided data is synthetic.

`EXPERIMENTS.md` records observed failures and their hypotheses/changes. The original plain-text triage-v1 is preserved in Git history; this working tree implements the later structured contract. No historical successful v1 runs are claimed.

## Switch configurations (Activity 8, option A)

Make ignored local configuration files from `.env.example`, `.env.nvidia-small.example` or `.env.diffusion.example`, add the appropriate key privately, copy the chosen file to `.env.local`, and restart. Code stays unchanged. Do not copy a blank example over your existing configured file without saving it first.

For a comparison without changing `.env.local`, run a second local instance:

```sh
LLM_MODEL=google/diffusiongemma-26b-a4b-it LLM_OUTPUT_MODE=prompt npx next start --port 3034
EVAL_URL=http://localhost:3034 npm run evaluate
```

Run `npm run build` before `next start`. Both instances load the same key privately. The example smaller Nemotron model passed a connectivity probe; its quality has not been evaluated here. The earlier Llama model returned upstream HTTP 410 despite appearing in older documentation; its failed run is retained to show why live availability checks matter. That discovery prompted explicit handling of nonstandard SDK errors carrying provider 4xx status.

## Diffusion model exploration (Activity 10)

The PDF does not define “DM”; this project interprets it as diffusion model. Google's [DiffusionGemma model card](https://ai.google.dev/gemma/docs/diffusiongemma/model_card?hl=en) describes a discrete-diffusion, open-weight model under Apache 2.0. Its weights are freely available; hosted inference still depends on the provider's account terms. We tested `google/diffusiongemma-26b-a4b-it` through the configured NVIDIA endpoint using the existing key. [NVIDIA's model API reference](https://docs.api.nvidia.com/nim/reference/diffusiongemma-26b-a4b-it-infer) documents this endpoint. No additional paid service or account was created. Hosted cost is unknown because prices were not configured; the model's free weights do not prove free hosting.

The diffusion model can return schema-valid triage labels, summaries and next actions through the existing API. It cannot bypass Zod validation, remove account rate limits, guarantee correct labels, or provide true hidden reasoning through the explanation feature. Its speed advantage must be separated from failed/rate-limited calls. See the measured comparison below before choosing it for unattended classification.

## Quality checkpoint (Activity 7)

- [x] One server-only SDK module; no SDK calls or secrets in browser components.
- [x] Central versioned prompt and environment-driven settings.
- [x] Safe status/message mapping, explicit timeouts and bounded retries.
- [x] `.env.local` ignored; confirmed with `git check-ignore -v .env.local`.
- [x] Input size guards run before provider calls; tested malformed JSON, system roles, empty and oversized input.
- [x] Logs exclude keys and raw ticket content; usage and price gaps are explicit.
- [x] Every triage output passes the contract, including injection tickets; actual label disagreements are recorded rather than hidden.
- [x] Fixed: malformed tickets previously became HTTP 500; they now return 400 without contacting the provider. Also fixed unchecked model output and full-request debug logging in the application routes.
- [x] `npm test`, `npm run typecheck` and `npm run build` pass.
- [x] Live HTTP checks confirmed chat history, rejected system roles, valid triage, all three pages and progressively delivered explanations.

Prompt-injection resilience is not guaranteed by tags or roles: labelled adversarial slices still contain classification disagreements. Runs are dev-set evidence, not hold-out results. Rate limits also affect the reported metrics. This is a local course app: `/admin` and API routes have no authentication. Publishing the source is separate from deploying a public paid API. Local JSONL storage requires a persistent writable filesystem; ephemeral/serverless hosting needs durable storage.

## Prepare a public GitHub repository — publication deliberately deferred

GitHub CLI is authenticated as `Ferasmich`. Local Git commit email is `feras.mich@gmail.com`. The current `origin` is still the instructor's `bcs-s5-2026/triage-base` template; do not push coursework there. No repository was created, visibility changed, commit made or push executed during this task.

When you decide to publish, review the diff and generated outputs, commit your work, then create your own public repository. These commands are instructions only and have **not** been run:

```sh
git status --short
git diff --check
git add .
git commit -m "Complete support triage course activities"
gh repo create Ferasmich/kestrel-support-triage --public --source=. --remote=feras
git push -u feras HEAD
```

Use another repository name if that name already exists. Secrets, local configs, logs, dependencies, build output and TypeScript caches are ignored. Public source access will be at your GitHub repository after the future push; it does not create a hosted app URL. CI runs tests, type checking and production build without provider credentials.

## Verification

```sh
npm test
npm run typecheck
npm run build
npm run test:live  # Needs a running server and configured provider; makes real calls.
```

Automated provider tests use a local HTTP stub through the actual OpenAI SDK to verify history order, strict-schema requests, invalid-output retry, truncation rejection, rate limit/configuration/network error mapping and safe responses. Live HTTP verification complements them. Browser visual verification was unavailable in this environment.

## Measured comparison — 14 October 2026

Both functioning models used triage-v2.1, prompt-only JSON, the same 100 tickets and bounded concurrency of 3. The retired Llama run is failure evidence, not a quality score.

| Model / run evidence                                                                                                  | Valid results | HTTP counts                 | All-ticket category / priority | Successful-only category / priority | Mean latency, all outcomes (ms) | USD     |
| --------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------- | ------------------------------ | ----------------------------------- | ------------------------------- | ------- |
| [meta/llama-3.1-8b-instruct](runs/2026-10-14T10-23-12-130Z-triage-v2.1-meta-llama-3-1-8b-instruct.json)               | 0/100         | {"400":1,"502":99}          | 0.0% / 0.0%                    | Unknown / Unknown                   | 391                             | Unknown |
| [google/diffusiongemma-26b-a4b-it](runs/2026-10-14T10-25-05-837Z-triage-v2.1-google-diffusiongemma-26b-a4b-it.json)   | 38/100        | {"200":38,"400":1,"429":61} | 37.0% / 29.0%                  | 97.4% / 76.3%                       | 393                             | Unknown |
| [nvidia/nemotron-3-super-120b-a12b](runs/2026-10-14T10-25-51-428Z-triage-v2.1-nvidia-nemotron-3-super-120b-a12b.json) | 89/100        | {"200":89,"400":1,"429":10} | 80.0% / 60.0%                  | 89.9% / 67.4%                       | 5101                            | Unknown |

Three observed differences:

1. DiffusionGemma returned many more 429 responses than Nemotron in these runs. Rate limiting and different successful subsets confound accuracy comparisons. No claim of equal load or production throughput is made.
2. Successful-call mean latency and reported tokens differed: google/diffusiongemma-26b-a4b-it: 958ms, 14019 input / 2917 output tokens reported across the run; nvidia/nemotron-3-super-120b-a12b: 5726ms, 30856 input / 31053 output tokens reported across the run. Fast failed calls explain why all-outcome latency alone is misleading.
3. The old Llama configuration returned upstream HTTP 410, while Nemotron and DiffusionGemma produced locally validated JSON. Strict-schema capability probes are saved in [provider-capabilities.json](docs/provider-capabilities.json); accepting a schema request does not establish full upstream constraint enforcement.

Task choice: keep Nemotron as the current triage default because it completed more tickets in this run, and explore DiffusionGemma for low-latency drafts subject to human review until throttled repeat runs establish comparable accuracy and availability.

No hosted cost winner can be established without account-specific prices. Follow-up: rerun sequentially or at a measured sustainable rate after cooldown, then compare matched successful ticket IDs.
