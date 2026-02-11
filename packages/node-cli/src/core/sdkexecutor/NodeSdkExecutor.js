/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const ExecutionEnvironmentContext = require('../../ExecutionEnvironmentContext');
const CommandUtils = require('../../utils/CommandUtils');
const ProjectPackagingService = require('../../services/ProjectPackagingService');
const DiagnosticsService = require('../../services/DiagnosticsService');
const ProjectCreationService = require('../../services/ProjectCreationService');
const SuiteScriptFileService = require('../../services/SuiteScriptFileService');
const ProjectValidationService = require('../../services/ProjectValidationService');
const ProjectPreviewService = require('../../services/ProjectPreviewService');
const ProjectAddDependenciesService = require('../../services/ProjectAddDependenciesService');
const AuthStoreService = require('../../services/auth/AuthStoreService');
const NetSuiteCiAuthService = require('../../services/auth/NetSuiteCiAuthService');
const NetSuitePkceAuthService = require('../../services/auth/NetSuitePkceAuthService');
const NetSuiteFileCabinetService = require('../../services/netsuite/NetSuiteFileCabinetService');
const NetSuiteFileCabinetUploadService = require('../../services/netsuite/NetSuiteFileCabinetUploadService');
const NetSuiteFileCabinetImportService = require('../../services/netsuite/NetSuiteFileCabinetImportService');
const NetSuiteCustomObjectsService = require('../../services/netsuite/NetSuiteCustomObjectsService');
const NetSuiteSdfDevFrameworkService = require('../../services/netsuite/NetSuiteSdfDevFrameworkService');
const ProjectInfoService = require('../../services/ProjectInfoService');
const NodeTranslationService = require('../../services/NodeTranslationService');
const { UTILS } = require('../../services/TranslationKeys');
const CookieJar = require('../../utils/http/CookieJar');
const path = require('path');
const fs = require('fs');
const { PROJECT_ACP } = require('../../ApplicationConstants');

const COMMANDS = {
	PACKAGE: 'package',
	CREATE_PROJECT: 'createproject',
	CREATE_FILE: 'createfile',
	ADD_DEPENDENCIES: 'adddependencies',
	VALIDATE: 'validate',
	PREVIEW: 'preview',
	DEPLOY: 'deploy',
	AUTHENTICATE: 'authenticate',
	AUTHENTICATE_CI: 'authenticateci',
	MANAGEAUTH: 'manageauth',
	INSPECT_AUTHORIZATION: 'inspectauthorization',
	REFRESH_AUTHORIZATION: 'refreshauthorization',
	LISTFOLDERS: 'listfolders',
	LISTFILES: 'listfiles',
	UPLOADFILES: 'uploadfiles',
	IMPORTFILES: 'importfiles',
	LISTOBJECTS: 'listobjects',
	IMPORTOBJECTS: 'importobjects',
	UPDATE: 'update',
	UPDATE_CUSTOM_RECORD_WITH_INSTANCES: 'updatecustomrecordwithinstances',
};

const PARAMS = {
	PROJECT: '-project',
	DESTINATION: '-destination',
	PARENT_DIRECTORY: '-parentdirectory',
	TYPE: '-type',
	PROJECT_NAME: '-projectname',
	PUBLISHER_ID: '-publisherid',
	PROJECT_ID: '-projectid',
	PROJECT_VERSION: '-projectversion',
	PATH: '-path',
	MODULE: '-module',
	AUTH_ID: '-authid',
	ACCOUNT: '-account',
	CERTIFICATE_ID: '-certificateid',
	PRIVATE_KEY_PATH: '-privatekeypath',
	URL: '-url',
	CLIENT_ID: '-clientid',
	SCOPE: '-scope',
	INFO: '-info',
	REMOVE: '-remove',
	RENAME: '-rename',
	RENAMETO: '-renameto',
	FOLDER: '-folder',
	PATHS: '-paths',
	APP_ID: '-appid',
	SCRIPT_ID: '-scriptid',
	DESTINATION_FOLDER: '-destinationfolder',
	ACCOUNT_SPECIFIC_VALUES: '-accountspecificvalues',
	LOG: '-log',
	EXCLUDE_PROPERTIES: '-excludeproperties',
	FEATURE: '-feature',
	FILE: '-file',
	OBJECT: '-object',
};

const SUPPORTED_COMMANDS = [
	COMMANDS.PACKAGE,
	COMMANDS.CREATE_PROJECT,
	COMMANDS.CREATE_FILE,
	COMMANDS.ADD_DEPENDENCIES,
	COMMANDS.VALIDATE,
	COMMANDS.PREVIEW,
	COMMANDS.DEPLOY,
	COMMANDS.AUTHENTICATE,
	COMMANDS.AUTHENTICATE_CI,
	COMMANDS.MANAGEAUTH,
	COMMANDS.INSPECT_AUTHORIZATION,
	COMMANDS.REFRESH_AUTHORIZATION,
	COMMANDS.LISTFOLDERS,
	COMMANDS.LISTFILES,
	COMMANDS.UPLOADFILES,
	COMMANDS.IMPORTFILES,
	COMMANDS.LISTOBJECTS,
	COMMANDS.IMPORTOBJECTS,
	COMMANDS.UPDATE,
	COMMANDS.UPDATE_CUSTOM_RECORD_WITH_INSTANCES,
];

const FLAGS = {
	SERVER: '-server',
	LIST: '-list',
	VALIDATE: '-validate',
	APPLY_INSTALLATION_PREFERENCES: '-applyinstallprefs',
	EXCLUDE_FILES: '-excludefiles',
	ALL: '-all',
};

function buildNotImplementedMessage(executionContext) {
	const command = executionContext && executionContext.getCommand ? executionContext.getCommand() : '<unknown>';
	let message = `Java-free Node engine: SDK command "${command}" is not implemented yet. Supported: ${SUPPORTED_COMMANDS.join(', ')}.`;

	if (DiagnosticsService.isDebugEnabled() && executionContext) {
		const params = executionContext.getParams ? executionContext.getParams() : {};
		const flags = executionContext.getFlags ? executionContext.getFlags() : [];
		const sanitizedParams = DiagnosticsService.sanitizeSdkParams(params);
		message += `\n\nParams:\n${JSON.stringify(sanitizedParams, null, 2)}\nFlags:\n${JSON.stringify(flags, null, 2)}`;
	}

	return message;
}

