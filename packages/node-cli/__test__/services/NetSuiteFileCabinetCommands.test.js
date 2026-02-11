/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const AuthStoreService = require('../../src/services/auth/AuthStoreService');
const NodeSdkExecutor = require('../../src/core/sdkexecutor/NodeSdkExecutor');
const SdkExecutionContext = require('../../src/SdkExecutionContext');
const { ENV_VARS } = require('../../src/ApplicationConstants');

function mkTempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'suitecloud-filecabinet-test-'));
}

describe('NodeSdkExecutor listfolders/listfiles', () => {
	const originalEnv = { ...process.env };

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	test('lists folders and files via SuiteQL (REST)', async () => {
		process.env[ENV_VARS.SUITECLOUD_CI_PASSKEY] = 'test-passkey';

		const server = http.createServer((req, res) => {
			if (req.method === 'POST' && req.url && req.url.startsWith('/services/rest/query/v1/suiteql')) {
				const chunks = [];
				req.on('data', (c) => chunks.push(c));
				req.on('end', () => {
					expect(req.headers.authorization).toBe('Bearer abc');
					expect(req.headers.prefer).toBe('transient');

					const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
					const q = body && body.q ? `${body.q}` : '';

					res.writeHead(200, { 'content-type': 'application/json' });
					if (q.includes('FROM folder')) {
						res.end(
							JSON.stringify({
								items: [
									{ id: '1', name: 'SuiteScripts', parent: null },
									{ id: '2', name: 'Sub', parent: '1' },
								],
								hasMore: false,
							})
						);
						return;
					}
					if (q.includes('FROM file')) {
						res.end(
							JSON.stringify({
								items: [{ id: '10', name: 'hello.js' }],
								hasMore: false,
							})
						);
						return;
					}

					res.end(JSON.stringify({ items: [], hasMore: false }));
				});
				return;
			}

			res.writeHead(404, { 'content-type': 'text/plain' });
			res.end('not found');
		});

		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const baseUrl = `http://127.0.0.1:${server.address().port}`;

		const sdkHome = mkTempDir();
		const store = new AuthStoreService(sdkHome);
		store.upsert('auth1', {
			type: 'CLIENT_CREDENTIALS',
			accountInfo: { companyName: 'ACME', companyId: 'TEST', roleName: 'Role' },
			hostInfo: { hostName: '127.0.0.1' },
			domains: { restDomain: baseUrl, systemDomain: baseUrl, webservicesDomain: baseUrl },
			authConfig: { accountId: 'TEST', certificateId: 'cert123', privateKeyPath: '/dev/null', domain: baseUrl, scope: 'rest_webservices' },
			token: { accessToken: 'abc', expiresAt: '2099-01-01T00:00:00.000Z', tokenType: 'Bearer' },
		});

		try {
			const executor = new NodeSdkExecutor(sdkHome);

			const listFoldersCtx = SdkExecutionContext.Builder.forCommand('listfolders').integration().addParam('authid', 'auth1').build();
			const foldersResult = await executor.execute(listFoldersCtx);
			expect(foldersResult.status).toBe('SUCCESS');
			expect(foldersResult.data).toEqual(['/SuiteScripts', '/SuiteScripts/Sub']);

			const listFilesCtx = SdkExecutionContext.Builder.forCommand('listfiles')
				.integration()
				.addParam('authid', 'auth1')
				.addParam('folder', '"/SuiteScripts"')
				.build();
			const filesResult = await executor.execute(listFilesCtx);
			expect(filesResult.status).toBe('SUCCESS');
			expect(filesResult.data).toEqual(['/SuiteScripts/hello.js']);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	test('refreshes expired PKCE token before listing folders', async () => {
		process.env[ENV_VARS.SUITECLOUD_CI_PASSKEY] = 'test-passkey';

		const server = http.createServer((req, res) => {
			if (req.method === 'POST' && req.url === '/services/rest/auth/oauth2/v1/token') {
				const chunks = [];
				req.on('data', (c) => chunks.push(c));
				req.on('end', () => {
					const body = Buffer.concat(chunks).toString('utf8');
					const params = new URLSearchParams(body);
					expect(params.get('grant_type')).toBe('refresh_token');
					expect(params.get('client_id')).toBe('integration-client-id');
					expect(params.get('refresh_token')).toBe('pkce-refresh-token');

					res.writeHead(200, { 'content-type': 'application/json' });
					res.end(
						JSON.stringify({
							access_token: 'pkce-access-token-new',
							refresh_token: 'pkce-refresh-token-new',
							expires_in: 3600,
							token_type: 'Bearer',
							scope: 'rest_webservices',
						})
					);
				});
				return;
			}

			if (req.method === 'GET' && req.url === '/rest/tokeninfo') {
				expect(req.headers.authorization).toBe('Bearer pkce-access-token-new');
				res.writeHead(200, { 'content-type': 'application/json' });
				res.end(
					JSON.stringify({
						companyName: 'ACME PKCE',
						companyId: '12345_SB1',
						roleName: 'Administrator',
					})
				);
				return;
			}

			if (req.method === 'POST' && req.url && req.url.startsWith('/services/rest/query/v1/suiteql')) {
				const chunks = [];
				req.on('data', (c) => chunks.push(c));
				req.on('end', () => {
					expect(req.headers.authorization).toBe('Bearer pkce-access-token-new');
					const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
					const q = body && body.q ? `${body.q}` : '';
					res.writeHead(200, { 'content-type': 'application/json' });
					if (q.includes('FROM folder')) {
						res.end(
							JSON.stringify({
								items: [{ id: '1', name: 'SuiteScripts', parent: null }],
								hasMore: false,
							})
						);
						return;
					}
					res.end(JSON.stringify({ items: [], hasMore: false }));
				});
				return;
			}

			res.writeHead(404, { 'content-type': 'text/plain' });
			res.end('not found');
		});

		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const baseUrl = `http://127.0.0.1:${server.address().port}`;

		const sdkHome = mkTempDir();
		const store = new AuthStoreService(sdkHome);
		store.upsert('pkceAuth', {
			type: 'PKCE',
			accountInfo: { companyName: 'ACME PKCE', companyId: '12345_SB1', roleName: 'Administrator' },
			hostInfo: { hostName: '127.0.0.1' },
			domains: { restDomain: baseUrl, systemDomain: baseUrl, webservicesDomain: baseUrl },
			authConfig: {
				accountId: '12345_SB1',
				clientId: 'integration-client-id',
				domain: baseUrl,
				scope: 'rest_webservices',
			},
			token: {
				accessToken: 'pkce-access-token-expired',
				refreshToken: 'pkce-refresh-token',
				expiresAt: '2000-01-01T00:00:00.000Z',
				tokenType: 'Bearer',
			},
		});

		try {
			const executor = new NodeSdkExecutor(sdkHome);
			const listFoldersCtx = SdkExecutionContext.Builder.forCommand('listfolders').integration().addParam('authid', 'pkceAuth').build();
			const foldersResult = await executor.execute(listFoldersCtx);
			expect(foldersResult.status).toBe('SUCCESS');
			expect(foldersResult.data).toEqual(['/SuiteScripts']);

			const hydrated = store.getWithSecrets('pkceAuth');
			expect(hydrated.token.accessToken).toBe('pkce-access-token-new');
			expect(hydrated.token.refreshToken).toBe('pkce-refresh-token-new');
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	test('refreshauthorization refreshes PKCE auth record', async () => {
		process.env[ENV_VARS.SUITECLOUD_CI_PASSKEY] = 'test-passkey';

		const server = http.createServer((req, res) => {
			if (req.method === 'POST' && req.url === '/services/rest/auth/oauth2/v1/token') {
				res.writeHead(200, { 'content-type': 'application/json' });
				res.end(
					JSON.stringify({
						access_token: 'pkce-access-token-refreshed',
						refresh_token: 'pkce-refresh-token-refreshed',
						expires_in: 3600,
						token_type: 'Bearer',
						scope: 'rest_webservices',
					})
				);
				return;
			}

			if (req.method === 'GET' && req.url === '/rest/tokeninfo') {
				res.writeHead(200, { 'content-type': 'application/json' });
				res.end(
					JSON.stringify({
						companyName: 'ACME PKCE',
						companyId: '12345_SB1',
						roleName: 'Administrator',
					})
				);
				return;
			}

			res.writeHead(404, { 'content-type': 'text/plain' });
			res.end('not found');
		});

		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const baseUrl = `http://127.0.0.1:${server.address().port}`;

		const sdkHome = mkTempDir();
		const store = new AuthStoreService(sdkHome);
		store.upsert('pkceAuth', {
			type: 'PKCE',
			accountInfo: { companyName: 'ACME PKCE', companyId: '12345_SB1', roleName: 'Administrator' },
			hostInfo: { hostName: '127.0.0.1' },
			domains: { restDomain: baseUrl, systemDomain: baseUrl, webservicesDomain: baseUrl },
			authConfig: {
				accountId: '12345_SB1',
				clientId: 'integration-client-id',
				domain: baseUrl,
				scope: 'rest_webservices',
			},
			token: {
				accessToken: 'pkce-access-token-old',
				refreshToken: 'pkce-refresh-token',
				expiresAt: '2000-01-01T00:00:00.000Z',
				tokenType: 'Bearer',
			},
		});

		try {
			const executor = new NodeSdkExecutor(sdkHome);
			const refreshCtx = SdkExecutionContext.Builder.forCommand('refreshauthorization').integration().addParam('authid', 'pkceAuth').build();
			const refreshResult = await executor.execute(refreshCtx);

			expect(refreshResult.status).toBe('SUCCESS');
			expect(refreshResult.data).toEqual({ refreshed: true });

			const hydrated = store.getWithSecrets('pkceAuth');
			expect(hydrated.token.accessToken).toBe('pkce-access-token-refreshed');
			expect(hydrated.token.refreshToken).toBe('pkce-refresh-token-refreshed');
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	test('rejects unsupported auth record type even with unexpired token', async () => {
		process.env[ENV_VARS.SUITECLOUD_CI_PASSKEY] = 'test-passkey';

		const sdkHome = mkTempDir();
		const store = new AuthStoreService(sdkHome);
		store.upsert('unsupportedAuth', {
			type: 'UNKNOWN',
			accountInfo: { companyName: 'ACME', companyId: '12345_SB1', roleName: 'Role' },
			hostInfo: { hostName: '127.0.0.1' },
			domains: { restDomain: 'http://127.0.0.1:1', systemDomain: 'http://127.0.0.1:1' },
			authConfig: { accountId: '12345_SB1' },
			token: { accessToken: 'token', expiresAt: '2099-01-01T00:00:00.000Z', tokenType: 'Bearer' },
		});

		const executor = new NodeSdkExecutor(sdkHome);
		const listFoldersCtx = SdkExecutionContext.Builder.forCommand('listfolders').integration().addParam('authid', 'unsupportedAuth').build();
		const result = await executor.execute(listFoldersCtx);

		expect(result.status).toBe('ERROR');
		expect(result.errorMessages[0]).toContain('not a supported auth type');
	});
});
