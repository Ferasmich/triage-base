# LLM and Decision Model report

Final verification: 20 October 2026. Submission deadline: 24 October 2026, 13:00 Europe/Paris.

**LLM, DM and DM+LLM have all succeeded against real hosted services.** The final six smoke runs completed 15/15 sampled tickets. Automated checks and production build pass. Manual frontend QA was completed and passed, as confirmed by the user on 20 October 2026; the checklist records that attribution.

## Assignment and implementation

Pages 22–23 of the professor's “Decisions Decisions” PDF require a free hosted Decision Model, frontend strategy selection, DM-compatible smoke tests, model tracking in logs and Admin, and this report. The existing Next.js app, SDK interface, triage prompts, Zod contracts, evaluation metrics, logs and frontend were reused. Chat history, structured Triage V2 and streamed explanations are retained. The historical plain-text V1 remains in Git history; no new live V1 execution is claimed.

Both `/triage` and `/smoke` support:

- **LLM:** the existing LLM classifies and writes the summary/action. Requests that omit strategy retain this default.
- **DM:** the hosted Decision Model supplies category/priority and probabilities. Summary/action are explicitly labelled templates, not generated prose. Optional “Explain with LLM” is a separate user action.
- **DM+LLM:** DM fixes the labels, then the LLM writes summary/action. Changed labels are rejected. A failed stage fails the final result and retains stage logs; there is no silent substitution with a template response.

## Hosted Decision Model research

Checked against official documentation on 20 October 2026:

| Provider             | API / models                                                                                     | Access and selection                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| vLLM Semantic Router | `POST https://decision.vllm-sr.ai/v1/systemone`; `vllm-sr/d3-flash` and other Decision 3.0 sizes | Free key, no account required. Selected d3-flash for typed classification, probability/confidence outputs, usage and model metadata. Public model discovery succeeded. |
| TypeSafe Jev         | `POST https://api.typesafe.ai/v1/systemone`; `jev-1.14.0`, `jev-1.13.0`                          | Signups have reopened. Published input pricing is $0.042/million tokens; output is free. A guaranteed free API allowance was not verified.                             |
| OpenRouter Jev       | `/api/alpha/decisions` and `/api/v1/systemone`; `typesafe/jev-1.14`                              | Uses an OpenRouter key, without a separate TypeSafe account. Jev input is paid; generic free-model quotas do not make this DM free. Not selected.                      |

