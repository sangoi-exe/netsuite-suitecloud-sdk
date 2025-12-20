/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const NetSuiteCiAuthService = require('../../src/services/auth/NetSuiteCiAuthService');

function base64UrlDecode(input) {
	const normalized = input.replaceAll('-', '+').replaceAll('_', '/');
	const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
	return Buffer.from(normalized + pad, 'base64');
}

function mkTempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'suitecloud-auth-ci-'));
}

describe('NetSuiteCiAuthService', () => {
	test('authenticates using datacenterurls + token + tokeninfo', async () => {
		const originalNsScopes = process.env.NS_SCOPES;
		delete process.env.NS_SCOPES;

		const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
		const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
		const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });

		const tmp = mkTempDir();
		const privateKeyPath = path.join(tmp, 'key.pem');
		fs.writeFileSync(privateKeyPath, privateKeyPem, 'utf8');

		let lastTokenRequestBody = '';

		const server = http.createServer((req, res) => {
			if (req.method === 'GET' && req.url && req.url.startsWith('/rest/datacenterurls')) {
				const base = `http://127.0.0.1:${server.address().port}`;
				res.writeHead(200, { 'content-type': 'application/json' });
				res.end(
					JSON.stringify({
						restDomain: base,
						systemDomain: base,
						webservicesDomain: base,
					})
				);
				return;
			}

			if (req.method === 'POST' && req.url === '/services/rest/auth/oauth2/v1/token') {
				const chunks = [];
				req.on('data', (c) => chunks.push(c));
				req.on('end', () => {
					lastTokenRequestBody = Buffer.concat(chunks).toString('utf8');
					const parsed = new URLSearchParams(lastTokenRequestBody);

					expect(parsed.get('grant_type')).toBe('client_credentials');
					expect(parsed.get('client_id')).toBe('client123');
					expect(parsed.get('client_assertion_type')).toBe('urn:ietf:params:oauth:client-assertion-type:jwt-bearer');

					const jwt = parsed.get('client_assertion');
					expect(jwt).toBeTruthy();

					const [h, p, s] = jwt.split('.');
					const header = JSON.parse(base64UrlDecode(h).toString('utf8'));
					const payload = JSON.parse(base64UrlDecode(p).toString('utf8'));
					expect(header.alg).toBe('PS256');
					expect(header.kid).toBe('cert123');
					expect(payload.iss).toBe('client123');
					expect(payload.sub).toBeUndefined();
					expect(`${payload.aud}`.endsWith('/services/rest/auth/oauth2/v1/token')).toBe(true);
					expect(payload.scope).toBe('rest_webservices');

					const ok = crypto.verify(
						'sha256',
						Buffer.from(`${h}.${p}`),
						{
							key: publicKeyPem,
							padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
							saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
						},
						base64UrlDecode(s)
					);
					expect(ok).toBe(true);

					res.writeHead(200, { 'content-type': 'application/json' });
					res.end(JSON.stringify({ access_token: 'abc', expires_in: 3600, token_type: 'Bearer' }));
				});
				return;
			}

			if (req.method === 'GET' && req.url === '/rest/tokeninfo') {
				expect(req.headers.authorization).toBe('Bearer abc');
				res.writeHead(200, { 'content-type': 'application/json' });
				res.end(JSON.stringify({ companyName: 'ACME', companyId: 'TEST', roleName: 'Role' }));
				return;
			}

			res.writeHead(404, { 'content-type': 'text/plain' });
			res.end('not found');
		});

		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const baseUrl = `http://127.0.0.1:${server.address().port}`;

		try {
			const authService = new NetSuiteCiAuthService();
			const result = await authService.authenticateCi({
				accountId: 'TEST',
				clientId: 'client123',
				certificateId: 'cert123',
				privateKeyPath,
				domain: baseUrl,
			});

			expect(result.accountInfo.companyName).toBe('ACME');
			expect(result.accountInfo.companyId).toBe('TEST');
			expect(result.accountInfo.roleName).toBe('Role');
			expect(result.hostInfo.hostName).toBe('127.0.0.1');
			expect(result.token.accessToken).toBe('abc');
			expect(lastTokenRequestBody).toContain('client_assertion=');
		} finally {
			if (originalNsScopes === undefined) {
				delete process.env.NS_SCOPES;
			} else {
				process.env.NS_SCOPES = originalNsScopes;
			}
			await new Promise((resolve) => server.close(resolve));
		}
	});

	test('uses NS_SCOPES env var when provided', async () => {
		const originalNsScopes = process.env.NS_SCOPES;
		process.env.NS_SCOPES = 'rest_webservices restlets';

		const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
		const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
		const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });

		const tmp = mkTempDir();
		const privateKeyPath = path.join(tmp, 'key.pem');
		fs.writeFileSync(privateKeyPath, privateKeyPem, 'utf8');

		const server = http.createServer((req, res) => {
			if (req.method === 'GET' && req.url && req.url.startsWith('/rest/datacenterurls')) {
				const base = `http://127.0.0.1:${server.address().port}`;
				res.writeHead(200, { 'content-type': 'application/json' });
				res.end(
					JSON.stringify({
						restDomain: base,
						systemDomain: base,
						webservicesDomain: base,
					})
				);
				return;
			}

			if (req.method === 'POST' && req.url === '/services/rest/auth/oauth2/v1/token') {
				const chunks = [];
				req.on('data', (c) => chunks.push(c));
				req.on('end', () => {
					const parsed = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
					const jwt = parsed.get('client_assertion');
					const [, payloadB64] = jwt.split('.');
					const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
					expect(payload.scope).toBe('rest_webservices restlets');

					res.writeHead(200, { 'content-type': 'application/json' });
					res.end(JSON.stringify({ access_token: 'abc', expires_in: 3600, token_type: 'Bearer' }));
				});
				return;
			}

			if (req.method === 'GET' && req.url === '/rest/tokeninfo') {
				res.writeHead(200, { 'content-type': 'application/json' });
				res.end(JSON.stringify({ companyName: 'ACME', companyId: 'TEST', roleName: 'Role' }));
				return;
			}

			res.writeHead(404, { 'content-type': 'text/plain' });
			res.end('not found');
		});

		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const baseUrl = `http://127.0.0.1:${server.address().port}`;

		try {
			const authService = new NetSuiteCiAuthService();
			await authService.authenticateCi({
				accountId: 'TEST',
				clientId: 'client123',
				certificateId: 'cert123',
				privateKeyPath,
				domain: baseUrl,
			});
		} finally {
			if (originalNsScopes === undefined) {
				delete process.env.NS_SCOPES;
			} else {
				process.env.NS_SCOPES = originalNsScopes;
			}
			await new Promise((resolve) => server.close(resolve));
		}
	});
});
