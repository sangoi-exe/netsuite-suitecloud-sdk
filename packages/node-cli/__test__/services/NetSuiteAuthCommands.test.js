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

	test('authenticate returns error when authid is missing', async () => {
		const sdkHome = mkTempDir();
		const executor = new NodeSdkExecutor(sdkHome);
		const context = SdkExecutionContext.Builder.forCommand('authenticate').integration().build();

		const result = await executor.execute(context);
		expect(result.status).toBe('ERROR');
		expect(result.errorMessages).toEqual(['Missing required parameter -authid for authenticate.']);
	});
});
