# SuiteCloud CLI (Java-free fork)

This repository maintains a Java-free fork of the SuiteCloud CLI for Node.js, focused on running in Linux/WSL without downloading or executing Oracle JAR artifacts.

## Current status

- Runtime engine: Node-only (`packages/node-cli/src/core/sdkexecutor/NodeSdkExecutor.js`)
- Java requirement: removed from runtime flow
- Supported command surface in this fork:
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

## Local install and smoke test

```bash
cd packages/node-cli
npm install
npm test -- --runInBand
npm pack
```

Install the generated tarball in an isolated prefix and run startup checks:

```bash
TEST_ROOT=/tmp/suitecloud-npm-smoke
PREFIX_DIR=$TEST_ROOT/prefix
mkdir -p "$PREFIX_DIR"
npm install -g --prefix "$PREFIX_DIR" ./oracle-suitecloud-cli-*.tgz
PATH="$PREFIX_DIR/bin:$PATH" suitecloud --help
```

## Notes

- This fork targets practical parity for the command set listed above.
- Live account deploy/validate behavior still depends on your tenant credentials and environment.
