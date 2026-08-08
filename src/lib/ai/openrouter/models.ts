/**
 * Which model to ask, and what to do when it doesn't answer.
 *
 * OpenRouter is a front door to many providers, and the useful consequence is
 * that a model being down, rate-limited or retired is a routing problem rather
 * than an outage. So the configuration is a *list*, in preference order, and a
 * request walks it until one answers.
 *
 * Two rules keep the walk honest:
 *
 *   1. A model that fails in a way that is the model's fault — it doesn't
 *      exist, it's rate-limited, its upstream is down — is put on a short
 *      cooldown and demoted to the back of the list. Without this, every
 *      request pays the same timeout against the same dead model before
 *      reaching a working one, and the whole app feels broken.
 *
 *   2. A cooled-down model is demoted, never dropped. If every model is
 *      cooling, asking a probably-sick model still beats refusing to try.
 *
 * Failures that are *ours* — a bad API key, no credit, a malformed request —
 * are not a routing problem. Rotating past them would turn one clear error
 * into four confusing ones, so they stop the walk immediately.
 */

/**
 * The rotation when `OPENROUTER_MODELS` isn't set.
 *
 * Slugs age: models get renamed and retired, and this list is a guess made at
 * the time it was written. `openrouter/auto` is last on purpose — it is the
 * one entry that cannot become a wrong slug, because OpenRouter picks a live
 * model itself. So the worst case for a stale default is a slower first
 * request, not a dead assistant.
 */
export const DEFAULT_MODELS = [
  "anthropic/claude-sonnet-4.5",
  "openai/gpt-4.1",
  "google/gemini-2.5-flash",
  "openrouter/auto",
];

/** Configured preference order, longest-lived first. */
export function configuredModels(): string[] {
  const raw = process.env.OPENROUTER_MODELS?.trim();
  if (!raw) return DEFAULT_MODELS;
  const list = raw
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return list.length ? list : DEFAULT_MODELS;
}

/** How long a model sits at the back of the list after failing. */
const COOLDOWN_MS = 60_000;

/**
 * Cooldowns outlive a request but not a deploy, and in serverless they only
 * cover the instance that saw the failure. That's the right amount of memory
 * for something this cheap to rebuild — it is an optimisation, not state.
 */
const store = globalThis as typeof globalThis & {
  __aiCooldown?: Map<string, number>;
};
const cooldowns = (store.__aiCooldown ??= new Map<string, number>());

export function coolDown(model: string, now = Date.now()) {
  cooldowns.set(model, now + COOLDOWN_MS);
}

/** Preference order with recently-failed models demoted to the back. */
export function rotation(now = Date.now()): string[] {
  const models = configuredModels();
  const healthy = models.filter((m) => (cooldowns.get(m) ?? 0) <= now);
  const cooling = models.filter((m) => (cooldowns.get(m) ?? 0) > now);
  return [...healthy, ...cooling];
}

/** What went wrong with one model, and whether it's worth trying the next. */
export interface Attempt {
  model: string;
  problem: string;
}

/**
 * Does this status mean "try another model" or "stop and say so"?
 *
 * 401/403 is our key. 402 is our balance. 400 is usually our request body —
 * except when it is OpenRouter rejecting an unknown model slug, which is
 * exactly the case rotation exists for, so that one is caught by the message.
 */
export function shouldRotate(status: number, body: string): boolean {
  if (status === 401 || status === 403 || status === 402) return false;
  if (status === 400) return /model/i.test(body);
  return true;
}

/** A sentence a person can act on, from whatever the gateway returned. */
export function describeFailure(status: number, body: string): string {
  const message = (() => {
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      return parsed.error?.message?.trim();
    } catch {
      return undefined;
    }
  })();

  if (status === 401 || status === 403)
    return "OPENROUTER_API_KEY was rejected.";
  if (status === 402)
    return "This OpenRouter account is out of credit.";
  if (status === 429) return message || "Rate-limited.";
  return message || `HTTP ${status}`;
}
