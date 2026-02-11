/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const yazl = require('yazl');

const AuthStoreService = require('../../src/services/auth/AuthStoreService');
const NodeSdkExecutor = require('../../src/core/sdkexecutor/NodeSdkExecutor');
const SdkExecutionContext = require('../../src/SdkExecutionContext');
const { ENV_VARS } = require('../../src/ApplicationConstants');

function mkTempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'suitecloud-objectcmd-test-'));
}

function writeManifestAcp(projectFolder) {
	const manifestXml =
		'<manifest projecttype="ACCOUNTCUSTOMIZATION">' +
		'<projectname>Test</projectname>' +
		'<publisherid>com</publisherid>' +
		'<projectid>test</projectid>' +
		'</manifest>';
	fs.writeFileSync(path.join(projectFolder, 'manifest.xml'), manifestXml, 'utf8');
}

function zipBuffer(entries) {
	return new Promise((resolve, reject) => {
		const zipfile = new yazl.ZipFile();
		for (const entry of entries) {
			zipfile.addBuffer(Buffer.from(entry.content, 'utf8'), entry.name);
		}
		const chunks = [];
		zipfile.outputStream.on('data', (c) => chunks.push(c));
		zipfile.outputStream.on('error', reject);
		zipfile.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
		zipfile.end();
	});
}

