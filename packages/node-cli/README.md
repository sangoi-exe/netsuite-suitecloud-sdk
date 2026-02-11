<p align="left"><a href="#"><img width="250" src="resources/Netsuite-logo-ocean-150-bg.png"></a></p>

# SuiteCloud CLI for Node.js
<p>
  <a href="https://www.npmjs.com/package/@oracle/suitecloud-cli">
    <img src="https://img.shields.io/npm/dm/@oracle/suitecloud-cli.svg" alt="npm-cli"/>
    <img src="https://img.shields.io/npm/v/@oracle/suitecloud-cli.svg" alt="npm-cli"/>
  </a>
</p>

SuiteCloud Command Line Interface (CLI) for Node.js is a SuiteCloud SDK tool to manage SuiteCloud project components and validate and deploy projects to your account.\
CLI for Node.js is an interactive tool that guides you through all the steps of the communication between your local project and your account.

## Prerequisites
The following software is required to work with SuiteCloud CLI for Node.js:
- Node.js version 22 LTS
- Java is **not required** in this fork.

Read the full list of prerequisites in [SuiteCloud CLI for Node.js Installation Prerequisites](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_1558708810.html).

## Supported Versions
To ensure that you get the latest features and bug fixes, you should use the latest version of the SuiteCloud CLI for Node.js available in NPM. 

The following table shows the CLI versions currently available in NPM.

| CLI Versions Available in NPM | Available Since | Compatible NetSuite Version |
|:-----------------------------:|:---------------:|:---------------------------:|
| 3.0.1 | 2025.2 | 2025.1 and 2025.2 |
| 3.0.0 | 2025.1 | 2024.2 and 2025.1 |

## Installation
Since CLI for Node.js is a development tool, use a global instance to install it by running the following command:

```
npm install -g @oracle/suitecloud-cli
```
CLI for Node.js is available from within any directory by running `suitecloud`.

## Fork notes (java-free)
This fork runs **without Java/JAR** and reimplements SDK behavior in Node.js.
Currently implemented in the Node engine:
- `account:setup` (browser OAuth2 authorization-code + PKCE; local callback on `127.0.0.1:52300-52315`)
- `account:setup:ci` (OAuth2 client_credentials; stores auth ID locally)
- `account:manageauth` (list/info/rename/remove local auth IDs)
- `project:create` (project skeleton + templates)
- `project:package` (zip from `deploy.xml`)
- `project:validate` (local validation of `deploy.xml` patterns; fails exit code when errors exist)
- `project:deploy --dryrun` (local preview of entries included by `deploy.xml`)
- `project:validate --server` (server validation via SuiteApp Dev Framework handlers; see notes below)
- `project:deploy` (server deploy via SuiteApp Dev Framework handlers; see notes below)
- `file:create` (SuiteScript skeleton + optional module injection)
- `file:list` (lists File Cabinet folders/files via REST Query Service/SuiteQL)
- `file:upload` (uploads local FileCabinet files via `filecabinetupload.nl`)
- `file:import` (downloads File Cabinet files via `ide.nl` ImportFiles; writes under `FileCabinet/` and `.attributes/`)
- `object:list` (lists SDF custom objects via `ide.nl` FetchCustomObjectList)
- `object:import` (downloads SDF custom objects via `ide.nl` FetchCustomObjectXml; writes under `Objects/`)
- `object:update` (overwrites existing SDF custom objects via `FetchCustomObjectXml` `mode=UPDATE`; for custom records, supports `includeinstances` via `fetchcustomrecordwithinstancesxml.nl`)

Global flags:
- `--debug`: prints stack traces and extra diagnostics on failures
- `--verbose`: prints per-command timings

Environment variables:
- `SUITECLOUD_SDK_HOME`: overrides the SDK cache folder (default: `~/.suitecloud-sdk`)
- `SUITECLOUD_CI_PASSKEY` / `SUITECLOUD_FALLBACK_PASSKEY`: encryption passkey for tokens stored in `$SUITECLOUD_SDK_HOME/auth/auth-store.json` (required for persistent OAuth tokens)
- `SUITECLOUD_INTEGRATION_CLIENT_ID` / `SUITECLOUD_OAUTH_CLIENT_ID`: optional integration client id override for browser `account:setup` (otherwise CLI uses SDK settings/default integration record per domain type)
- `SUITECLOUD_CLIENT_ID`: OAuth2 client id (Integration record) used by `account:setup:ci` if `--clientid` is not provided; also used as low-priority fallback by browser `account:setup`
- `SUITECLOUD_SCOPE` / `SUITECLOUD_SCOPES` / `NS_SCOPES`: OAuth2 scopes for `account:setup:ci` (default: `rest_webservices`). For server deploy/validate, include `restlets` (example: `"rest_webservices restlets"`).
- `SUITECLOUD_PROXY`: proxy URL for outbound HTTP(S) requests
- `SUITECLOUD_HTTP_TRACE`: logs sanitized HTTP request/response metadata to stderr (JSONL)
- `SUITECLOUD_HTTP_TRACE_FILE`: writes HTTP traces to a file instead of stderr
- `SUITECLOUD_HTTP_TRACE_BODY`: includes small request/response body snippets in traces (still sanitized; avoid using on sensitive flows)

