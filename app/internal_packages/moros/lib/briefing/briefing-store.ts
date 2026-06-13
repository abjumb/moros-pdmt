import fs from 'fs';
import path from 'path';
import MailspringStore from 'mailspring-store';
import { DatabaseStore, Message, localized } from 'mailspring-exports';
import MorosDataStore, { MorosRecord } from '../moros-data-store';
import { BriefingProviderId, DEFAULT_MODEL, providerById } from './briefing-providers';

/** How far back a brief looks for mail. */
export const BRIEF_WINDOW_HOURS = 24;

const BRIEF_MESSAGE_LIMIT = 100;
const BRIEF_MAX_TOKENS = 4096;
const BRIEF_HISTORY_LIMIT = 20;

export interface MorosBrief extends MorosRecord {
  markdown: string;
  provider: BriefingProviderId;
  model: string;
  messageCount: number;
}

export interface BriefingSettings {
  provider: BriefingProviderId;
  model: string;
}

const DEFAULT_SETTINGS: BriefingSettings = { provider: 'byok', model: DEFAULT_MODEL };

/**
 * Sections the model is asked to organize mail into — the Cora-style
 * "organized inbox" framing: what needs action first, noise last.
 */
export const BRIEF_SECTIONS = [
  'Needs your reply',
  'Waiting & updates',
  'FYI',
  'Newsletters & promotions',
];

export function buildBriefPrompt(
  messages: Array<{ fromName: string; fromEmail: string; subject: string; snippet: string }>
): string {
  const lines = messages.map(
    (m) =>
      `FROM: ${m.fromName || m.fromEmail} <${m.fromEmail}> | SUBJECT: ${m.subject} | PREVIEW: ${m.snippet}`
  );
  return [
    `You are the briefing assistant inside the Moros mail client. Below is every email received in the last ${BRIEF_WINDOW_HOURS} hours, one per line.`,
    '',
    'Write a daily brief in Markdown:',
    '- Start with a single-sentence overview of the day.',
    `- Then use exactly these section headings, omitting any section with no items: ${BRIEF_SECTIONS.map(
      (s) => `"## ${s}"`
    ).join(', ')}.`,
    '- Within a section, one bullet per email: **Sender** — subject: a one-line gist.',
    '- Collapse near-duplicate emails (same sender and topic) into one bullet.',
    '- Only describe emails from the list below. Do not invent or speculate.',
    '',
    'EMAILS:',
    ...lines,
  ].join('\n');
}

class BriefingStore extends MailspringStore {
  _briefs = new MorosDataStore<MorosBrief>('briefs.json');
  _settings: BriefingSettings;
  _working = false;
  _lastError: string | null = null;

  constructor() {
    super();
    this._settings = this._loadSettings();
    this._briefs.listen(() => this.trigger());
  }

  // --- Settings -----------------------------------------------------------
  // Persisted as JSON beside the other Moros data files rather than in
  // AppEnv.config, which is reserved for schema-backed core settings.

  _settingsPath() {
    return path.join(AppEnv.getConfigDirPath(), 'moros', 'briefing.json');
  }

  _loadSettings(): BriefingSettings {
    try {
      const parsed = JSON.parse(fs.readFileSync(this._settingsPath(), 'utf8'));
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch (err) {
      // Missing on first run; if unreadable, fall back to defaults.
      return { ...DEFAULT_SETTINGS };
    }
  }

  _saveSettings() {
    const filePath = this._settingsPath();
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(this._settings, null, 2), 'utf8');
    } catch (err) {
      AppEnv.reportError(err);
    }
  }

  settings(): BriefingSettings {
    return { ...this._settings };
  }

  setProvider(provider: BriefingProviderId) {
    this._settings.provider = provider;
    this._saveSettings();
    this.trigger();
  }

  setModel(model: string) {
    this._settings.model = model;
    this._saveSettings();
    this.trigger();
  }

  // --- State --------------------------------------------------------------

  isWorking() {
    return this._working;
  }

  lastError() {
    return this._lastError;
  }

  latestBrief(): MorosBrief | undefined {
    return this._briefs.items()[0];
  }

  // --- Generation ---------------------------------------------------------

  async _collectRecentMail() {
    const since = new Date(Date.now() - BRIEF_WINDOW_HOURS * 60 * 60 * 1000);
    const messages = await DatabaseStore.findAll<Message>(Message)
      .where(Message.attributes.date.greaterThan(since))
      .order(Message.attributes.date.descending())
      .limit(BRIEF_MESSAGE_LIMIT);
    return messages
      .filter((m) => !m.draft && !m.isFromMe() && !m.isHidden())
      .map((m) => ({
        fromName: (m.from[0] && m.from[0].name) || '',
        fromEmail: (m.from[0] && m.from[0].email) || '',
        subject: m.subject || '(no subject)',
        snippet: (m.snippet || '').replace(/\s+/g, ' ').slice(0, 140),
      }));
  }

  async generate() {
    if (this._working) return;
    this._working = true;
    this._lastError = null;
    this.trigger();

    try {
      const mail = await this._collectRecentMail();
      if (mail.length === 0) {
        throw new Error(
          localized(
            'No mail received in the last %@ hours — nothing to brief.',
            `${BRIEF_WINDOW_HOURS}`
          )
        );
      }
      const provider = providerById(this._settings.provider);
      const markdown = await provider.complete(buildBriefPrompt(mail), {
        model: this._settings.model,
        maxTokens: BRIEF_MAX_TOKENS,
      });
      this._briefs.create({
        markdown,
        provider: this._settings.provider,
        model: this._settings.provider === 'hosted' ? 'hosted' : this._settings.model,
        messageCount: mail.length,
      });
      // Keep the history bounded — drop the oldest entries beyond the limit.
      const extra = this._briefs.items().slice(BRIEF_HISTORY_LIMIT);
      for (const brief of extra) {
        this._briefs.remove(brief.id);
      }
    } catch (err) {
      this._lastError = err instanceof Error ? err.message : `${err}`;
    } finally {
      this._working = false;
      this.trigger();
    }
  }
}

export default new BriefingStore();
