# Frontend manual QA checklist

Status: **PASS — manually verified by the user.** Feras confirmed that manual frontend QA was complete and passed on 20 October 2026. The checklist is marked on that basis; no automated browser verification is claimed. Browser/version details were not supplied.

Start the final production build with `npm run build` then `npm run start`; open http://localhost:3033. Keep the server running. Current LLM: `nvidia/nemotron-3.5-lightning-30b-a3b`; DM: `vllm-sr/d3-flash`.

## Chat — `/`

- [x] Confirm the navigation has Chat, Triage, Smoke tests and Admin and each link opens the expected page.
- [x] Send `My name is Feras. Remember it for this conversation.` Check that both user and assistant messages appear and the draft clears.
- [x] Send `What is my name?` Confirm the answer includes Feras. This checks that the browser sends conversation history.
- [x] During a request, confirm the textarea and Send button are disabled and the button says Sending. Confirm they become available again after completion.
- [x] Enter spaces only; Send must remain disabled.
- [x] With existing messages visible, enable browser DevTools Network → Offline, type a new message and send. Confirm a visible error, preserved draft and preserved previous messages. Restore Online and retry; confirm recovery.
- [x] Reload the page. Confirm history resets and “No messages yet” appears (history is intentionally page-local).

## Triage — `/triage`

Use subject `Invoice correction`, description `Please add our purchase order reference to the next invoice.`

- [x] Select LLM and submit. Confirm category/priority, summary and suggested action appear. Confirm strategy LLM and the actual Lightning model are displayed.
- [x] Confirm input, output and total tokens are numeric; input + output equals total. Confirm latency is visible and the current free-host provider cost is $0.
- [x] Click Explain with LLM. Confirm text appears, the request finishes, and the classification result does not change. The post-hoc explanation notice must remain visible.
- [x] Select DM, submit the same ticket, and expand “Decision Model probabilities and confidence”. Confirm all four category probabilities, three priority probabilities and both confidence values appear.
- [x] Confirm DM tokens have positive input and zero output. Confirm text is explicitly labelled as a template, and no generated narrative is implied.
- [x] Select DM+LLM and submit the same ticket. Confirm both serving model IDs are displayed. Confirm category/priority equal the choices in the DM details, and summary/action are generated text. Total usage includes both model stages.
- [x] Empty the description or enter only spaces. Submit must remain disabled. A blank subject with a nonempty description is allowed.
- [x] Confirm the character counter updates and the form enforces subject/body limits.
- [x] After a successful result, switch DevTools Network to Offline and submit a different valid ticket. Confirm a visible error and that the previous result remains available. Restore Online and retry.

## Smoke runner — `/smoke`

- [x] For each of LLM, DM and DM+LLM, select **100 labelled tickets**, sample size **3**, then Run smoke test. Wait for completion; do not reload mid-run.
- [x] Confirm the busy state prevents duplicate runs. Confirm exactly three different ticket IDs appear in each completed run.
- [x] Confirm each labelled row has predicted and expected category/priority side by side. Any failed row must say No output and count as a mismatch.
- [x] Confirm category/priority mismatch totals match the displayed rows. Accuracy is a fraction between 0 and 1. Expand DM probabilities in DM/hybrid rows.
- [x] Confirm model IDs, outcome counts, mean latency, cost and input/output/total tokens are visible and agree with the result.
- [x] For each strategy, select **500 unlabelled tickets**, sample size **2**, and run. Confirm two distinct rows and the notice that accuracy is unavailable; there must be no invented expected labels or accuracy.
- [x] Enter sample size 0 or a size above the selected dataset size. Browser validation must prevent submission. Change from dataset 500 to 100 with size 500; the size must clamp to 100.
- [x] Trigger an Offline request, confirm the visible error, restore Online, and retry. Existing run results should remain visible after a failed request.

## Admin — `/admin`

- [x] Refresh after the smoke runs. Confirm all six runs appear with their strategy, serving and attempted models, outcomes, accuracy where available, latency and cost.
- [x] In Calls, confirm LLM runs identify Lightning, DM runs identify d3-flash, and hybrid requests have both stage records with strategy dm+llm.
- [x] Confirm modern successful calls have numeric tokens and cost, and historical unavailable usage/cost remains Unknown.
- [x] Confirm old failed NVIDIA calls still show their failure status/provider 404 with no falsely confirmed serving model.
- [x] Confirm the page contains no API keys or raw ticket descriptions.

## Layout and keyboard checks

- [x] Repeat navigation and one form submission using only Tab, arrow keys and Enter/Space. Labels, disabled states, errors and result disclosures must be usable.
- [x] Check desktop and a 375px-wide viewport. Forms must remain readable and wide tables must scroll inside their table container.
- [x] Check the browser console after successful and failed requests. Record any application errors with the page and action; never copy credential values into a bug report.

Completion date: 20 October 2026. Result: PASS, as confirmed by the user. No failed steps were reported.
