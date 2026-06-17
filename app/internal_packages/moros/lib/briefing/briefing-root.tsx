import React from 'react';
import { localized } from 'moros-exports';
import BriefingStore, { BRIEF_WINDOW_HOURS, MorosBrief } from './briefing-store';
import AiSettingsPanel from '../ai/ai-settings-panel';
import PanelGrid, { PanelDef } from '../panels/panel-grid';

interface BriefingRootState {
  working: boolean;
  lastError: string | null;
  latest: MorosBrief | undefined;
}

function readState(): BriefingRootState {
  return {
    working: BriefingStore.isWorking(),
    lastError: BriefingStore.lastError(),
    latest: BriefingStore.latestBrief(),
  };
}

/**
 * Minimal renderer for the model's Markdown brief. Only the structures the
 * prompt asks for are handled (## headings and bullets) — everything is
 * rendered through React text nodes, so the model output is never injected
 * as HTML.
 */
function renderBriefMarkdown(markdown: string) {
  const nodes: React.ReactNode[] = [];
  let bullets: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bullets.length === 0) return;
    nodes.push(
      <ul key={`ul-${key++}`}>
        {bullets.map((text, i) => (
          <li key={i}>{text.replace(/\*\*/g, '')}</li>
        ))}
      </ul>
    );
    bullets = [];
  };

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('- ') || line.startsWith('* ')) {
      bullets.push(line.slice(2));
      continue;
    }
    flushBullets();
    if (!line) continue;
    if (line.startsWith('##')) {
      nodes.push(<h3 key={`h-${key++}`}>{line.replace(/^#+\s*/, '')}</h3>);
    } else {
      nodes.push(<p key={`p-${key++}`}>{line.replace(/\*\*/g, '')}</p>);
    }
  }
  flushBullets();
  return nodes;
}

export default class BriefingRoot extends React.Component<
  Record<string, unknown>,
  BriefingRootState
> {
  static displayName = 'BriefingRoot';

  _unlisten?: () => void;

  state: BriefingRootState = readState();

  componentDidMount() {
    this._unlisten = BriefingStore.listen(() => this.setState(readState()));
  }

  componentWillUnmount() {
    if (this._unlisten) this._unlisten();
  }

  _renderBrief() {
    const { latest, working, lastError } = this.state;
    if (lastError) {
      return <div className="moros-brief-error">{lastError}</div>;
    }
    if (!latest) {
      return (
        <div className="moros-empty">
          {working
            ? localized('Reading your mail and writing the brief…')
            : localized(
                'No briefs yet — configure a provider above, then generate your first brief.'
              )}
        </div>
      );
    }
    return (
      <div className="moros-brief">
        <div className="moros-brief-meta">
          {localized(
            'Generated %@ · %@ emails · %@',
            new Date(latest.createdAt).toLocaleString(),
            `${latest.messageCount}`,
            latest.model
          )}
        </div>
        <div className="moros-brief-output">{renderBriefMarkdown(latest.markdown)}</div>
      </div>
    );
  }

  // Wrap the existing Briefing sub-views as tiling panels. The header, AI
  // settings panel, and generate-button toolbar stay as fixed chrome above the
  // grid; the grid owns the AI settings display and the brief output.
  _briefingPanels(): PanelDef[] {
    return [
      {
        id: 'ai-settings',
        title: localized('AI Provider'),
        content: (
          <AiSettingsPanel
            featureName={localized('Briefing')}
            dataDescription={localized('sender names, subjects, and snippets')}
            upgradeSource="MorosBriefing"
            upgradeCampaign="Hosted briefing"
          />
        ),
      },
      {
        id: 'brief',
        title: localized('Brief'),
        content: <div className="moros-scroll-region">{this._renderBrief()}</div>,
      },
    ];
  }

  render() {
    return (
      <div className="moros-root moros-briefing">
        <div className="moros-header">
          <h2>{localized('Briefing')}</h2>
          <div className="moros-header-note">
            {localized(
              'A daily brief of the last %@ hours of mail, organized by what needs you first — powered by your own Anthropic API key, or by the hosted Moros service on paid plans.',
              `${BRIEF_WINDOW_HOURS}`
            )}
          </div>
        </div>
        <div className="moros-toolbar-row">
          <button
            className="btn btn-emphasis"
            disabled={this.state.working}
            onClick={() => BriefingStore.generate()}
          >
            {this.state.working ? localized('Generating…') : localized('Generate brief')}
          </button>
        </div>
        <PanelGrid moduleId="briefing" panels={this._briefingPanels()} />
      </div>
    );
  }
}