Sources: [vLLM hosted API](https://decision.vllm-sr.ai/docs), [models](https://decision.vllm-sr.ai/v1/systemone/models), [limits](https://decision.vllm-sr.ai/api/info), [TypeSafe models/pricing](https://docs.typesafe.ai/models), [TypeSafe signup status](https://help.typesafe.ai/articles/4519713419-how-do-i-create-or-activate-my-account-after-an-invitation-or-waitlist-approval), [OpenRouter Decisions tutorial](https://openrouter.ai/blog/tutorials/how-to-use-jev/), [OpenRouter Jev pricing](https://openrouter.ai/typesafe/jev-1.14).

The lecture also mentions OpenAI, Cloudflare, Perplexity, AWS and Liquid, several with unconfirmed hosted endpoints. They were not presented as verified free services. No local router installation is substituted for hosted inference.

## Restoring LLM access

Only NVIDIA LLM credentials and the separate DM credential were configured locally. Existing credentials were used only with their own providers. No new LLM credentials or paid account was required.

NVIDIA's `/v1/models` returned 200 with 81 entries, but discovery alone did not prove inference availability. Sanitized probe outcomes are included in `docs/submission-results.json`:

| Candidate                                                  | Real observed result                                                               | Decision                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `nvidia/nemotron-3-super-120b-a12b`                        | 404: backend function not found for the account                                    | Original model unavailable; not an invalid-key conclusion    |
| `google/diffusiongemma-26b-a4b-it`                         | Valid triage, chat and streaming; longer app tests had repeated 30-second timeouts | Working candidate, rejected as final default for reliability |
| `google/gemma-4-31b-it`                                    | Probe timed out after 35 seconds                                                   | Not selected                                                 |
| `deepseek-ai/deepseek-v4.1-flash`                          | Probe timed out after 35 seconds                                                   | Not selected                                                 |
| `nvidia/nemotron-3.5-lightning-30b-a3b`, default reasoning | 200 but exhausted 1024 tokens on reasoning, no valid triage                        | Rejected with default settings                               |
| Same Lightning model, thinking disabled                    | Valid triage in 708 ms; chat in 407 ms; streaming in 822 ms                        | Selected and verified through the real app                   |

The original base URL, model spelling and Chat Completions format matched [NVIDIA's Super reference](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-super-120b-a12b-infer). The same key successfully served other models, demonstrating that the original 404 was model/function-specific rather than proof that the credential was invalid. The retired `meta/llama-3.1-8b-instruct` separately returned 410 with a retirement date of 26 August 2026.

The final `.env.local` selects Lightning and `LLM_ENABLE_THINKING=false`. This optional setting forwards `chat_template_kwargs.enable_thinking=false` to both normal and explanation calls. Omitting it preserves the old request format for other providers. The existing output budget, retry policy, prompts and request/response interface remain intact. Thinking settings and serving models are logged. [NVIDIA's Lightning catalog](https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b/build) advertises a free hosted endpoint and documents the thinking parameter. Zero input/output token prices are configured for that published free endpoint; these exclude infrastructure costs and are not paid-provider billing measurements.

The earlier DiffusionGemma trial remains local, including successful calls and timeout rows. No failed runs were deleted to improve the reported results. Raw runtime records are excluded from Git.

## Decision API contract and validation

`lib/decision.ts` sends only ticket subject/body as string state, two choice questions and `options.return_meta=true`. Expected labels are never sent. Criteria follow the existing business-impact policy, and ticket text is marked as untrusted data. Zod checks allowed choices, required probability keys, values/confidence in [0,1], probability sums within 0.02 of one, response model and usage. Partial answers, invalid JSON and invalid distributions fail; no guessed labels are inserted.

A real d3-flash probe returned 200, 238 input tokens and zero output tokens. Application calls recorded model revision `521525effa79469d899a570726547dd7f00da3af` and SHA-256 `74b71d370f3d9e5731c603dafcb8af4e9134fd2c769c89c5169b031a0418799b`.

Provider errors are mapped to safe frontend messages. DM requests have a 35-second timeout and no automatic retry. LLM requests retain a 30-second SDK timeout and the existing bounded retry policy. Failures preserve null usage/cost where unavailable, rather than fabricating zero values.

## Genuine final triage results

Committed evidence: `docs/submission-results.json` (the full local transcript is excluded). All three strategies received the same labelled ticket, `TCK-10001`, without its labels in the provider input. All returned technical_bug/low, matching the expected labels. Each response passed the shared Zod schema. The checker verified actual versus requested model IDs, hybrid label preservation, usage sums and stage logs.

| Strategy | HTTP | Input / output / total tokens | End-to-end latency (ms) |
| -------- | ---- | ----------------------------- | ----------------------- |
| llm      | 200  | 351 / 71 / 422                | 1551                    |
| dm       | 200  | 496 / 0 / 496                 | 523                     |
| dm+llm   | 200  | 883 / 69 / 952                | 1364                    |

Serving models were Lightning for LLM, d3-flash for DM, and both models for hybrid. The hybrid result is now genuinely verified; earlier NVIDIA-failure artifacts describe historical failures, not the current configuration.

## Genuine final frontend smoke-run results

These runs used `/api/smoke`, the same endpoint as the frontend. Sampling was random without replacement: three tickets from the labelled dataset and two from the unlabelled dataset for each strategy. All 15 completed successfully. Serving/attempted models, strategy, probabilities, per-stage usage/cost/errors and final metrics are persisted in run files and shown in Admin.

| Strategy | Dataset | Successful / sampled | Category accuracy | Priority accuracy | Mean latency (ms) | Provider cost |
| -------- | ------- | -------------------- | ----------------- | ----------------- | ----------------- | ------------- |
| llm      | 100     | 3/3                  | 100.00%           | 66.67%            | 844               | $0            |
| llm      | 500     | 2/2                  | Unavailable       | Unavailable       | 850               | $0            |
| dm       | 100     | 3/3                  | 100.00%           | 66.67%            | 4399              | $0            |
| dm       | 500     | 2/2                  | Unavailable       | Unavailable       | 3270              | $0            |
| dm+llm   | 100     | 3/3                  | 66.67%            | 66.67%            | 2389              | $0            |
| dm+llm   | 500     | 2/2                  | Unavailable       | Unavailable       | 2146              | $0            |

Run IDs reproduced in the committed results summary (full run files remain local):

- `43b9f804-611d-497f-9916-98a64d4e85ca` — llm, dataset 100
- `c08a9c15-0e3b-4456-87e3-e2ecb9e6ea9f` — llm, dataset 500
- `ec51217d-7158-4bae-bbcc-0c945df0decc` — dm, dataset 100
- `1535b37d-c7fb-4d80-b8b3-0a6ffb76d6e9` — dm, dataset 500
- `6a25cdd2-d753-42d4-a7a4-359bef15c771` — dm+llm, dataset 100
- `b07264f8-60d4-48e7-b24e-d160acc6b0ad` — dm+llm, dataset 500

The labelled samples differ across strategies and are too small for a quality ranking. A 100% score on three sampled tickets is not evidence of production-level accuracy. Hybrid correctly preserves DM labels, including their errors. Priority mismatches and one hybrid category mismatch are retained. The unlabelled dataset has no ground truth, so accuracy is unavailable.

An earlier larger DM-only sample remains available: 19/20 successful, 95% category accuracy and 55% priority accuracy including an oversized input rejection. A separate earlier five-ticket unlabelled sample contained a DM timeout. These historical outcomes remain in the local verification artifacts and original run files; the figures above preserve their limitations in the submitted report.

## Logging and error handling

Shared request IDs link hybrid stages. Logs distinguish requested and actual serving models, strategy, prompt version, thinking option, latency, input/output tokens, cost, safe error code and upstream status. DM logs include provider request ID and model revision/hash. Explanation logs now use the actual model identifier returned in stream chunks. Failed calls do not falsely identify a confirmed serving model.

Smoke rows sum both hybrid stages and count failed labelled predictions as mismatches. Unknown usage/cost remains null. `/admin` lists every saved run and stage calls, including historical failures. The final live checker verified all six new run IDs in the rendered Admin page. Invalid strategy, whitespace input and oversized sample requests returned 400 without provider calls. Mock-provider tests cover malformed output, label changes, 401/404/429/5xx mapping and hybrid failure isolation.

## Chat, streaming and frontend QA

`npm run test:live` passed against the final production server: chat remembered Feras across supplied history, system-role injection was rejected, triage validated, explanation completed and the original result stayed unchanged. The explanation produced 54 SSE events across 53 transport reads. The committed results summary includes the chat/streaming verification metrics.

The old live checker incorrectly required multiple network chunks. HTTP may coalesce SSE events into one read; it now validates text and completion events instead. This corrects the test without artificially splitting application output or claiming token-by-token generation from a provider that batches text.

All four pages returned HTTP 200 and strategy controls were checked in rendered HTML. **Manual frontend QA is PASS, confirmed by the user on 20 October 2026.** `docs/FRONTEND-QA.md` records the completed checklist for chat, triage, all strategies, both smoke datasets, Admin, offline recovery, keyboard navigation and mobile layout. Browser/version details were not supplied; this is a user-confirmed manual result, not an automated browser result.

## Submission checks and credential audit

- `npm test`: 9 tests passed, including DM/hybrid integration tests with mock providers and the optional reasoning flag.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run test:submission:live`: passed on the real production server; final evidence status is PASS.
- `npm run test:live`: passed on the real production server.
- Read-only credential audit: no configured-key matches or common token/private-key signatures found in tracked worktree files, the Git index, reachable historical blobs/commit messages, or non-ignored untracked submission files. `.env.local`, raw call logs and local run files are excluded from the submission. The audit is reproducible with `scripts/audit-secrets.py`; its raw output stays local.

The audit prints only locations and rule names, never values. It is scoped evidence, not an exhaustive guarantee that arbitrary secrets are absent; unreachable Git objects, ignored runtime artifacts and remote systems are outside scope.

## Remaining limitations and readiness

The original Nemotron Super endpoint still fails, but it is no longer selected. Final LLM and hybrid inference are restored with the verified free Lightning endpoint. Free service latency/availability and quotas can change; the 15/15 final run is not an availability guarantee. The samples are small, confidence is not calibrated on these tickets, and business-priority interpretation needs human review.

The free DM provider may log data and use it for improvement. Course ticket identities are synthetic; subject/body can contain synthetic contact details. This free endpoint should not be used for real confidential tickets. Large smoke runs remain sequential HTTP operations suited to the local server and can be interrupted by hosting time limits or process shutdown.

Manual frontend QA is complete, as confirmed by the user. No successful live execution of historical V1 is asserted. Final test/build results and the index credential scan are checked before the authorized submission commit and push. Deployment and email are outside the authorized scope.

## Submission packaging

`docs/submission-results.json` contains the curated metrics, model identifiers, probe outcomes and user-confirmed manual QA result. Raw local `logs/`, `runs/`, verification transcripts, credential-audit output and `.env.local` are ignored and not included in the commit. The app recreates runtime storage on demand; a fresh checkout starts with empty Admin history until runs are performed. All application code, datasets, tests, scripts and required reports are included. Historical Git commits are not rewritten.
