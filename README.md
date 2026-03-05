# suitecloud-cli-fullnode (Java-Free SuiteCloud CLI Fork)

Community-maintained SuiteCloud CLI fork focused on Linux/WSL with a Node-only runtime.

[![npm version](https://img.shields.io/npm/v/suitecloud-cli-fullnode)](https://www.npmjs.com/package/suitecloud-cli-fullnode)
[![license](https://img.shields.io/github/license/sangoi-exe/netsuite-suitecloud-sdk)](./LICENSE.txt)
[![node](https://img.shields.io/badge/node-22%20LTS-339933)](https://nodejs.org/)
[![runtime](https://img.shields.io/badge/runtime-node--only-blue)](./packages/suitecloud-cli-fullnode/src/core/sdkexecutor/NodeSdkExecutor.js)

> [!IMPORTANT]
> This is an unofficial package (`suitecloud-cli-fullnode`). It is not affiliated with Oracle.

Quick links: [Get Started](#get-started) - [Install from Source](#install-from-source) - [Versioning](#versioning) - [Publish](#publish) - [Command Coverage](#command-coverage) - [Development](#development)

## Get Started

Install globally from npm:

```bash
npm install -g suitecloud-cli-fullnode
suitecloud --version
suitecloud --help
```

First account/project flow:

```bash
suitecloud account:setup
suitecloud project:deploy
```

## Install from Source

```bash
cd packages/suitecloud-cli-fullnode
npm install
npm pack
npm install -g ./suitecloud-cli-fullnode-*.tgz
suitecloud --version
```

## Versioning

This fork uses:

`<fork_major>.<fork_minor>.<netsuite_year>-<netsuite_release>.<upstream_cli_compact>`

Current release:

- `1.0.2026-1.312`
- `1.0` = fork package line
- `2026-1` = NetSuite line `2026.1`
- `312` = upstream CLI baseline `3.1.2`

## Publish

From repository root:

```bash
npm publish -w packages/suitecloud-cli-fullnode --access public --tag latest
```

## Command Coverage

Implemented command surface:

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

## Development

```bash
cd packages/suitecloud-cli-fullnode
npm test -- --runInBand
```

Package README used by npm:

- `packages/suitecloud-cli-fullnode/README.md`

## License

UPL-1.0. See `LICENSE.txt`.
