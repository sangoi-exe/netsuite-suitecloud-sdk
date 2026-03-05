# SuiteCloud CLI (Java-Free Node Fork)

Java-free SuiteCloud CLI fork for Linux/WSL, with Node-only runtime and npm distribution under a non-official package name.

[![npm version](https://img.shields.io/npm/v/%40sangoi-exe%2Fsuitecloud-cli-fullnode)](https://www.npmjs.com/package/@sangoi-exe/suitecloud-cli-fullnode)
[![license](https://img.shields.io/github/license/sangoi-exe/netsuite-suitecloud-sdk)](./LICENSE.txt)
[![node](https://img.shields.io/badge/node-22%20LTS-339933)](https://nodejs.org/)
[![runtime](https://img.shields.io/badge/runtime-node--only-blue)](./packages/node-cli/src/core/sdkexecutor/NodeSdkExecutor.js)

Quick links: [Get Started](#get-started) - [Install](#install) - [Versioning Scheme](#versioning-scheme) - [Publish to npmjs](#publish-to-npmjs) - [Command Coverage](#command-coverage) - [Development](#development)

> [!IMPORTANT]
> Status: production-tested in WSL with browser `account:setup` + `project:deploy` working in Node-only flow.

## Table of Contents

- [Get Started](#get-started)
- [Install](#install)
- [Versioning Scheme](#versioning-scheme)
- [Publish to npmjs](#publish-to-npmjs)
- [Command Coverage](#command-coverage)
- [Development](#development)
- [License](#license)

## Get Started

Install globally from npm:

```bash
npm install -g @sangoi-exe/suitecloud-cli-fullnode
suitecloud --version
suitecloud --help
```

First account/project flow:

```bash
suitecloud account:setup
suitecloud project:deploy
```

## Install

Build and install from local tarball:

```bash
cd packages/node-cli
npm install
npm pack
npm install -g ./sangoi-exe-suitecloud-cli-fullnode-*.tgz
suitecloud --version
```

## Versioning Scheme

This fork uses a semver-compatible format:

`<fork_major>.<fork_minor>.<netsuite_year>-<netsuite_release>.<upstream_cli_compact>`

Current release:

- `1.0.2026-1.302`
- `1.0` = fork package version
- `2026-1` = NetSuite line `2026.1`
- `302` = upstream SuiteCloud CLI baseline `3.0.2`

## Publish to npmjs

```bash
npm login
cd packages/node-cli
npm publish --access public
```

If your npm user/scope is not `@sangoi-exe`, change `packages/node-cli/package.json` `name` before publish.

## Command Coverage

Implemented command surface in this fork:

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
cd packages/node-cli
npm test -- --runInBand
```

Node runtime entrypoint:

- `packages/node-cli/src/core/sdkexecutor/NodeSdkExecutor.js`

Detailed CLI docs:

- `packages/node-cli/README.md`

## License

UPL-1.0. See `LICENSE.txt`.
