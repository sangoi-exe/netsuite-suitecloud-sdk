/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { URL } = require('url');

const NetSuitePkceAuthService = require('../../src/services/auth/NetSuitePkceAuthService');

function readRequestBody(request) {
	return new Promise((resolve) => {
		const chunks = [];
		request.on('data', (chunk) => chunks.push(chunk));
		request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
	});
}

function httpGet(url) {
	return new Promise((resolve, reject) => {
		const request = http.get(url, (response) => {
			response.resume();
			response.on('end', resolve);
		});
		request.on('error', reject);
	});
}

describe('NetSuitePkceAuthService', () => {
	const originalEnv = { ...process.env };

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	test('completes PKCE authentication flow', async () => {
		let tokenRequestForm;
		let authorizeUrlSeen;

		const server = http.createServer(async (request, response) => {
			if (request.method === 'GET' && request.url && request.url.startsWith('/rest/datacenterurls?account=')) {
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(
					JSON.stringify({
						restDomain: baseUrl,
						systemDomain: baseUrl,
						webservicesDomain: baseUrl,
					})
				);
				return;
			}

			if (request.method === 'POST' && request.url === '/services/rest/auth/oauth2/v1/token') {
				const rawBody = await readRequestBody(request);
				tokenRequestForm = new URLSearchParams(rawBody);
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(
					JSON.stringify({
						access_token: 'pkce-access-token',
						refresh_token: 'pkce-refresh-token',
						expires_in: 3600,
						token_type: 'Bearer',
						scope: 'rest_webservices',
					})
				);
				return;
			}

			if (request.method === 'GET' && request.url === '/rest/tokeninfo') {
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(
					JSON.stringify({
						companyName: 'ACME Inc.',
						companyId: '12345_SB1',
						roleName: 'Administrator',
					})
				);
				return;
			}

			response.writeHead(404, { 'content-type': 'text/plain' });
			response.end('not found');
		});

		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const baseUrl = `http://127.0.0.1:${server.address().port}`;

		try {
			const service = new NetSuitePkceAuthService({
				openBrowser: async (authorizeUrl) => {
					authorizeUrlSeen = authorizeUrl;
					const parsed = new URL(authorizeUrl);
					const state = parsed.searchParams.get('state');
					const redirectUri = parsed.searchParams.get('redirect_uri');

					expect(parsed.pathname).toBe('/app/login/oauth2/authorize.nl');
					expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
					expect(parsed.searchParams.get('scope')).toBe('rest_webservices');
					expect(state).toBeTruthy();
					expect(redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:52\d{3}\/suitecloud-auth$/);

					await httpGet(`${redirectUri}?code=oauth-code-123&company=12345_SB1&state=${encodeURIComponent(state)}`);
				},
			});

			const result = await service.authenticate({
				domain: baseUrl,
				clientId: 'integration-client-id',
				timeoutMs: 5000,
			});

			expect(authorizeUrlSeen).toBeTruthy();
			expect(tokenRequestForm.get('grant_type')).toBe('authorization_code');
			expect(tokenRequestForm.get('client_id')).toBe('integration-client-id');
			expect(tokenRequestForm.get('code')).toBe('oauth-code-123');
			expect(tokenRequestForm.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:52\d{3}\/suitecloud-auth$/);
			expect(tokenRequestForm.get('code_verifier')).toBeTruthy();

			expect(result.accountInfo).toEqual({
				companyName: 'ACME Inc.',
				companyId: '12345_SB1',
				roleName: 'Administrator',
			});
			expect(result.token.accessToken).toBe('pkce-access-token');
			expect(result.token.refreshToken).toBe('pkce-refresh-token');
			expect(result.authConfig.accountId).toBe('12345_SB1');
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	test('fails on callback state mismatch', async () => {
		const service = new NetSuitePkceAuthService({
			openBrowser: async () => {},
		});
		service._startCallbackServer = jest.fn(async () => ({
			port: 52300,
			waitForCallback: async () => ({
				code: 'oauth-code-123',
				company: '12345_SB1',
				state: 'wrong-state',
			}),
			close: async () => {},
		}));

		await expect(
			service.authenticate({
				clientId: 'integration-client-id',
				timeoutMs: 5000,
			})
		).rejects.toThrow('state mismatch');
	});

	test('refreshes PKCE token using refresh_token grant', async () => {
		let refreshForm;

		const server = http.createServer(async (request, response) => {
			if (request.method === 'POST' && request.url === '/services/rest/auth/oauth2/v1/token') {
				const rawBody = await readRequestBody(request);
				refreshForm = new URLSearchParams(rawBody);
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(
					JSON.stringify({
						access_token: 'pkce-new-access-token',
						expires_in: 900,
						token_type: 'Bearer',
					})
				);
				return;
			}

			if (request.method === 'GET' && request.url === '/rest/tokeninfo') {
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(
					JSON.stringify({
						companyName: 'ACME Inc.',
						companyId: '12345_SB1',
						roleName: 'Administrator',
					})
				);
				return;
			}

			response.writeHead(404, { 'content-type': 'text/plain' });
			response.end('not found');
		});

		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const baseUrl = `http://127.0.0.1:${server.address().port}`;

		try {
			const service = new NetSuitePkceAuthService();
			const result = await service.refreshWithRefreshToken({
				accountId: '12345_SB1',
				clientId: 'integration-client-id',
				refreshToken: 'persisted-refresh-token',
				scope: 'rest_webservices',
				domains: {
					restDomain: baseUrl,
					systemDomain: baseUrl,
				},
			});

			expect(refreshForm.get('grant_type')).toBe('refresh_token');
			expect(refreshForm.get('client_id')).toBe('integration-client-id');
			expect(refreshForm.get('refresh_token')).toBe('persisted-refresh-token');

			expect(result.token.accessToken).toBe('pkce-new-access-token');
			expect(result.token.refreshToken).toBe('persisted-refresh-token');
			expect(result.accountInfo.companyId).toBe('12345_SB1');
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	test('env client id overrides sdk settings client id', async () => {
		process.env.SUITECLOUD_INTEGRATION_CLIENT_ID = 'env-client-id';
		const sdkHome = fs.mkdtempSync(path.join(os.tmpdir(), 'suitecloud-pkce-settings-'));
		fs.writeFileSync(
			path.join(sdkHome, 'suitecloud-sdk-settings.json'),
			JSON.stringify({ integrationClientId: 'settings-client-id' }, null, 2),
			'utf8'
		);

		let authorizeUrlSeen;
		const service = new NetSuitePkceAuthService({
			openBrowser: async (authorizeUrl) => {
				authorizeUrlSeen = authorizeUrl;
			},
		});

		service._startCallbackServer = jest.fn(async () => ({
			port: 52300,
			waitForCallback: async () => {
				const state = new URL(authorizeUrlSeen).searchParams.get('state');
				return { code: 'oauth-code-123', company: '12345_SB1', state };
			},
			close: async () => {},
		}));
		service._domainsService = {
			resolveDomains: jest.fn(async () => ({
				restDomain: 'https://12345.suitetalk.api.netsuite.com',
				systemDomain: 'https://12345.app.netsuite.com',
				webservicesDomain: 'https://12345.suitetalk.api.netsuite.com',
				hostInfo: { hostName: '12345.app.netsuite.com' },
			})),
		};
		service._httpClient = {
			requestForm: jest.fn(async () => ({
				statusCode: 200,
				data: {
					access_token: 'pkce-access-token',
					refresh_token: 'pkce-refresh-token',
					expires_in: 3600,
					token_type: 'Bearer',
				},
			})),
			requestJson: jest.fn(async () => ({
				statusCode: 200,
				data: {
					companyName: 'ACME Inc.',
					companyId: '12345_SB1',
					roleName: 'Administrator',
				},
			})),
		};

		await service.authenticate({
			domain: 'https://system.netsuite.com',
			sdkPath: sdkHome,
			timeoutMs: 5000,
		});

		expect(new URL(authorizeUrlSeen).searchParams.get('client_id')).toBe('env-client-id');
		expect(service._httpClient.requestForm).toHaveBeenCalledWith(
			expect.objectContaining({
				form: expect.objectContaining({
					client_id: 'env-client-id',
				}),
			})
		);
	});
});