### Server deploy/validate (experimental)
This fork runs `project:deploy` and `project:validate --server` via NetSuite SuiteApp Dev Framework handlers (`/app/suiteapp/devframework/ide*handler.nl`).
If you observe `HTTP 200` with an empty body from these handlers, enable `SUITECLOUD_HTTP_TRACE=1` and re-run to capture a sanitized trace for debugging.

### File import (experimental)
This fork runs `file:import` via `POST /app/ide/ide.nl` (multipart `action=ImportFiles` + `files=<xml>`). The response is a ZIP containing `status.xml` and the requested files.
If you see an HTML login response (“You must log in…”), your OAuth2 token likely lacks required scopes; include `restlets` (example: `--scope "rest_webservices restlets"`).

### Object list/import/update (experimental)
This fork runs `object:list`, `object:import` and `object:update` via `POST /app/ide/ide.nl` (multipart `action=FetchCustomObjectList|FetchCustomObjectXml`).
For `object:update` custom records with `-includeinstances`, it also calls `POST /app/ide/fetchcustomrecordwithinstancesxml.nl` and extracts the returned zip into the project.
If you see an HTML login response (“You must log in…”), your OAuth2 token likely lacks required scopes; include `restlets` (example: `--scope "rest_webservices restlets"`).

## Usage
CLI for Node.js uses the following syntax: 
```
suitecloud <command> <option> <argument>
```

### Commands
| Command | Description |
| --- | --- |
|[`account:manageauth`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_157304934116.html)|Manages authentication IDs for all your projects.|
|[`account:setup`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_89132630266.html)|Sets up an account to use with SuiteCloud SDK and configures the default auth ID for the SuiteCloud project. It requires browser-based login to NetSuite.|
|[`account:setup:ci`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_81134826821.html)|Sets up an account to use with SuiteCloud SDK and configures the default auth ID for the SuiteCloud project. It does not require browser-based login to NetSuite. This command is helpful for automated environments such as CI.|
|[`file:create`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_162810635242.html)|Creates SuiteScript files in the selected folder using the correct template with SuiteScript modules injected.|
|[`file:import`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_156041963273.html)|Imports files from an account to your account customization project.|
|[`file:list`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_156042966488.html)|Lists the files in the File Cabinet of your account.|
|[`file:upload`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_159066070687.html)|Uploads files from your project to an account.|
|[`object:import`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_156042181820.html)|Imports SDF custom objects from an account to your SuiteCloud project.|
|[`object:list`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_156043303237.html)|Lists the SDF custom objects deployed in an account.|
|[`object:update`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_156050566547.html)|Overwrites the SDF custom objects in the project with their matching objects imported from the account. In the case of custom records, custom instances can be included.|
|[`project:adddependencies`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_155981452469.html)| Adds missing dependencies to the manifest file.|
|[`project:create`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_156041348327.html)|Creates a SuiteCloud project, either a SuiteApp or an account customization project (ACP).|
|[`project:deploy`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_156044636320.html)|Deploys the folder containing the project.|
|[`project:package`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_159550971388.html)|Generates a ZIP file from your project, respecting the structure specified in the deploy.xml file.|
|[`project:validate`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_156049843194.html)|Validates the folder containing the SuiteCloud project.|

To check the help for a specific command, run the following command:
```
suitecloud {command} -h
```

Read the detailed documentation for all the commands in [SuiteCloud CLI for Node.js Reference](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_155931263126.html).

## Getting Started
🎞 To see how to install and set up CLI for Node.js, watch the following video:

<a href="https://videohub.oracle.com/media/Setting+Up+CLI+for+Nodej.s/0_091fc2ca"><img src="resources/video_setting_up_nodejs_cli.png" alt="Setting up CLI for Node.js video" width="400"></a>


Create a new project in an empty folder by running the following command:
```
suitecloud project:create -i
```

After you create a project, configure a NetSuite account, by running the following command within the project folder:
```
suitecloud account:setup
```

For CI/machine-to-machine authentication:
```
suitecloud account:setup:ci --account <ACCOUNT_ID> --authid <AUTH_ID> --clientid <CLIENT_ID> --certificateid <CERTIFICATE_ID> --privatekeypath <PATH_TO_PRIVATE_KEY_PEM> --scope "rest_webservices restlets"
```

## Release Notes & Documentation
To read the 2025.1 NetSuite's release notes and documentation, check the following sections of NetSuite's Help Center:
- Read the release notes for NetSuite 2025.1 in [SuiteCloud SDK Release Notes](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_1558730192.html).
- Read the latest updates under SuiteCloud SDK in the [Help Center Weekly Updates](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_3798389663.html).
- Read the CLI for Node.js documentation in [SuiteCloud CLI for Node.js Guide](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_1558708800.html).

## Contributing
SuiteCloud CLI for Node.js is an open source project. Pull Requests are currently not being accepted. See [Contributing](/CONTRIBUTING.md) for details.

## [License](/LICENSE.txt)
Copyright (c) 2019, 2023 Oracle and/or its affiliates The Universal Permissive License (UPL), Version 1.0.

By installing SuiteCloud CLI for Node.js, you are accepting the installation of the SuiteCloud SDK dependency under the [Oracle Free Use Terms and Conditions](https://www.oracle.com/downloads/licenses/oracle-free-license.html) license.

Note: this java-free fork does not download or execute the Oracle `cli-*.jar` at runtime; it reimplements the SDK behavior in Node.js.
