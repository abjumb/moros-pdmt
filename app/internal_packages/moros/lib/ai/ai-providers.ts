import { localized, IdentityStore, MorosAPIRequest } from 'moros-exports';
import KeyNestStore, { ANTHROPIC_KEY_ENTRY_NAME } from '../keynest/keynest-store';

export type AiProviderId = 'byok' | 'hosted';

export interface AiCompletionOptions {
  model: string;
  maxTokens: number;
  /** Identifies the use-case to the hosted backend (e.g. 'brief'). Ignored by BYOK. */
  task: string;
}

/**
 * A completion backend shared by the Moros AI features (Briefing and
 * subscription detection). Two implementations: bring-your-own-key (the
 * user's Anthropic API key, stored in KeyNest) and the hosted Moros service
 * (included with a paid Moros ID plan). Either can power any feature —
 * "BYOK for both, or pay us a small subscription to do it for you."
 */
export interface AiProvider {
  id: AiProviderId;
  /** True when the provider has everything it needs to run. */
  isConfigured(): Promise<boolean>;
  /** Resolves when usable; rejects with a user-facing message otherwise. */
  validate(): Promise<void>;
  complete(prompt: string, options: AiCompletionOptions): Promise<string>;
}

const ANTHROPIC_API_ROOT = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';

export const DEFAULT_MODEL = 'claude-opus-4-8';

export const MODEL_OPTIONS = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 — best quality' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — balanced' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — fastest' },
];

const MAX_PROMPT_FIELD_CHARS = 300;

/**
 * Neutralize a piece of untrusted email content before it goes into an LLM
 * prompt. Email subjects and snippets come from senders we don't control, so
 * a crafted message could otherwise smuggle instructions ("ignore previous
 * instructions…") into the prompt. We strip control characters, collapse all
 * whitespace (so injected newlines can't fake prompt structure), and cap the
 * length. Callers should additionally JSON-encode the result and keep it
 * inside a clearly delimited, explicitly-untrusted data block.
 */
export function sanitizeForPrompt(value: string): string {
  return (
    (value || '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001F\u007F]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_PROMPT_FIELD_CHARS)
  );
}

interface AnthropicErrorEnvelope {
  error?: { type?: string; message?: string };
}

function anthropicErrorMessage(status: number, json: AnthropicErrorEnvelope | null): string {
  if (status === 401) {
    return localized('Your Anthropic API key was rejected — check the key stored in KeyNest.');
  }
  if (status === 429) {
    return localized('The Anthropic API rate limit was hit — try again in a minute.');
  }
  if (json && json.error && json.error.message) {
    return json.error.message;
  }
  return localized('The Anthropic API returned an unexpected error (%@).', `${status}`);
}

/**
 * Bring-your-own-key provider, talking to the Anthropic Messages API.
 *
 * The requests are plain `fetch` calls rather than the official
 * `@anthropic-ai/sdk` — the app intentionally doesn't grow a dependency for
 * the two endpoints used here, and the renderer's fetch is sufficient.
 * Note Opus 4.7+ models reject sampling parameters (`temperature` etc.),
 * so none are sent.
 */
export class AnthropicByokProvider implements AiProvider {
  id: AiProviderId = 'byok';

  async _key(): Promise<string | undefined> {
    return KeyNestStore.getSecretByName(ANTHROPIC_KEY_ENTRY_NAME);
  }

  async isConfigured() {
    return (await this._key()) !== undefined;
  }

  _headers(key: string) {
    return {
      'x-api-key': key,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    };
  }

  async validate() {
    const key = await this._key();
    if (!key) {
      throw new Error(
        localized('No Anthropic API key found — save one below to use bring-your-own-key.')
      );
    }
    // count_tokens validates the key and model without billing any tokens.
    let resp: Response;
    try {
      resp = await fetch(`${ANTHROPIC_API_ROOT}/v1/messages/count_tokens`, {
        method: 'POST',
        headers: this._headers(key),
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
    } catch (err) {
      throw new Error(localized('Could not reach the Anthropic API — are you online?'));
    }
    if (!resp.ok) {
      const json = await resp.json().catch(() => null);
      throw new Error(anthropicErrorMessage(resp.status, json));
    }
  }

  async complete(prompt: string, { model, maxTokens }: AiCompletionOptions) {
    const key = await this._key();
    if (!key) {
      throw new Error(localized('No Anthropic API key found — save one in AI settings first.'));
    }
    let resp: Response;
    try {
      resp = await fetch(`${ANTHROPIC_API_ROOT}/v1/messages`, {
        method: 'POST',
        headers: this._headers(key),
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
    } catch (err) {
      throw new Error(localized('Could not reach the Anthropic API — are you online?'));
    }
    const json = await resp.json().catch(() => null);
    if (!resp.ok) {
      throw new Error(anthropicErrorMessage(resp.status, json));
    }
    if (!json) {
      throw new Error(localized('The Anthropic API returned an unreadable response — try again.'));
    }
    if (json.stop_reason === 'refusal') {
      throw new Error(localized('The model declined to process this content.'));
    }
    const text = (json.content || [])
      .filter((block: { type: string }) => block.type === 'text')
      .map((block: { text: string }) => block.text)
      .join('\n')
      .trim();
    if (!text) {
      throw new Error(localized('The model returned an empty response — try again.'));
    }
    return text;
  }
}

/**
 * Hosted provider — completions are generated by the Moros service using the
 * user's Moros ID, included with any paid plan. The model choice is made
 * server-side, so `options.model` is ignored; `task` tells the server which
 * use-case it's serving.
 */
export class MorosHostedProvider implements AiProvider {
  id: AiProviderId = 'hosted';

  async isConfigured() {
    return !!IdentityStore.identity() && IdentityStore.hasProFeatures();
  }

  async validate() {
    if (!IdentityStore.identity()) {
      throw new Error(
        localized('Sign in to your Moros ID (Preferences → Subscription) to use the hosted plan.')
      );
    }
    if (!IdentityStore.hasProFeatures()) {
      throw new Error(
        localized(
          'The hosted AI service is included with paid plans — upgrade, or switch to your own API key.'
        )
      );
    }
  }

  async complete(prompt: string, { task, maxTokens }: AiCompletionOptions) {
    await this.validate();
    const json = await MorosAPIRequest.makeRequest({
      server: 'identity',
      method: 'POST',
      path: '/api/ai/complete',
      json: true,
      body: { task, prompt, maxTokens },
    });
    if (!json || typeof json.text !== 'string' || !json.text.trim()) {
      throw new Error(localized('The hosted AI service returned an empty response — try again.'));
    }
    return json.text;
  }
}

const PROVIDERS: { [K in AiProviderId]: AiProvider } = {
  byok: new AnthropicByokProvider(),
  hosted: new MorosHostedProvider(),
};

export function providerById(id: AiProviderId): AiProvider {
  return PROVIDERS[id];
}
