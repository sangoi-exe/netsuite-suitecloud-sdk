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
});