describe('NodeSdkExecutor listobjects/importobjects', () => {
	const originalEnv = { ...process.env };

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	test('listobjects posts FetchCustomObjectList and filters by appId semantics', async () => {
		process.env[ENV_VARS.SUITECLOUD_CI_PASSKEY] = 'test-passkey';

		const server = http.createServer((req, res) => {
			if (req.method === 'POST' && req.url === '/app/ide/ide.nl') {
				const chunks = [];
				req.on('data', (c) => chunks.push(c));
				req.on('end', () => {
					expect(req.headers.authorization).toBe('Bearer abc');
					const body = Buffer.concat(chunks).toString('utf8');
					expect(body).toContain('FetchCustomObjectList');
					expect(body).toContain('name="object_type"');
					expect(body).toContain('customrecordtype');
					expect(body).toContain('name="scriptid_contains"');
					expect(body).toContain('customrecord');

					const xml =
						'<customObjects>' +
						'<customObject type="customrecordtype" scriptId="customrecord_noapp" />' +
						'<customObject type="customrecordtype" scriptId="customrecord_app" appId="org.myapp" />' +
						'</customObjects>';
					res.writeHead(200, { 'content-type': 'application/xml' });
					res.end(xml);
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
			const ctx = SdkExecutionContext.Builder.forCommand('listobjects')
				.integration()
				.addParam('authid', 'auth1')
				.addParam('type', 'customrecordtype')
				.addParam('scriptid', 'customrecord')
				.build();

			const result = await executor.execute(ctx);
			expect(result.status).toBe('SUCCESS');
			// When no appid is provided, only objects with no appId are listed.
			expect(result.data).toEqual([{ type: 'customrecordtype', scriptId: 'customrecord_noapp', appId: '' }]);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	test('importobjects supports -type ALL by resolving types via listobjects and unzips to destinationfolder', async () => {
		process.env[ENV_VARS.SUITECLOUD_CI_PASSKEY] = 'test-passkey';

		const projectFolder = mkTempDir();
		writeManifestAcp(projectFolder);
		fs.mkdirSync(path.join(projectFolder, 'Objects'), { recursive: true });

		const statusXml =
			'<status>' +
			'<result><key>customrecord_test</key><type>SUCCESS</type><message></message></result>' +
			'</status>';
		const zip = await zipBuffer([
			{ name: 'customrecord_test.xml', content: '<customrecord />' },
			{ name: 'status.xml', content: statusXml },
		]);

		let sawList = false;
		let sawImport = false;

		const server = http.createServer((req, res) => {
			if (req.method === 'POST' && req.url === '/app/ide/ide.nl') {
				const chunks = [];
				req.on('data', (c) => chunks.push(c));
				req.on('end', () => {
					expect(req.headers.authorization).toBe('Bearer abc');
					const body = Buffer.concat(chunks).toString('utf8');

					if (body.includes('FetchCustomObjectList')) {
						sawList = true;
						const xml =
							'<customObjects>' +
							'<customObject type="customrecordtype" scriptId="customrecord_test" />' +
							'</customObjects>';
						res.writeHead(200, { 'content-type': 'application/xml' });
						res.end(xml);
						return;
					}

					if (body.includes('FetchCustomObjectXml')) {
						sawImport = true;
						expect(body).toContain('name="custom_objects"');
						expect(body).toContain('type="customrecordtype"');
						expect(body).toContain('scriptId="customrecord_test"');
						res.writeHead(200, { 'content-type': 'application/octet-stream' });
						res.end(zip);
						return;
					}

					res.writeHead(500, { 'content-type': 'text/plain' });
					res.end('unexpected action');
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
			const ctx = SdkExecutionContext.Builder.forCommand('importobjects')
				.integration()
				.addParam('authid', 'auth1')
				.addParam('project', projectFolder)
				.addParam('destinationfolder', '/Objects')
				.addParam('type', 'ALL')
				.addParam('scriptid', 'customrecord_test')
				.addFlag('excludefiles')
				.build();

			const result = await executor.execute(ctx);
			expect(sawList).toBe(true);
			expect(sawImport).toBe(true);
			expect(result.status).toBe('SUCCESS');
			expect(result.data.successfulImports[0].customObject.id).toBe('customrecord_test');
			expect(fs.existsSync(path.join(projectFolder, 'Objects', 'customrecord_test.xml'))).toBe(true);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	test('importobjects imports referenced SuiteScript files for ACP customscript* when not using -excludefiles', async () => {
		process.env[ENV_VARS.SUITECLOUD_CI_PASSKEY] = 'test-passkey';

		const projectFolder = mkTempDir();
		writeManifestAcp(projectFolder);
		fs.mkdirSync(path.join(projectFolder, 'Objects'), { recursive: true });

		const objectStatusXml =
			'<status>' +
			'<result><key>customscript_test</key><type>SUCCESS</type><message></message></result>' +
			'</status>';
		const objectZip = await zipBuffer([
			{ name: 'customscript_test.xml', content: '<script><scriptfile>/SuiteScripts/test.js</scriptfile></script>' },
			{ name: 'status.xml', content: objectStatusXml },
		]);

		const fileStatusXml =
			'<status>' +
			'<result><path>/SuiteScripts/test.js</path><loaded>true</loaded><message></message></result>' +
			'</status>';
		const fileZip = await zipBuffer([
			{ name: 'FileCabinet/SuiteScripts/test.js', content: "console.log('ok')\n" },
			{ name: 'status.xml', content: fileStatusXml },
		]);

		let sawImportObjects = false;
		let sawImportFiles = false;

		const server = http.createServer((req, res) => {
			if (req.method === 'POST' && req.url === '/app/ide/ide.nl') {
				const chunks = [];
				req.on('data', (c) => chunks.push(c));
				req.on('end', () => {
					expect(req.headers.authorization).toBe('Bearer abc');
					const body = Buffer.concat(chunks).toString('utf8');

					if (body.includes('FetchCustomObjectXml')) {
						sawImportObjects = true;
						expect(body).toContain('scriptId="customscript_test"');
						res.writeHead(200, { 'content-type': 'application/octet-stream' });
						res.end(objectZip);
						return;
					}

					if (body.includes('ImportFiles')) {
						sawImportFiles = true;
						expect(body).toContain('<path>/SuiteScripts/test.js</path>');
						res.writeHead(200, { 'content-type': 'application/octet-stream' });
						res.end(fileZip);
						return;
					}

					res.writeHead(500, { 'content-type': 'text/plain' });
					res.end('unexpected action');
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
			const ctx = SdkExecutionContext.Builder.forCommand('importobjects')
				.integration()
				.addParam('authid', 'auth1')
				.addParam('project', projectFolder)
				.addParam('destinationfolder', '/Objects')
				.addParam('type', 'advancedrevrecplugin')
				.addParam('scriptid', 'customscript_test')
				.build();

			const result = await executor.execute(ctx);
			expect(sawImportObjects).toBe(true);
			expect(sawImportFiles).toBe(true);
			expect(result.status).toBe('SUCCESS');
			expect(result.data.successfulImports[0].referencedFileImportResult.successfulImports).toEqual([{ path: '/SuiteScripts/test.js' }]);
			expect(fs.existsSync(path.join(projectFolder, 'FileCabinet', 'SuiteScripts', 'test.js'))).toBe(true);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	test('update overwrites objects via FetchCustomObjectXml mode=UPDATE (preserves existing subfolders)', async () => {
		process.env[ENV_VARS.SUITECLOUD_CI_PASSKEY] = 'test-passkey';

		const projectFolder = mkTempDir();
		writeManifestAcp(projectFolder);

		const existingFolder = path.join(projectFolder, 'Objects', 'MyObjects');
		fs.mkdirSync(existingFolder, { recursive: true });
		const existingPath = path.join(existingFolder, 'customrecord_test.xml');
		fs.writeFileSync(existingPath, '<old />', 'utf8');

		const statusXml =
			'<status>' +
			'<result><key>customrecord_test</key><type>SUCCESS</type><message></message></result>' +
			'</status>';
		const zip = await zipBuffer([
			{ name: 'customrecord_test.xml', content: '<new />' },
			{ name: 'status.xml', content: statusXml },
		]);

		let sawList = false;
		let sawUpdate = false;

		const server = http.createServer((req, res) => {
			if (req.method === 'POST' && req.url === '/app/ide/ide.nl') {
				const chunks = [];
				req.on('data', (c) => chunks.push(c));
				req.on('end', () => {
					expect(req.headers.authorization).toBe('Bearer abc');
					const body = Buffer.concat(chunks).toString('utf8');

					if (body.includes('FetchCustomObjectList')) {
						sawList = true;
						const xml =
							'<customObjects>' +
							'<customObject type="customrecordtype" scriptId="customrecord_test" />' +
							'</customObjects>';
						res.writeHead(200, { 'content-type': 'application/xml' });
						res.end(xml);
						return;
					}

					if (body.includes('FetchCustomObjectXml')) {
						sawUpdate = true;
						expect(body).toContain('name="mode"');
						expect(body).toContain('UPDATE');
						expect(body).toContain('name="custom_objects"');
						expect(body).toContain('type="customrecordtype"');
						expect(body).toContain('scriptId="customrecord_test"');
						res.writeHead(200, { 'content-type': 'application/octet-stream' });
						res.end(zip);
						return;
					}

					res.writeHead(500, { 'content-type': 'text/plain' });
					res.end('unexpected action');
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
			const ctx = SdkExecutionContext.Builder.forCommand('update')
				.integration()
				.addParam('authid', 'auth1')
				.addParam('project', projectFolder)
				.addParam('scriptid', 'customrecord_test')
				.build();

			const result = await executor.execute(ctx);
			expect(sawList).toBe(true);
			expect(sawUpdate).toBe(true);
			expect(result.status).toBe('SUCCESS');
			expect(result.data.find((r) => r.key === 'customrecord_test').type).toBe('SUCCESS');
			expect(fs.readFileSync(existingPath, 'utf8')).toContain('<new');
			expect(fs.existsSync(path.join(projectFolder, 'Objects', 'customrecord_test.xml'))).toBe(false);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	test('updatecustomrecordwithinstances downloads zip and extracts into Objects/', async () => {
		process.env[ENV_VARS.SUITECLOUD_CI_PASSKEY] = 'test-passkey';

		const projectFolder = mkTempDir();
		writeManifestAcp(projectFolder);
		fs.mkdirSync(path.join(projectFolder, 'Objects'), { recursive: true });

		const zip = await zipBuffer([
			{ name: 'customrecord_test.xml', content: '<customrecordtype />' },
			{ name: 'customrecord_test_instance.xml', content: '<customrecord />' },
		]);

		const server = http.createServer((req, res) => {
			if (req.method === 'POST' && req.url === '/app/ide/fetchcustomrecordwithinstancesxml.nl') {
				const chunks = [];
				req.on('data', (c) => chunks.push(c));
				req.on('end', () => {
					expect(req.headers.authorization).toBe('Bearer abc');
					expect(req.headers['content-type']).toContain('application/x-www-form-urlencoded');
					const body = Buffer.concat(chunks).toString('utf8');
					expect(body).toContain('scriptid=customrecord_test');
					res.writeHead(200, { 'content-type': 'application/octet-stream' });
					res.end(zip);
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
			const ctx = SdkExecutionContext.Builder.forCommand('updatecustomrecordwithinstances')
				.integration()
				.addParam('authid', 'auth1')
				.addParam('project', projectFolder)
				.addParam('scriptid', 'customrecord_test')
				.build();

			const result = await executor.execute(ctx);
			expect(result.status).toBe('SUCCESS');
			expect(result.data).toContain('customrecord_test');
			expect(fs.existsSync(path.join(projectFolder, 'Objects', 'customrecord_test.xml'))).toBe(true);
			expect(fs.existsSync(path.join(projectFolder, 'Objects', 'customrecord_test_instance.xml'))).toBe(true);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});
});
