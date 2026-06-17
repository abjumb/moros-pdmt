import React from 'react';
import { localized } from 'moros-exports';
import { widgetComponentForKey, widgetTitleForKey } from './widget-registry';
import { MorosWidgetWindowProps } from './widget-launcher';

/**
 * Root component rendered in a Moros widget popout window. It reads the
 * `widgetKey` from the window's props, resolves the registered standalone
 * component, and renders it inside a minimal draggable chrome (the window is
 * frameless). The rendered component subscribes to its own Moros store, so the
 * file-watch live-sync keeps it in step with the main window automatically.
 */
export default class MorosWidgetWindow extends React.Component<Record<string, unknown>> {
  static displayName = 'MorosWidgetWindow';
  // Render directly into the Center location without an extra container wrapper.
  static containerRequired = false;

  _props: MorosWidgetWindowProps;

  constructor(props: Record<string, unknown>) {
    super(props);
    this._props = AppEnv.getWindowProps() as MorosWidgetWindowProps;
    const title = (this._props && this._props.title) || localized('Widget');
    AppEnv.getCurrentWindow().setTitle(title);
  }

  componentDidMount() {
    // The popout opens hidden; show it once content has mounted.
    AppEnv.displayWindow();
  }

  _onClose = () => {
    AppEnv.close();
  };

  render() {
    const key = this._props ? this._props.widgetKey : '';
    const Component = key ? widgetComponentForKey(key) : null;
    const title =
      (this._props && this._props.title) || widgetTitleForKey(key) || localized('Widget');

    return (
      <div className="moros-widget-window">
        {/* `-webkit-app-region: drag` (set in the LESS) lets this bar move the
            frameless window; the close button opts back out so it stays clickable. */}
        <header className="moros-widget-titlebar">
          <span className="moros-widget-title">{title}</span>
          <button
            type="button"
            className="moros-widget-close"
            title={localized('Close')}
            aria-label={localized('Close')}
            onClick={this._onClose}
          >
            &times;
          </button>
        </header>
        <div className="moros-widget-body moros-root">
          {Component ? (
            <Component />
          ) : (
            <div className="moros-empty">{localized('This widget is unavailable.')}</div>
          )}
        </div>
      </div>
    );
  }
}
