# suitecloud-cli-fullnode

Java-free, full-node SuiteCloud CLI fork for Linux/WSL.

[![npm version](https://img.shields.io/npm/v/suitecloud-cli-fullnode)](https://www.npmjs.com/package/suitecloud-cli-fullnode)
[![npm downloads](https://img.shields.io/npm/dm/suitecloud-cli-fullnode)](https://www.npmjs.com/package/suitecloud-cli-fullnode)
[![license](https://img.shields.io/github/license/sangoi-exe/netsuite-suitecloud-sdk)](../../LICENSE.txt)

> [!IMPORTANT]
> Unofficial community fork. Package name is `suitecloud-cli-fullnode`.

## Install

```bash
npm install -g suitecloud-cli-fullnode
suitecloud --version
suitecloud --help
```

## Quick Start

```bash
suitecloud account:setup
suitecloud project:deploy
```

## Runtime Model

- Node-only runtime.
- No Java runtime dependency.
- No runtime download/execution of Oracle `cli-*.jar`.

## Command Coverage

- `account:setup`
- `account:setup:ci`
- `account:manageauth`
- `project:create`
- `project:adddependencies`
- `project:package`
- `project:validate`
- `project:deploy`
- `file:create`
- `file:list`
- `file:upload`
- `file:import`
- `object:list`
- `object:import`
- `object:update`

## Authentication Behavior

- `account:setup` uses OAuth2 authorization code + PKCE and local callback at `127.0.0.1:52300-52315`.
- `account:setup:ci` uses OAuth2 `client_credentials`.
- Auth records are stored under `~/.suitecloud-sdk/auth/auth-store.json`.
- If refresh returns `invalid_grant`, reauth is triggered.
- Reauth enforces account consistency: if browser login returns a different account than the current `authId`, the CLI fails loud and does not overwrite stored credentials.

## Key Environment Variables

- `SUITECLOUD_SDK_HOME`: override SDK home path.
- `SUITECLOUD_CLIENT_ID`, `SUITECLOUD_OAUTH_CLIENT_ID`, `SUITECLOUD_INTEGRATION_CLIENT_ID`: OAuth client id resolution.
- `SUITECLOUD_SCOPE`, `SUITECLOUD_SCOPES`, `NS_SCOPES`: CI auth scopes.
- `SUITECLOUD_CI`, `SUITECLOUD_CI_PASSKEY`, `SUITECLOUD_FALLBACK_PASSKEY`: CI/passkey behavior for encrypted auth records.
- `SUITECLOUD_PROXY`: outbound HTTP proxy.
- `SUITECLOUD_HTTP_TRACE`, `SUITECLOUD_HTTP_TRACE_FILE`, `SUITECLOUD_HTTP_TRACE_BODY`: HTTP trace diagnostics.
- `SUITECLOUD_DEBUG`, `SUITECLOUD_VERBOSE`: runtime diagnostics flags.

## Versioning

Format:

`<fork_major>.<fork_minor>.<netsuite_year>-<netsuite_release>.<upstream_cli_compact>`

Current line: `1.0.2026-1.312`

## Publish (Maintainers)

From repository root:

```bash
npm publish -w packages/suitecloud-cli-fullnode --access public --tag latest
```

## Development

```bash
npm test -- --runInBand
```

## Contributing

See `CONTRIBUTING.md`.

## License

UPL-1.0. See `LICENSE.txt`.
