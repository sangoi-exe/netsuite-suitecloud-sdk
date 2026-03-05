/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const AuthStoreService = require('../../src/services/auth/AuthStoreService');
const NodeSdkExecutor = require('../../src/core/sdkexecutor/NodeSdkExecutor');
const SdkExecutionContext = require('../../src/SdkExecutionContext');
const { ENV_VARS } = require('../../src/ApplicationConstants');

function mkTempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'suitecloud-auth-command-test-'));
}

describe('NodeSdkExecutor authenticate/refreshauthorization commands', () => {
	const originalEnv = { ...process.env };

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	test('authenticate persists PKCE auth record', async () => {
		process.env[ENV_VARS.SUITECLOUD_CI_PASSKEY] = 'test-passkey';

		const sdkHome = mkTempDir();
		const executor = new NodeSdkExecutor(sdkHome);
		executor._pkceAuthService = {
			authenticate: jest.fn(async () => ({
				accountInfo: { companyName: 'ACME', companyId: '12345_SB1', roleName: 'Administrator' },
				hostInfo: { hostName: 'system.netsuite.com' },
				domains: {
					restDomain: 'https://12345.suitetalk.api.netsuite.com',
					systemDomain: 'https://12345.app.netsuite.com',
					webservicesDomain: 'https://12345.suitetalk.api.netsuite.com',
				},
				authConfig: {
					accountId: '12345_SB1',
					clientId: 'integration-client-id',
					domain: 'https://system.netsuite.com',
					scope: 'rest_webservices',
				},
				token: {
					accessToken: 'pkce-access-token',
					refreshToken: 'pkce-refresh-token',
					expiresAt: '2099-01-01T00:00:00.000Z',
					tokenType: 'Bearer',
				},
			})),
		};

		const context = SdkExecutionContext.Builder.forCommand('authenticate')
			.integration()
			.addParam('authid', 'devAuth')
			.addParam('url', 'https://system.netsuite.com')
			.build();

		const result = await executor.execute(context);
		expect(result.status).toBe('SUCCESS');
		expect(result.data.accountInfo.companyId).toBe('12345_SB1');

		expect(executor._pkceAuthService.authenticate).toHaveBeenCalledWith({
			sdkPath: sdkHome,
			domain: 'https://system.netsuite.com',
		});

		const store = new AuthStoreService(sdkHome);
		const storedRecord = store.getWithSecrets('devAuth');
		expect(storedRecord.type).toBe('PKCE');
		expect(storedRecord.authConfig.clientId).toBe('integration-client-id');
		expect(storedRecord.token.accessToken).toBe('pkce-access-token');
		expect(storedRecord.token.refreshToken).toBe('pkce-refresh-token');
	});

	test('authenticate forwards optional clientid and scope to PKCE service', async () => {
		process.env[ENV_VARS.SUITECLOUD_CI_PASSKEY] = 'test-passkey';

		const sdkHome = mkTempDir();
		const executor = new NodeSdkExecutor(sdkHome);
		executor._pkceAuthService = {
			authenticate: jest.fn(async () => ({
				accountInfo: { companyName: 'ACME', companyId: '12345_SB1', roleName: 'Administrator' },
				hostInfo: { hostName: 'system.netsuite.com' },
				domains: {
					restDomain: 'https://12345.suitetalk.api.netsuite.com',
					systemDomain: 'https://12345.app.netsuite.com',
					webservicesDomain: 'https://12345.suitetalk.api.netsuite.com',
				},
				authConfig: {
					accountId: '12345_SB1',
					clientId: 'custom-client-id',
					domain: 'https://system.netsuite.com',
					scope: 'rest_webservices restlets',
				},
				token: {
					accessToken: 'pkce-access-token',
					refreshToken: 'pkce-refresh-token',
					expiresAt: '2099-01-01T00:00:00.000Z',
					tokenType: 'Bearer',
				},
			})),
		};

		const context = SdkExecutionContext.Builder.forCommand('authenticate')
			.integration()
			.addParam('authid', 'devAuth')
			.addParam('url', 'https://system.netsuite.com')
			.addParam('clientid', 'custom-client-id')
			.addParam('scope', 'rest_webservices restlets')
			.build();

		const result = await executor.execute(context);
		expect(result.status).toBe('SUCCESS');
		expect(executor._pkceAuthService.authenticate).toHaveBeenCalledWith({
			sdkPath: sdkHome,
			domain: 'https://system.netsuite.com',
			clientId: 'custom-client-id',
			scope: 'rest_webservices restlets',
		});
	});

	test('authenticate returns error when authid is missing', async () => {
		const sdkHome = mkTempDir();
		const executor = new NodeSdkExecutor(sdkHome);
		const context = SdkExecutionContext.Builder.forCommand('authenticate').integration().build();

		const result = await executor.execute(context);
		expect(result.status).toBe('ERROR');
		expect(result.errorMessages).toEqual(['Missing required parameter -authid for authenticate.']);
	});

	test('refreshauthorization falls back to browser reauth when refresh token is rejected with invalid_grant', async () => {
		const sdkHome = mkTempDir();
		const authId = 'devAuth';
		const store = new AuthStoreService(sdkHome);
		store.upsert(authId, {
			type: 'PKCE',
			accountInfo: { companyName: 'ACME', companyId: '12345_SB1', roleName: 'Administrator' },
			hostInfo: { hostName: '12345.app.netsuite.com' },
			domains: {
				restDomain: 'https://12345.suitetalk.api.netsuite.com',
				systemDomain: 'https://12345.app.netsuite.com',
				webservicesDomain: 'https://12345.suitetalk.api.netsuite.com',
			},
			authConfig: {
				accountId: '12345_SB1',
				clientId: 'integration-client-id',
				domain: null,
				scope: 'restlets',
			},
			token: {
				accessToken: 'expired-access-token',
				refreshToken: 'stale-refresh-token',
				expiresAt: '2000-01-01T00:00:00.000Z',
				tokenType: 'Bearer',
			},
			updatedAt: '2000-01-01T00:00:00.000Z',
		});

		const executor = new NodeSdkExecutor(sdkHome);
		executor._pkceAuthService = {
			refreshWithRefreshToken: jest.fn(async () => {
				throw new Error('OAuth refresh request failed (invalid_grant): {"error":"invalid_grant"}');
			}),
			authenticate: jest.fn(async () => ({
				accountInfo: { companyName: 'ACME', companyId: '12345_SB1', roleName: 'Administrator' },
				hostInfo: { hostName: '12345.app.netsuite.com' },
				domains: {
					restDomain: 'https://12345.suitetalk.api.netsuite.com',
					systemDomain: 'https://12345.app.netsuite.com',
					webservicesDomain: 'https://12345.suitetalk.api.netsuite.com',
				},
				authConfig: {
					accountId: '12345_SB1',
					clientId: 'integration-client-id',
					domain: null,
					scope: 'restlets',
				},
				token: {
					accessToken: 'new-access-token',
					refreshToken: 'new-refresh-token',
					expiresAt: '2099-01-01T00:00:00.000Z',
					tokenType: 'Bearer',
				},
			})),
		};

		const context = SdkExecutionContext.Builder.forCommand('refreshauthorization')
			.integration()
			.addParam('authid', authId)
			.build();

		const result = await executor.execute(context);
		expect(result.status).toBe('SUCCESS');
		expect(executor._pkceAuthService.refreshWithRefreshToken).toHaveBeenCalledWith({
			accountId: '12345_SB1',
			clientId: 'integration-client-id',
			domain: null,
			scope: 'restlets',
			domains: {
				restDomain: 'https://12345.suitetalk.api.netsuite.com',
				systemDomain: 'https://12345.app.netsuite.com',
				webservicesDomain: 'https://12345.suitetalk.api.netsuite.com',
			},
			refreshToken: 'stale-refresh-token',
		});
		expect(executor._pkceAuthService.authenticate).toHaveBeenCalledWith({
			sdkPath: sdkHome,
			domain: 'https://12345.app.netsuite.com',
			clientId: 'integration-client-id',
			scope: 'restlets',
		});

		const storedRecord = store.getWithSecrets(authId);
		expect(storedRecord.token.accessToken).toBe('new-access-token');
		expect(storedRecord.token.refreshToken).toBe('new-refresh-token');
	});

	test('refreshauthorization fails loudly when browser reauth selects a different account', async () => {
		const sdkHome = mkTempDir();
		const authId = 'devAuth';
		const store = new AuthStoreService(sdkHome);
		store.upsert(authId, {
			type: 'PKCE',
			accountInfo: { companyName: 'ACME', companyId: '12345_SB1', roleName: 'Administrator' },
			hostInfo: { hostName: '12345-sb1.app.netsuite.com' },
			domains: {
				restDomain: 'https://12345-sb1.restlets.api.netsuite.com',
				systemDomain: 'https://12345-sb1.app.netsuite.com',
				webservicesDomain: 'https://12345-sb1.suitetalk.api.netsuite.com',
			},
			authConfig: {
				accountId: '12345_SB1',
				clientId: 'integration-client-id',
				domain: null,
				scope: 'restlets',
			},
			token: {
				accessToken: 'expired-access-token',
				refreshToken: 'stale-refresh-token',
				expiresAt: '2000-01-01T00:00:00.000Z',
				tokenType: 'Bearer',
			},
			updatedAt: '2000-01-01T00:00:00.000Z',
		});

		const executor = new NodeSdkExecutor(sdkHome);
		executor._pkceAuthService = {
			refreshWithRefreshToken: jest.fn(async () => {
				throw new Error('OAuth refresh request failed (invalid_grant): {"error":"invalid_grant"}');
			}),
			authenticate: jest.fn(async () => ({
				accountInfo: { companyName: 'ACME', companyId: '12345', roleName: 'Administrator' },
				hostInfo: { hostName: '12345.app.netsuite.com' },
				domains: {
					restDomain: 'https://12345.restlets.api.netsuite.com',
					systemDomain: 'https://12345.app.netsuite.com',
					webservicesDomain: 'https://12345.suitetalk.api.netsuite.com',
				},
				authConfig: {
					accountId: '12345',
					clientId: 'integration-client-id',
					domain: null,
					scope: 'restlets',
				},
				token: {
					accessToken: 'new-access-token',
					refreshToken: 'new-refresh-token',
					expiresAt: '2099-01-01T00:00:00.000Z',
					tokenType: 'Bearer',
				},
			})),
		};

		const context = SdkExecutionContext.Builder.forCommand('refreshauthorization')
			.integration()
			.addParam('authid', authId)
			.build();

		const result = await executor.execute(context);
		expect(result.status).toBe('ERROR');
		expect(result.errorMessages[0]).toContain('Canceling the authentication refresh.');
		expect(result.errorMessages[0]).toContain('12345');
		expect(result.errorMessages[0]).toContain('12345_SB1');
		expect(executor._pkceAuthService.refreshWithRefreshToken).toHaveBeenCalled();
		expect(executor._pkceAuthService.authenticate).toHaveBeenCalled();

		const storedRecord = store.getWithSecrets(authId);
		expect(storedRecord.token.accessToken).toBe('expired-access-token');
		expect(storedRecord.token.refreshToken).toBe('stale-refresh-token');
		expect(storedRecord.authConfig.accountId).toBe('12345_SB1');
	});
});
