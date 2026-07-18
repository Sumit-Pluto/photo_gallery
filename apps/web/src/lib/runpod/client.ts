/**
 * Low-level RunPod transport. Every model in the spec runs as its own RunPod
 * endpoint; this handles the common request envelope, bearer auth, and both
 * response modes:
 *
 *   - `/runsync` (preferred): the job runs synchronously and the body already
 *     contains `output` (or IS the output for a custom handler).
 *   - `/run`: returns `{ id, status }`; we poll `/status/{id}` until the job
 *     reaches a terminal state or the time budget (kept under Vercel's 60s
 *     function cap) is exhausted.
 *
 * RUNPOD_API_KEY is read here so callers never handle the secret directly.
 */

export class RunpodError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'RunpodError';
    this.status = status;
  }
}

export interface RunpodCallOpts {
  /** Human label used in error messages, e.g. "sd-inpaint". */
  name: string;
  /** Full endpoint URL from the per-model env var (…/runsync or …/run). */
  url: string;
  input: Record<string, unknown>;
  /** Total budget for the whole call incl. polling. Default 55s (< Vercel 60s). */
  timeoutMs?: number;
  pollIntervalMs?: number;
}

interface RunpodEnvelope {
  id?: string;
  status?: string;
  output?: unknown;
  error?: unknown;
}

export async function runpodCall<TOut = unknown>(opts: RunpodCallOpts): Promise<TOut> {
  const { name, url, input } = opts;
  const timeoutMs = opts.timeoutMs ?? 55_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 1500;

  const key = process.env.RUNPOD_API_KEY;
  if (!key) throw new RunpodError('RUNPOD_API_KEY is not set.', 500);

  const deadline = Date.now() + timeoutMs;
  const authHeaders = { authorization: `Bearer ${key}` };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders },
      body: JSON.stringify({ input }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new RunpodError(`Could not reach RunPod (${name}).`, 502);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 160);
    throw new RunpodError(`RunPod ${name} error (${res.status}). ${detail}`.trim(), 502);
  }

  const data = (await res.json().catch(() => null)) as RunpodEnvelope | null;
  if (!data || typeof data !== 'object') {
    throw new RunpodError(`RunPod ${name} returned an invalid response.`, 502);
  }

  // Terminal failure reported in a job envelope.
  if (data.status === 'FAILED' || data.status === 'CANCELLED') {
    throw new RunpodError(`RunPod ${name} job ${data.status.toLowerCase()}.`, 502);
  }
  // No job id → this is not an async envelope; the body itself is the output.
  // Covers custom /runsync handlers that return their result directly, even when
  // it carries a `status` field (e.g. "success").
  if (data.id === undefined) {
    return (data.output !== undefined ? data.output : data) as TOut;
  }
  // Job envelope that already carries a completed/inline output.
  if (data.output !== undefined && (data.status === undefined || data.status === 'COMPLETED')) {
    return data.output as TOut;
  }

  // Async: poll /status/{id} until COMPLETED / FAILED / the time budget runs out.
  // Each wait + fetch is clamped to the remaining budget so the whole call stays
  // under `timeoutMs` (kept below Vercel's 60s function cap).
  const statusUrl = url.replace(/\/run(sync)?(\/?)$/, `/status/${data.id}`);
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining < 500) break; // not enough budget for another round
    await sleep(Math.min(pollIntervalMs, remaining));
    const left = deadline - Date.now();
    if (left <= 0) break;
    let sres: Response;
    try {
      sres = await fetch(statusUrl, {
        headers: authHeaders,
        signal: AbortSignal.timeout(Math.min(10_000, Math.max(1000, left))),
      });
    } catch {
      continue; // transient — keep polling until the deadline
    }
    if (!sres.ok) continue;
    const sdata = (await sres.json().catch(() => null)) as RunpodEnvelope | null;
    if (!sdata) continue;
    if (sdata.status === 'COMPLETED') return sdata.output as TOut;
    if (sdata.status === 'FAILED' || sdata.status === 'CANCELLED') {
      throw new RunpodError(`RunPod ${name} job ${sdata.status.toLowerCase()}.`, 502);
    }
  }
  throw new RunpodError(`RunPod ${name} timed out (raise the endpoint's speed or use /runsync).`, 504);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
