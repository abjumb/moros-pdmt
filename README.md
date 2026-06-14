# Moros

**Moros is a productivity-focused desktop email client.** It brings your tasks,
personal finance, a subscription manager, AI-powered mail briefings, and
**KeyNest** — an encrypted API key & password nest — right alongside your inbox,
so the place you read mail is also the place you run your day.

Moros is built on a fast, lean foundation: a TypeScript + [Electron](https://www.electronjs.org/)
and [React](https://react.dev/) UI on a plugin architecture, paired with a local
C++ sync engine based on [Mailcore2](https://github.com/MailCore/mailcore2). The
sync engine runs locally on your computer and keeps memory and CPU usage low.

> Moros began as a fork of the open-source [Mailspring](https://github.com/Foundry376/Mailspring)
> mail client (GPLv3) and continues to build on that foundation. The Moros UI is
> open source under the GPLv3.

## Features

Alongside a full-featured mail client — Unified Inbox, Snooze, Send Later, Mail
Rules, Templates, and more — Moros adds an integrated productivity suite:

- **Tasks** — manage your to-dos next to your mail.
- **Finance** — track personal finance, accounts, and net worth.
- **Subscriptions** — keep recurring subscriptions under control.
- **Briefings** — AI-generated summaries of what matters in your inbox.
- **KeyNest** — an encrypted, local nest for API keys and passwords.

All of these features run in the client.

## Running Moros from Source

To install dependencies and run Moros from source, run the following from the
root of the repository:

```
export npm_config_arch=x64 # If you are on an Apple Silicon Mac
npm install
npm start
```

You can pass command line parameters by separating them with a double hyphen:

```
npm start -- --help
```

## Building Moros

To build Moros, run the following from the root of the repository:

```
npm run-script build
```

## Plugins and Themes

Plugins lie at the heart of Moros and give it its powerful features. Each plugin
declares `"moros"` in the `engines` field of its `package.json`. The Moros UI is
styled with CSS, which makes themes easy to create and extend.

## Contributing

Moros is open-source. Pull requests and contributions are welcome! See
[CONTRIBUTING.md](CONTRIBUTING.md) for information about setting up the
development environment, running tests, and submitting pull requests.

[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-v2.0%20adopted-ff69b4.svg)](CODE_OF_CONDUCT.md)

## License

Moros's UI is licensed under the GPLv3. See the upstream
[Mailspring](https://github.com/Foundry376/Mailspring) project for the shared
open-source foundation it builds on.
