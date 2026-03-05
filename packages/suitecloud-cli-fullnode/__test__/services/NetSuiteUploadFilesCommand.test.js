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
	return fs.mkdtempSync(path.join(os.tmpdir(), 'suitecloud-uploadfiles-test-'));
}

describe('NodeSdkExecutor uploadfiles', () => {
	const originalEnv = { ...process.env };

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	test('uploads a local FileCabinet file via filecabinetupload.nl', async () => {
		process.env[ENV_VARS.SUITECLOUD_CI_PASSKEY] = 'test-passkey';

		const projectFolder = mkTempDir();
		const fileAbsolutePath = path.join(projectFolder, 'FileCabinet', 'SuiteScripts', 'hello.js');
		fs.mkdirSync(path.dirname(fileAbsolutePath), { recursive: true });
		fs.writeFileSync(fileAbsolutePath, 'console.log("hi")\n', 'utf8');

		const server = http.createServer((req, res) => {
			if (req.method === 'POST' && req.url && req.url.startsWith('/app/suiteapp/devframework/fileupload/filecabinetupload.nl')) {
				const u = new URL(`http://127.0.0.1${req.url}`);
				expect(u.searchParams.get('parentFolder')).toBe('/SuiteScripts');
				expect(req.headers.authorization).toBe('Bearer abc');
				expect(`${req.headers['content-type']}`).toContain('multipart/form-data; boundary=');

				const chunks = [];
				req.on('data', (c) => chunks.push(c));
				req.on('end', () => {
					const body = Buffer.concat(chunks).toString('utf8');
					expect(body).toContain('Content-Disposition: form-data; name="file"; filename="hello.js"');
					expect(body).toContain('console.log("hi")');

					res.writeHead(200, { 'content-type': 'application/json' });
					res.end(
						JSON.stringify({
							parentFolderId: 1,
							parentFolderName: 'SuiteScripts',
							fileId: 10,
							fileName: 'hello.js',
							action: 'upload',
							error: null,
						})
					);
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
			const ctx = SdkExecutionContext.Builder.forCommand('uploadfiles')
				.integration()
				.addParam('authid', 'auth1')
				.addParam('project', `"${projectFolder}"`)
				.addParam('paths', '"/SuiteScripts/hello.js"')
				.build();

			const result = await executor.execute(ctx);
			expect(result.status).toBe('SUCCESS');
			expect(Array.isArray(result.data)).toBe(true);
			expect(result.data[0].type).toBe('SUCCESS');
			expect(result.data[0].file.path).toBe(fileAbsolutePath);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});
});