module.exports = class NodeSdkExecutor {
	constructor(sdkPath, executionEnvironmentContext) {
		this._sdkPath = sdkPath;
		this._executionEnvironmentContext = executionEnvironmentContext || new ExecutionEnvironmentContext();
		this._projectPackagingService = new ProjectPackagingService();
		this._projectCreationService = new ProjectCreationService();
		this._suiteScriptFileService = new SuiteScriptFileService();
		this._projectValidationService = new ProjectValidationService();
		this._projectPreviewService = new ProjectPreviewService();
		this._projectAddDependenciesService = new ProjectAddDependenciesService();
		this._authStoreService = new AuthStoreService(this._sdkPath);
		this._ciAuthService = new NetSuiteCiAuthService();
		this._pkceAuthService = new NetSuitePkceAuthService();
		this._netSuiteFileCabinetService = new NetSuiteFileCabinetService();
		this._netSuiteFileCabinetUploadService = new NetSuiteFileCabinetUploadService();
		this._netSuiteFileCabinetImportService = new NetSuiteFileCabinetImportService();
		this._netSuiteCustomObjectsService = new NetSuiteCustomObjectsService();
		this._netSuiteSdfDevFrameworkService = new NetSuiteSdfDevFrameworkService();
	}

	async execute(executionContext) {
		if (executionContext && executionContext.getCommand && executionContext.getCommand() === COMMANDS.PACKAGE) {
			return this._package(executionContext);
		}
		if (executionContext && executionContext.getCommand && executionContext.getCommand() === COMMANDS.CREATE_PROJECT) {
			return this._createProject(executionContext);
		}
		if (executionContext && executionContext.getCommand && executionContext.getCommand() === COMMANDS.CREATE_FILE) {
			return this._createFile(executionContext);
		}
		if (executionContext && executionContext.getCommand && executionContext.getCommand() === COMMANDS.ADD_DEPENDENCIES) {
			return this._addDependencies(executionContext);
		}
		if (executionContext && executionContext.getCommand && executionContext.getCommand() === COMMANDS.VALIDATE) {
			return this._validate(executionContext);
		}
		if (executionContext && executionContext.getCommand && executionContext.getCommand() === COMMANDS.PREVIEW) {
			return this._preview(executionContext);
		}
		if (executionContext && executionContext.getCommand && executionContext.getCommand() === COMMANDS.DEPLOY) {
			return this._deploy(executionContext);
		}
		if (executionContext && executionContext.getCommand && executionContext.getCommand() === COMMANDS.AUTHENTICATE) {
			return this._authenticate(executionContext);
		}
		if (executionContext && executionContext.getCommand && executionContext.getCommand() === COMMANDS.AUTHENTICATE_CI) {
			return this._authenticateCi(executionContext);
		}
		if (executionContext && executionContext.getCommand && executionContext.getCommand() === COMMANDS.MANAGEAUTH) {
			return this._manageAuth(executionContext);
		}
		if (executionContext && executionContext.getCommand && executionContext.getCommand() === COMMANDS.INSPECT_AUTHORIZATION) {
			return this._inspectAuthorization(executionContext);
		}
		if (executionContext && executionContext.getCommand && executionContext.getCommand() === COMMANDS.REFRESH_AUTHORIZATION) {
			return this._refreshAuthorization(executionContext);
		}
		if (executionContext && executionContext.getCommand && executionContext.getCommand() === COMMANDS.LISTFOLDERS) {
			return this._listFolders(executionContext);
		}
		if (executionContext && executionContext.getCommand && executionContext.getCommand() === COMMANDS.LISTFILES) {
			return this._listFiles(executionContext);
		}
		if (executionContext && executionContext.getCommand && executionContext.getCommand() === COMMANDS.UPLOADFILES) {
			return this._uploadFiles(executionContext);
		}
		if (executionContext && executionContext.getCommand && executionContext.getCommand() === COMMANDS.IMPORTFILES) {
			return this._importFiles(executionContext);
		}
		if (executionContext && executionContext.getCommand && executionContext.getCommand() === COMMANDS.LISTOBJECTS) {
			return this._listObjects(executionContext);
		}
		if (executionContext && executionContext.getCommand && executionContext.getCommand() === COMMANDS.IMPORTOBJECTS) {
			return this._importObjects(executionContext);
		}
		if (executionContext && executionContext.getCommand && executionContext.getCommand() === COMMANDS.UPDATE) {
			return this._updateObjects(executionContext);
		}
		if (
			executionContext &&
			executionContext.getCommand &&
			executionContext.getCommand() === COMMANDS.UPDATE_CUSTOM_RECORD_WITH_INSTANCES
		) {
			return this._updateCustomRecordWithInstances(executionContext);
		}

		if (executionContext && executionContext.isIntegrationMode && executionContext.isIntegrationMode()) {
			return {
				status: 'ERROR',
				errorMessages: [buildNotImplementedMessage(executionContext)],
			};
		}
		throw buildNotImplementedMessage(executionContext);
	}

	async _authenticate(executionContext) {
		const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};
		const authId = params[PARAMS.AUTH_ID];
		const domain = params[PARAMS.URL] ? CommandUtils.unquoteString(params[PARAMS.URL]) : null;

		if (!authId) {
			return { status: 'ERROR', errorMessages: ['Missing required parameter -authid for authenticate.'] };
		}

		try {
			const authResult = await this._pkceAuthService.authenticate({
				sdkPath: this._sdkPath,
				domain,
			});

			const now = new Date().toISOString();
			this._authStoreService.upsert(authId, {
				type: 'PKCE',
				accountInfo: authResult.accountInfo,
				hostInfo: authResult.hostInfo,
				domains: authResult.domains,
				authConfig: authResult.authConfig,
				token: authResult.token,
				createdAt: now,
				updatedAt: now,
			});

			return {
				status: 'SUCCESS',
				data: { accountInfo: authResult.accountInfo },
				resultMessage: `Authentication ID "${authId}" configured.`,
				errorMessages: [],
			};
		} catch (error) {
			const message = error && error.message ? error.message : `${error}`;
			return { status: 'ERROR', errorMessages: [message] };
		}
	}

	async _authenticateCi(executionContext) {
		const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};
		const authId = params[PARAMS.AUTH_ID];
		const accountId = params[PARAMS.ACCOUNT];
		const certificateId = params[PARAMS.CERTIFICATE_ID];
		const clientId = params[PARAMS.CLIENT_ID];
		const scope = params[PARAMS.SCOPE];
		const privateKeyPath = CommandUtils.unquoteString(params[PARAMS.PRIVATE_KEY_PATH] || '');
		const domain = params[PARAMS.URL] ? CommandUtils.unquoteString(params[PARAMS.URL]) : null;

		if (!authId || !accountId || !certificateId || !privateKeyPath) {
			return { status: 'ERROR', errorMessages: ['Missing required parameters for authenticateci.'] };
		}

		try {
			const authResult = await this._ciAuthService.authenticateCi({
				accountId,
				clientId,
				certificateId,
				privateKeyPath,
				domain,
				scope,
			});

			this._authStoreService.upsert(authId, {
				type: 'CLIENT_CREDENTIALS',
				accountInfo: authResult.accountInfo,
				hostInfo: authResult.hostInfo,
				domains: authResult.domains,
				authConfig: authResult.authConfig,
				token: authResult.token,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			return {
				status: 'SUCCESS',
				data: { accountInfo: authResult.accountInfo },
				resultMessage: `Authentication ID "${authId}" configured.`,
				errorMessages: [],
			};
		} catch (error) {
			const message = error && error.message ? error.message : `${error}`;
			return { status: 'ERROR', errorMessages: [message] };
		}
	}

	async _manageAuth(executionContext) {
		const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};
		const flags = (executionContext && executionContext.getFlags && executionContext.getFlags()) || [];

		try {
			if (flags.includes(FLAGS.LIST)) {
				return {
					status: 'SUCCESS',
					data: this._authStoreService.list(),
					resultMessage: 'Authentication IDs listed.',
					errorMessages: [],
				};
			}

			if (params[PARAMS.INFO]) {
				const authId = params[PARAMS.INFO];
				const record = this._authStoreService.get(authId);
				if (!record) {
					return { status: 'ERROR', errorMessages: [`Authentication ID "${authId}" not found.`] };
				}
				return {
					status: 'SUCCESS',
					data: { accountInfo: record.accountInfo, hostInfo: record.hostInfo },
					resultMessage: `Authentication ID "${authId}".`,
					errorMessages: [],
				};
			}

			if (params[PARAMS.REMOVE]) {
				const authId = params[PARAMS.REMOVE];
				const removed = this._authStoreService.remove(authId);
				if (!removed) {
					return { status: 'ERROR', errorMessages: [`Authentication ID "${authId}" not found.`] };
				}
				return {
					status: 'SUCCESS',
					data: {},
					resultMessage: `Authentication ID "${authId}" removed.`,
					errorMessages: [],
				};
			}

			if (params[PARAMS.RENAME]) {
				const fromAuthId = params[PARAMS.RENAME];
				const toAuthId = params[PARAMS.RENAMETO];
				if (!toAuthId) {
					return { status: 'ERROR', errorMessages: ['Missing -renameto for manageauth -rename.'] };
				}
				this._authStoreService.rename(fromAuthId, toAuthId);
				return {
					status: 'SUCCESS',
					data: {},
					resultMessage: `Authentication ID renamed from "${fromAuthId}" to "${toAuthId}".`,
					errorMessages: [],
				};
			}

			return { status: 'ERROR', errorMessages: ['No manageauth action specified.'] };
		} catch (error) {
			const message = error && error.message ? error.message : `${error}`;
			return { status: 'ERROR', errorMessages: [message] };
		}
	}

	async _inspectAuthorization(executionContext) {
		const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};
		const authId = params[PARAMS.AUTH_ID];
		if (!authId) {
			return { status: 'ERROR', errorMessages: ['Missing -authid for inspectauthorization.'] };
		}

		const record = this._authStoreService.get(authId);
		if (!record) {
			return { status: 'ERROR', errorMessages: [`Authentication ID "${authId}" not found.`] };
		}

		const expiresAt = record.token && record.token.expiresAt ? Date.parse(record.token.expiresAt) : null;
		const isExpired = typeof expiresAt === 'number' && !Number.isNaN(expiresAt) ? expiresAt <= Date.now() : true;

		return {
			status: 'SUCCESS',
			data: { needsReauthorization: isExpired },
			errorMessages: [],
		};
	}

	async _refreshAuthorization(executionContext) {
		const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};
		const authId = params[PARAMS.AUTH_ID];
		if (!authId) {
			return { status: 'ERROR', errorMessages: ['Missing -authid for refreshauthorization.'] };
		}

		try {
			const recordWithSecrets = this._authStoreService.getWithSecrets(authId);
			if (!recordWithSecrets) {
				return { status: 'ERROR', errorMessages: [`Authentication ID "${authId}" not found.`] };
			}
			if (!recordWithSecrets.authConfig) {
				return { status: 'ERROR', errorMessages: [`Authentication ID "${authId}" has incomplete authentication configuration.`] };
			}

			let authResult;
			if (recordWithSecrets.type === 'CLIENT_CREDENTIALS') {
				authResult = await this._ciAuthService.authenticateCi({
					accountId: recordWithSecrets.authConfig.accountId,
					clientId: recordWithSecrets.authConfig.clientId,
					certificateId: recordWithSecrets.authConfig.certificateId,
					privateKeyPath: recordWithSecrets.authConfig.privateKeyPath,
					domain: recordWithSecrets.authConfig.domain,
					scope: recordWithSecrets.authConfig.scope,
				});
			} else if (recordWithSecrets.type === 'PKCE') {
				authResult = await this._pkceAuthService.refreshWithRefreshToken({
					accountId: recordWithSecrets.authConfig.accountId,
					clientId: recordWithSecrets.authConfig.clientId,
					domain: recordWithSecrets.authConfig.domain,
					scope: recordWithSecrets.authConfig.scope,
					domains: recordWithSecrets.domains,
					refreshToken: recordWithSecrets.token && recordWithSecrets.token.refreshToken,
				});
			} else {
				return { status: 'ERROR', errorMessages: [`Authentication ID "${authId}" has unsupported auth type "${recordWithSecrets.type}".`] };
			}

			this._authStoreService.upsert(authId, {
				...recordWithSecrets,
				accountInfo: authResult.accountInfo,
				hostInfo: authResult.hostInfo,
				domains: authResult.domains,
				authConfig: {
					...(recordWithSecrets.authConfig || {}),
					...((authResult && authResult.authConfig) || {}),
				},
				token: {
					...(recordWithSecrets.token || {}),
					...((authResult && authResult.token) || {}),
				},
				updatedAt: new Date().toISOString(),
			});

			return {
				status: 'SUCCESS',
				data: { refreshed: true },
				resultMessage: `Authorization refreshed for "${authId}".`,
				errorMessages: [],
			};
		} catch (error) {
			const message = error && error.message ? error.message : `${error}`;
			return { status: 'ERROR', errorMessages: [message] };
		}
	}

	async _ensureValidAccessToken(authId) {
		let record;
		let hydrationError;
		try {
			record = this._authStoreService.getWithSecrets(authId);
		} catch (e) {
			hydrationError = e;
			// If the token is encrypted but no passkey is configured, fall back to a refresh using authConfig.
			record = this._authStoreService.get(authId);
		}
		if (!record) {
			throw new Error(`Authentication ID "${authId}" not found.`);
		}
		if (record.type === 'PKCE' && hydrationError) {
			throw hydrationError;
		}
		const isSupportedAuthType = record.type === 'CLIENT_CREDENTIALS' || record.type === 'PKCE';
		if (!isSupportedAuthType || !record.authConfig) {
			throw new Error(`Authentication ID "${authId}" is not a supported auth type for REST operations.`);
		}

		const expiresAt = record.token && record.token.expiresAt ? Date.parse(record.token.expiresAt) : null;
		const isExpired = typeof expiresAt === 'number' && !Number.isNaN(expiresAt) ? expiresAt <= Date.now() + 60000 : true;
		const hasToken = Boolean(record.token && record.token.accessToken);

		if (!hasToken || isExpired) {
			let authResult;
				if (record.type === 'CLIENT_CREDENTIALS') {
					authResult = await this._ciAuthService.authenticateCi({
						accountId: record.authConfig.accountId,
						clientId: record.authConfig.clientId,
						certificateId: record.authConfig.certificateId,
						privateKeyPath: record.authConfig.privateKeyPath,
						domain: record.authConfig.domain,
						scope: record.authConfig.scope,
					});
				} else if (record.type === 'PKCE') {
					const refreshToken = record.token && record.token.refreshToken;
					if (!refreshToken) {
						throw new Error(NodeTranslationService.getMessage(UTILS.AUTHENTICATION.OAUTH_REFRESH_MISSING_TOKEN));
					}
					authResult = await this._pkceAuthService.refreshWithRefreshToken({
						accountId: record.authConfig.accountId,
						clientId: record.authConfig.clientId,
						domain: record.authConfig.domain,
						scope: record.authConfig.scope,
						domains: record.domains,
						refreshToken,
					});
				} else {
				throw new Error(`Authentication ID "${authId}" has unsupported auth type "${record.type}".`);
			}

			const updatedRecord = {
				...record,
				accountInfo: authResult.accountInfo,
				hostInfo: authResult.hostInfo,
				domains: authResult.domains,
				authConfig: {
					...(record.authConfig || {}),
					...((authResult && authResult.authConfig) || {}),
				},
				token: {
					...(record.token || {}),
					...((authResult && authResult.token) || {}),
				},
				updatedAt: new Date().toISOString(),
			};

			this._authStoreService.upsert(authId, updatedRecord);
			record = updatedRecord;
		}

		if (!record || !record.domains || !record.domains.restDomain) {
			throw new Error(`Authentication ID "${authId}" is missing REST domain information.`);
		}
		if (!record.token || !record.token.accessToken) {
			throw new Error(`Authentication ID "${authId}" has no access token available.`);
		}

		return {
			restDomain: record.domains.restDomain,
			systemDomain: record.domains.systemDomain,
			accessToken: record.token.accessToken,
		};
	}

	async _listFolders(executionContext) {
		const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};
		const authId = params[PARAMS.AUTH_ID];
		if (!authId) {
			return { status: 'ERROR', errorMessages: ['Missing -authid for listfolders.'] };
		}

		try {
			const { restDomain, accessToken } = await this._ensureValidAccessToken(authId);
			const folders = await this._netSuiteFileCabinetService.listFolders({ restDomain, accessToken });
			return {
				status: 'SUCCESS',
				data: folders,
				resultMessage: `Found ${folders.length} folder(s).`,
				errorMessages: [],
			};
		} catch (error) {
			const message = error && error.message ? error.message : `${error}`;
			return { status: 'ERROR', errorMessages: [message] };
		}
	}

	async _listFiles(executionContext) {
		const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};
		const authId = params[PARAMS.AUTH_ID];
		const folderPath = CommandUtils.unquoteString(params[PARAMS.FOLDER] || '');
		if (!authId) {
			return { status: 'ERROR', errorMessages: ['Missing -authid for listfiles.'] };
		}
		if (!folderPath) {
			return { status: 'ERROR', errorMessages: ['Missing -folder for listfiles.'] };
		}

		try {
			const { restDomain, accessToken } = await this._ensureValidAccessToken(authId);
			const files = await this._netSuiteFileCabinetService.listFiles({ restDomain, accessToken, folderPath });
			return {
				status: 'SUCCESS',
				data: files,
				resultMessage: `Found ${files.length} file(s).`,
				errorMessages: [],
			};
		} catch (error) {
			const message = error && error.message ? error.message : `${error}`;
			return { status: 'ERROR', errorMessages: [message] };
		}
	}

	_parseQuotedList(value) {
		const raw = `${value || ''}`.trim();
		if (!raw) {
			return [];
		}

		const matches = [];
		const regex = /"([^"]+)"/g;
		let match;
		while ((match = regex.exec(raw)) !== null) {
			matches.push(match[1]);
		}

		if (matches.length > 0) {
			return matches;
		}
		return raw.split(/\s+/).filter(Boolean);
	}

	_tryGetProjectApplicationId(projectFolder) {
		try {
			const projectInfo = new ProjectInfoService(projectFolder);
			if (!projectInfo.isSuiteAppProject()) {
				return null;
			}
			const applicationId = projectInfo.getApplicationId();
			return applicationId ? `${applicationId}`.trim() : null;
		} catch (e) {
			return null;
		}
	}

	_getPackageRoot(projectFolder) {
		const applicationId = this._tryGetProjectApplicationId(projectFolder);
		if (applicationId) {
			return `/SuiteApps/${applicationId}`;
		}
		return '/SuiteScripts';
	}

	async _uploadFiles(executionContext) {
		const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};
		const authId = params[PARAMS.AUTH_ID];
		const projectFolder = CommandUtils.unquoteString(params[PARAMS.PROJECT] || '');
		const pathsRaw = params[PARAMS.PATHS];

		if (!authId) {
			return { status: 'ERROR', errorMessages: ['Missing -authid for uploadfiles.'] };
		}
		if (!projectFolder) {
			return { status: 'ERROR', errorMessages: ['Missing -project for uploadfiles.'] };
		}
		if (!pathsRaw) {
			return { status: 'ERROR', errorMessages: ['Missing -paths for uploadfiles.'] };
		}

		const fileCabinetPaths = this._parseQuotedList(pathsRaw);
		if (fileCabinetPaths.length === 0) {
			return { status: 'ERROR', errorMessages: ['No paths provided for uploadfiles.'] };
		}

		try {
			const { systemDomain, accessToken } = await this._ensureValidAccessToken(authId);
			if (!systemDomain) {
				throw new Error(`Authentication ID "${authId}" is missing system domain information.`);
			}

			const results = [];
			for (const fileCabinetPath of fileCabinetPaths) {
				const normalized = `${fileCabinetPath}`.trim();
				if (!normalized) {
					continue;
				}

				const absolutePath = path.join(projectFolder, 'FileCabinet', normalized.replace(/^\/+/, ''));
				const parentFolderPath = path.posix.dirname(normalized.startsWith('/') ? normalized : `/${normalized}`);

				try {
					if (!fs.existsSync(absolutePath)) {
						throw new Error('Local file not found.');
					}
					const stat = fs.statSync(absolutePath);
					if (!stat.isFile()) {
						throw new Error('Local path is not a file.');
					}

					await this._netSuiteFileCabinetUploadService.uploadFile({
						systemDomain,
						accessToken,
						parentFolderPath,
						filePath: absolutePath,
					});

					results.push({ file: { path: absolutePath }, type: 'SUCCESS' });
				} catch (error) {
					const message = error && error.message ? error.message : `${error}`;
					results.push({ file: { path: absolutePath }, type: 'ERROR', errorMessage: message });
				}
			}

			const failed = results.filter((r) => r.type === 'ERROR').length;
			const succeeded = results.filter((r) => r.type === 'SUCCESS').length;

			return {
				status: 'SUCCESS',
				data: results,
				resultMessage: `Uploaded ${succeeded} file(s), ${failed} failed.`,
				errorMessages: [],
			};
		} catch (error) {
			const message = error && error.message ? error.message : `${error}`;
			return { status: 'ERROR', errorMessages: [message] };
		}
	}

		async _importFiles(executionContext) {
			const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};
			const authId = params[PARAMS.AUTH_ID];
			const projectFolder = CommandUtils.unquoteString(params[PARAMS.PROJECT] || '');
		const pathsRaw = params[PARAMS.PATHS];
		const excludeProperties = Object.prototype.hasOwnProperty.call(params, PARAMS.EXCLUDE_PROPERTIES);

		if (!authId) {
			return { status: 'ERROR', errorMessages: ['Missing -authid for importfiles.'] };
		}
		if (!projectFolder) {
			return { status: 'ERROR', errorMessages: ['Missing -project for importfiles.'] };
		}
		if (!pathsRaw) {
			return { status: 'ERROR', errorMessages: ['Missing -paths for importfiles.'] };
		}

		const fileCabinetPaths = this._parseQuotedList(pathsRaw);
		if (fileCabinetPaths.length === 0) {
			return { status: 'ERROR', errorMessages: ['No paths provided for importfiles.'] };
		}

		try {
			const { systemDomain, accessToken } = await this._ensureValidAccessToken(authId);
			if (!systemDomain) {
				throw new Error(`Authentication ID "${authId}" is missing system domain information.`);
			}

			const importResult = await this._netSuiteFileCabinetImportService.importFiles({
				systemDomain,
				accessToken,
				projectFolder,
				filePaths: fileCabinetPaths,
				excludeProperties,
			});

			const results = importResult && Array.isArray(importResult.results) ? importResult.results : [];
			const loadedCount = results.filter((r) => r && r.loaded === true).length;

			return {
				status: 'SUCCESS',
				data: { results },
				resultMessage: `Imported ${loadedCount} file(s).`,
				errorMessages: [],
			};
		} catch (error) {
			const message = error && error.message ? error.message : `${error}`;
			return { status: 'ERROR', errorMessages: [message] };
			}
		}

		async _listObjects(executionContext) {
			const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};
			const authId = params[PARAMS.AUTH_ID];
			const appId = params[PARAMS.APP_ID] ? `${params[PARAMS.APP_ID]}`.trim() : null;
			const types = params[PARAMS.TYPE] ? this._parseQuotedList(params[PARAMS.TYPE]) : [];
			const scriptIdContains = params[PARAMS.SCRIPT_ID] ? `${params[PARAMS.SCRIPT_ID]}`.trim() : '';

			if (!authId) {
				return { status: 'ERROR', errorMessages: ['Missing -authid for listobjects.'] };
			}

			try {
				const { systemDomain, accessToken } = await this._ensureValidAccessToken(authId);
				if (!systemDomain) {
					throw new Error(`Authentication ID "${authId}" is missing system domain information.`);
				}

				const objects = await this._netSuiteCustomObjectsService.listObjects({
					systemDomain,
					accessToken,
					types,
					scriptIdContains,
					appId,
				});

				return {
					status: 'SUCCESS',
					data: objects,
					resultMessage: `Found ${objects.length} object(s).`,
					errorMessages: [],
				};
			} catch (error) {
				const message = error && error.message ? error.message : `${error}`;
				return { status: 'ERROR', errorMessages: [message] };
			}
		}

		async _importObjects(executionContext) {
			const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};
			const flags = (executionContext && executionContext.getFlags && executionContext.getFlags()) || [];

			const authId = params[PARAMS.AUTH_ID];
			const projectFolder = CommandUtils.unquoteString(params[PARAMS.PROJECT] || '');
			const destinationFolderRaw = CommandUtils.unquoteString(params[PARAMS.DESTINATION_FOLDER] || '');
			const objectTypeRaw = params[PARAMS.TYPE] ? `${params[PARAMS.TYPE]}`.trim() : '';
			const scriptIdsRaw = params[PARAMS.SCRIPT_ID];
			const excludeFiles = flags.includes(FLAGS.EXCLUDE_FILES);

			if (!authId) {
				return { status: 'ERROR', errorMessages: ['Missing -authid for importobjects.'] };
			}
			if (!projectFolder) {
				return { status: 'ERROR', errorMessages: ['Missing -project for importobjects.'] };
			}
			if (!destinationFolderRaw) {
				return { status: 'ERROR', errorMessages: ['Missing -destinationfolder for importobjects.'] };
			}
			if (!objectTypeRaw) {
				return { status: 'ERROR', errorMessages: ['Missing -type for importobjects.'] };
			}
			if (!scriptIdsRaw) {
				return { status: 'ERROR', errorMessages: ['Missing -scriptid for importobjects.'] };
			}

			const appId = params[PARAMS.APP_ID] ? `${params[PARAMS.APP_ID]}`.trim() : null;
			const scriptIds = this._parseQuotedList(scriptIdsRaw);
			if (scriptIds.length === 0) {
				return { status: 'ERROR', errorMessages: ['No script IDs provided for importobjects.'] };
			}

			const destinationFolder = path.resolve(projectFolder, destinationFolderRaw.replace(/^\/+/, ''));
			const destinationRelative = path.relative(projectFolder, destinationFolder);
			if (destinationRelative.startsWith('..') || path.isAbsolute(destinationRelative)) {
				return { status: 'ERROR', errorMessages: ['Destination folder must be inside the project folder.'] };
			}
			const objectsPrefix = `Objects${path.sep}`;
			if (destinationRelative !== 'Objects' && !destinationRelative.startsWith(objectsPrefix)) {
				return { status: 'ERROR', errorMessages: ['Destination folder must be within the Objects folder.'] };
			}

			try {
				const { systemDomain, accessToken } = await this._ensureValidAccessToken(authId);
				if (!systemDomain) {
					throw new Error(`Authentication ID "${authId}" is missing system domain information.`);
				}

				const packageRoot = this._getPackageRoot(projectFolder);
				let objects = [];
				const missingFromList = [];
				const isAll = objectTypeRaw.toUpperCase() === 'ALL';

				if (isAll) {
					const listed = await this._netSuiteCustomObjectsService.listObjects({
						systemDomain,
						accessToken,
						types: [],
						scriptIdContains: '',
						appId,
						packageRoot,
					});
					const byScriptId = new Map(listed.map((o) => [o.scriptId, o]));
					for (const id of scriptIds) {
						const match = byScriptId.get(id);
						if (!match) {
							missingFromList.push(id);
							continue;
						}
						objects.push({ type: match.type, scriptId: match.scriptId, appId: match.appId || '' });
					}
				} else {
					objects = scriptIds.map((id) => ({ type: objectTypeRaw, scriptId: id, appId: appId || '' }));
				}

				if (objects.length > 0) {
					const importResult = await this._netSuiteCustomObjectsService.importObjects({
						systemDomain,
						accessToken,
						destinationFolder,
						objects,
						packageRoot,
						excludeFiles,
					});

					const statusResults = (importResult && importResult.results) || [];
					const statusByKey = new Map(statusResults.map((r) => [r.key, r]));

					const normalizeFileCabinetPath = (value) => {
						const raw = `${value || ''}`.trim().replaceAll('\\', '/');
						if (!raw) {
							return '';
						}
						const stripped = raw.replaceAll(/^[\"']+|[\"']+$/g, '');
						const withoutTrailingPunct = stripped.replaceAll(/[),;\]]+$/g, '');
						return withoutTrailingPunct.startsWith('/') ? withoutTrailingPunct : `/${withoutTrailingPunct}`;
					};

					const decodeXmlEntities = (value) =>
						`${value || ''}`
							.replaceAll('&amp;', '&')
							.replaceAll('&lt;', '<')
							.replaceAll('&gt;', '>')
							.replaceAll('&quot;', '"')
							.replaceAll('&apos;', "'");

					const extractReferencedFileCabinetPaths = (xmlText) => {
						const text = `${xmlText || ''}`;
						if (!text) {
							return [];
						}

						const matches = text.match(/\/(?:SuiteScripts|SuiteApps|Templates|Web Site Hosting Files)\/[^<\"']+/g) || [];
						const out = new Set();
						for (const match of matches) {
							const normalized = normalizeFileCabinetPath(decodeXmlEntities(match));
							if (!normalized || normalized.endsWith('/')) {
								continue;
							}
							out.add(normalized);
						}
						return [...out];
					};

					let referencedFilesByScriptId = new Map();
					if (!excludeFiles) {
						const projectInfo = new ProjectInfoService(projectFolder);
						const isAcp = projectInfo.isAccountCustomizationProject();
						if (isAcp) {
							const extractedPaths = (importResult && Array.isArray(importResult.extractedPaths) && importResult.extractedPaths) || [];
							const extractedXmlByScriptId = new Map();
							for (const extractedPath of extractedPaths) {
								if (!extractedPath) {
									continue;
								}
								const baseName = path.basename(extractedPath, path.extname(extractedPath));
								if (!baseName) {
									continue;
								}
								extractedXmlByScriptId.set(baseName, extractedPath);
								extractedXmlByScriptId.set(baseName.toLowerCase(), extractedPath);
							}

							for (const obj of objects) {
								const scriptId = obj && obj.scriptId ? `${obj.scriptId}` : '';
								if (!scriptId.toLowerCase().startsWith('customscript')) {
									continue;
								}
								const status = statusByKey.get(scriptId);
								const statusType = status && status.type ? `${status.type}` : 'FAILED';
								if (`${statusType}`.toUpperCase() !== 'SUCCESS') {
									continue;
								}

								const xmlPath = extractedXmlByScriptId.get(scriptId) || extractedXmlByScriptId.get(scriptId.toLowerCase());
								if (!xmlPath || !fs.existsSync(xmlPath)) {
									continue;
								}

								const xmlText = fs.readFileSync(xmlPath, 'utf8');
								const referencedPaths = extractReferencedFileCabinetPaths(xmlText);
								if (referencedPaths.length > 0) {
									referencedFilesByScriptId.set(scriptId, referencedPaths);
								}
							}
						}
					}

					let referencedFileImportResultByPath = new Map();
					const allReferencedPaths = [...new Set([...referencedFilesByScriptId.values()].flat())];
					if (allReferencedPaths.length > 0) {
						try {
							const referencedFilesResult = await this._netSuiteFileCabinetImportService.importFiles({
								systemDomain,
								accessToken,
								projectFolder,
								filePaths: allReferencedPaths,
								excludeProperties: false,
							});

							const results = referencedFilesResult && Array.isArray(referencedFilesResult.results) ? referencedFilesResult.results : [];
							referencedFileImportResultByPath = new Map(results.map((r) => [normalizeFileCabinetPath(r.path), r]));
						} catch (error) {
							const message = error && error.message ? error.message : `${error}`;
							referencedFileImportResultByPath = new Map(
								allReferencedPaths.map((p) => [normalizeFileCabinetPath(p), { path: p, loaded: false, message }])
							);
						}
					}

					const successfulImports = [];
					const failedImports = [];
					for (const obj of objects) {
						const status = statusByKey.get(obj.scriptId);
						const statusType = status && status.type ? `${status.type}` : 'FAILED';
						const statusMessage = status && status.message ? `${status.message}` : '';
						const referencedFilePaths = referencedFilesByScriptId.get(obj.scriptId) || referencedFilesByScriptId.get(`${obj.scriptId}`.toLowerCase()) || [];
						const referencedFileImportResult = { successfulImports: [], failedImports: [] };
						for (const p of referencedFilePaths) {
							const normalizedPath = normalizeFileCabinetPath(p);
							const fileResult = referencedFileImportResultByPath.get(normalizedPath);
							if (fileResult && fileResult.loaded === true) {
								referencedFileImportResult.successfulImports.push({ path: normalizedPath });
							} else {
								const message = fileResult && fileResult.message ? `${fileResult.message}` : 'Referenced file import failed.';
								referencedFileImportResult.failedImports.push({ path: normalizedPath, message });
							}
						}
						const entry = {
							customObject: { type: obj.type, id: obj.scriptId, result: { type: statusType, message: statusMessage } },
							referencedFileImportResult,
						};

						if (`${statusType}`.toUpperCase() === 'SUCCESS') {
							successfulImports.push(entry);
						} else {
							failedImports.push(entry);
						}
					}

					for (const id of missingFromList) {
						failedImports.push({
							customObject: { type: 'UNKNOWN', id, result: { type: 'FAILED', message: 'Object not found in account listing.' } },
							referencedFileImportResult: { successfulImports: [], failedImports: [] },
						});
					}

					return {
						status: 'SUCCESS',
						data: { successfulImports, failedImports },
						resultMessage: `Imported ${successfulImports.length} object(s), ${failedImports.length} failed.`,
						errorMessages: [],
					};
				}

				return {
					status: 'SUCCESS',
					data: { successfulImports: [], failedImports: missingFromList.map((id) => ({ customObject: { type: 'UNKNOWN', id } })) },
					resultMessage: 'No objects to import.',
					errorMessages: [],
				};
			} catch (error) {
				const message = error && error.message ? error.message : `${error}`;
				return { status: 'ERROR', errorMessages: [message] };
			}
			}

		async _updateObjects(executionContext) {
			const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};
			const authId = params[PARAMS.AUTH_ID];
			const projectFolder = CommandUtils.unquoteString(params[PARAMS.PROJECT] || '');
			const scriptIdsRaw = params[PARAMS.SCRIPT_ID];

			if (!authId) {
				return { status: 'ERROR', errorMessages: ['Missing -authid for update.'] };
			}
			if (!projectFolder) {
				return { status: 'ERROR', errorMessages: ['Missing -project for update.'] };
			}
			if (!scriptIdsRaw) {
				return { status: 'ERROR', errorMessages: ['Missing -scriptid for update.'] };
			}

			const scriptIds = this._parseQuotedList(scriptIdsRaw);
			if (scriptIds.length === 0) {
				return { status: 'ERROR', errorMessages: ['No script IDs provided for update.'] };
			}

			try {
				const { systemDomain, accessToken } = await this._ensureValidAccessToken(authId);
				if (!systemDomain) {
					throw new Error(`Authentication ID "${authId}" is missing system domain information.`);
				}

				const packageRoot = this._getPackageRoot(projectFolder);
				const listed = await this._netSuiteCustomObjectsService.listObjects({
					systemDomain,
					accessToken,
					types: [],
					scriptIdContains: '',
					packageRoot,
				});

				const byScriptId = new Map(listed.map((o) => [o.scriptId, o]));
				const objects = [];
				const missing = [];

				for (const id of scriptIds) {
					const match = byScriptId.get(id);
					if (!match) {
						missing.push(id);
						continue;
					}
					objects.push({ type: match.type, scriptId: match.scriptId, appId: match.appId || '' });
				}

				const results = [];
				if (objects.length > 0) {
					const updateResult = await this._netSuiteCustomObjectsService.updateObjects({
						systemDomain,
						accessToken,
						projectFolder,
						objects,
						packageRoot,
					});
					if (updateResult && Array.isArray(updateResult.results)) {
						results.push(...updateResult.results);
					}
				}

				for (const id of missing) {
					results.push({ key: id, type: 'FAILED', message: 'Object not found in account listing.' });
				}

				const successCount = results.filter((r) => `${r && r.type ? r.type : ''}`.toUpperCase() === 'SUCCESS').length;
				const failedCount = results.length - successCount;
				return {
					status: 'SUCCESS',
					data: results,
					resultMessage: `Updated ${successCount} object(s), ${failedCount} failed.`,
					errorMessages: [],
				};
			} catch (error) {
				const message = error && error.message ? error.message : `${error}`;
				return { status: 'ERROR', errorMessages: [message] };
			}
		}

		async _updateCustomRecordWithInstances(executionContext) {
			const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};
			const authId = params[PARAMS.AUTH_ID];
			const projectFolder = CommandUtils.unquoteString(params[PARAMS.PROJECT] || '');
			const scriptId = params[PARAMS.SCRIPT_ID] ? `${params[PARAMS.SCRIPT_ID]}`.trim() : '';

			if (!authId) {
				return { status: 'ERROR', errorMessages: ['Missing -authid for updatecustomrecordwithinstances.'] };
			}
			if (!projectFolder) {
				return { status: 'ERROR', errorMessages: ['Missing -project for updatecustomrecordwithinstances.'] };
			}
			if (!scriptId) {
				return { status: 'ERROR', errorMessages: ['Missing -scriptid for updatecustomrecordwithinstances.'] };
			}

			try {
				const { systemDomain, accessToken } = await this._ensureValidAccessToken(authId);
				if (!systemDomain) {
					throw new Error(`Authentication ID "${authId}" is missing system domain information.`);
				}

				const appId = this._tryGetProjectApplicationId(projectFolder);
				const updateResult = await this._netSuiteCustomObjectsService.updateCustomRecordWithInstances({
					systemDomain,
					accessToken,
					projectFolder,
					scriptId,
					appId,
				});

				const extractedCount = updateResult && Array.isArray(updateResult.extractedPaths) ? updateResult.extractedPaths.length : 0;
				return {
					status: 'SUCCESS',
					data: `Custom record "${scriptId}" updated (with instances). Extracted ${extractedCount} file(s).`,
					errorMessages: [],
				};
			} catch (error) {
				const message = error && error.message ? error.message : `${error}`;
				return { status: 'ERROR', errorMessages: [message] };
			}
		}

		async _package(executionContext) {
			const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};
			const projectFolder = CommandUtils.unquoteString(params[PARAMS.PROJECT] || '');
			const destinationFolder = CommandUtils.unquoteString(params[PARAMS.DESTINATION] || '');

		const result = await this._projectPackagingService.packageProject({ projectFolder, destinationFolder });
		if (!result.ok) {
			return {
				status: 'ERROR',
				errorMessages: result.errorMessages || ['Unknown error while packaging project.'],
			};
		}

		return {
			status: 'SUCCESS',
			data: result.outputZipPath,
			resultMessage: result.resultMessage,
			errorMessages: [],
		};
	}

	async _createProject(executionContext) {
		const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};

		const parentDirectory = CommandUtils.unquoteString(params[PARAMS.PARENT_DIRECTORY] || '');
		const type = params[PARAMS.TYPE];
		const projectName = params[PARAMS.PROJECT_NAME];
		const publisherId = params[PARAMS.PUBLISHER_ID];
		const projectId = params[PARAMS.PROJECT_ID];
		const projectVersion = params[PARAMS.PROJECT_VERSION];

		try {
			const projectPath = this._projectCreationService.createProject({
				parentDirectory,
				type,
				projectName,
				publisherId,
				projectId,
				projectVersion,
			});

			return {
				status: 'SUCCESS',
				data: { path: projectPath },
				errorMessages: [],
			};
		} catch (error) {
			const message = error && error.message ? error.message : `${error}`;
			return { status: 'ERROR', errorMessages: [message] };
		}
	}

	async _createFile(executionContext) {
		const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};
		const projectFolder = CommandUtils.unquoteString(params[PARAMS.PROJECT] || '');
		const fileCabinetPath = CommandUtils.unquoteString(params[PARAMS.PATH] || '');
		const scriptType = params[PARAMS.TYPE];
		const modules = params[PARAMS.MODULE];

		try {
			const result = this._suiteScriptFileService.createFile({
				projectFolder,
				fileCabinetPath,
				scriptType,
				modules,
			});
			if (!result.ok) {
				return { status: 'ERROR', errorMessages: result.errorMessages || ['Unable to create file.'] };
			}

			return {
				status: 'SUCCESS',
				data: { path: result.absolutePath },
				errorMessages: [],
			};
		} catch (error) {
			const message = error && error.message ? error.message : `${error}`;
			return { status: 'ERROR', errorMessages: [message] };
		}
	}

	async _addDependencies(executionContext) {
		const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};
		const flags = (executionContext && executionContext.getFlags && executionContext.getFlags()) || [];

		const projectFolder = CommandUtils.unquoteString(params[PARAMS.PROJECT] || '');
		if (!projectFolder) {
			return { status: 'ERROR', errorMessages: ['Missing -project for adddependencies.'] };
		}

		const all = flags.includes(FLAGS.ALL);
		const featureRefs = params[PARAMS.FEATURE] ? this._parseQuotedList(params[PARAMS.FEATURE]) : [];
		const fileRefs = params[PARAMS.FILE] ? this._parseQuotedList(params[PARAMS.FILE]) : [];
		const objectRefs = params[PARAMS.OBJECT] ? this._parseQuotedList(params[PARAMS.OBJECT]) : [];

		try {
			const result = await this._projectAddDependenciesService.addDependencies({
				projectFolder,
				all,
				featureRefs,
				fileRefs,
				objectRefs,
			});

			if (!result || result.ok !== true) {
				return { status: 'ERROR', errorMessages: (result && result.errorMessages) || ['Unable to add dependencies.'] };
			}

			const added = (result && Array.isArray(result.addedDependencies) && result.addedDependencies) || [];
			const resultMessage =
				added.length > 0
					? `Added ${added.length} dependency reference(s) to manifest.`
					: 'No unresolved dependencies found.';

			return {
				status: 'SUCCESS',
				data: added,
				resultMessage,
				errorMessages: [],
			};
		} catch (error) {
			const message = error && error.message ? error.message : `${error}`;
			return { status: 'ERROR', errorMessages: [message] };
		}
	}

	async _validate(executionContext) {
		const flags = (executionContext && executionContext.getFlags && executionContext.getFlags()) || [];
		if (flags.includes(FLAGS.SERVER)) {
			const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};
			const authId = params[PARAMS.AUTH_ID];
			const projectFolder = CommandUtils.unquoteString(params[PARAMS.PROJECT] || '');
			const accountSpecificValues = params[PARAMS.ACCOUNT_SPECIFIC_VALUES];
			const applyInstallPrefs = flags.includes(FLAGS.APPLY_INSTALLATION_PREFERENCES);

			if (!authId) {
				return { status: 'ERROR', errorMessages: ['Missing -authid for server validation.'] };
			}
			if (!projectFolder) {
				return { status: 'ERROR', errorMessages: ['Missing -project for server validation.'] };
			}

			try {
				const zipResult = await this._projectPackagingService.packageProject({ projectFolder });
				if (!zipResult.ok) {
					return { status: 'ERROR', errorMessages: zipResult.errorMessages || ['Failed to package project.'] };
				}

				const { systemDomain, accessToken } = await this._ensureValidAccessToken(authId);
				if (!systemDomain) {
					throw new Error(`Authentication ID "${authId}" is missing system domain information.`);
				}

				const lines = await this._netSuiteSdfDevFrameworkService.validateServer({
					systemDomain,
					accessToken,
					zipPath: zipResult.outputZipPath,
					accountSpecificValues,
					applyInstallPrefs,
				});

				return {
					status: 'SUCCESS',
					data: lines,
					resultMessage: `Server validation finished (${lines.length} line(s)).`,
					errorMessages: [],
				};
			} catch (error) {
				const message = error && error.message ? error.message : `${error}`;
				return { status: 'ERROR', errorMessages: [message] };
			}
		}

		const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};
		const projectFolder = CommandUtils.unquoteString(params[PARAMS.PROJECT] || '');

		const data = await this._projectValidationService.validateProject({ projectFolder });
		const warningsCount = (data.warnings || []).length;
		const errorsCount = (data.errors || []).length;

		return {
			status: 'SUCCESS',
			data,
			resultMessage: `Local validation finished: ${errorsCount} error(s), ${warningsCount} warning(s).`,
			errorMessages: [],
		};
	}

	async _preview(executionContext) {
		const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};
		const projectFolder = CommandUtils.unquoteString(params[PARAMS.PROJECT] || '');

		try {
			const result = await this._projectPreviewService.previewProject({ projectFolder });
			if (!result.ok) {
				return { status: 'ERROR', errorMessages: result.errorMessages || ['Unable to preview deploy.'] };
			}
			return {
				status: 'SUCCESS',
				data: result.entries,
				resultMessage: `Preview includes ${result.entries.length} entries.`,
				errorMessages: [],
			};
		} catch (error) {
			const message = error && error.message ? error.message : `${error}`;
			return { status: 'ERROR', errorMessages: [message] };
		}
	}

	async _deploy(executionContext) {
		const params = (executionContext && executionContext.getParams && executionContext.getParams()) || {};
		const flags = (executionContext && executionContext.getFlags && executionContext.getFlags()) || [];

		const authId = params[PARAMS.AUTH_ID];
		const projectFolder = CommandUtils.unquoteString(params[PARAMS.PROJECT] || '');
		const accountSpecificValues = params[PARAMS.ACCOUNT_SPECIFIC_VALUES];
		const applyInstallPrefs = flags.includes(FLAGS.APPLY_INSTALLATION_PREFERENCES);
		const validateLocal = flags.includes(FLAGS.VALIDATE);

		if (!authId) {
			return { status: 'ERROR', errorMessages: ['Missing -authid for deploy.'] };
		}
		if (!projectFolder) {
			return { status: 'ERROR', errorMessages: ['Missing -project for deploy.'] };
		}

		try {
			if (validateLocal) {
				const validation = await this._projectValidationService.validateProject({ projectFolder });
				const errorsCount = (validation.errors || []).length;
				if (errorsCount > 0) {
					return {
						status: 'ERROR',
						errorMessages: [`Local validation failed with ${errorsCount} error(s). Run project:validate for details.`],
					};
				}
			}

			const zipResult = await this._projectPackagingService.packageProject({ projectFolder });
			if (!zipResult.ok) {
				return { status: 'ERROR', errorMessages: zipResult.errorMessages || ['Failed to package project.'] };
			}

			const { systemDomain, accessToken } = await this._ensureValidAccessToken(authId);
			if (!systemDomain) {
				throw new Error(`Authentication ID "${authId}" is missing system domain information.`);
			}

			const lines = await this._netSuiteSdfDevFrameworkService.deploy({
				systemDomain,
				accessToken,
				zipPath: zipResult.outputZipPath,
				accountSpecificValues,
				applyInstallPrefs,
			});

			return {
				status: 'SUCCESS',
				data: lines,
				resultMessage: `Deploy finished (${lines.length} line(s)).`,
				errorMessages: [],
			};
		} catch (error) {
			const message = error && error.message ? error.message : `${error}`;
			return { status: 'ERROR', errorMessages: [message] };
		}
	}
};
