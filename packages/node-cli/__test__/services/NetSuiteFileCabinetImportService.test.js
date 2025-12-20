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
const crc32 = require('buffer-crc32');

const NetSuiteFileCabinetImportService = require('../../src/services/netsuite/NetSuiteFileCabinetImportService');

function mkTempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'suitecloud-importfiles-'));
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

function zipBufferManual(entries) {
	const localParts = [];
	const centralParts = [];
	let offset = 0;

	const addEntry = (name, contentBuffer) => {
		const nameBuf = Buffer.from(name, 'utf8');
		const dataBuf = Buffer.isBuffer(contentBuffer) ? contentBuffer : Buffer.from(contentBuffer || '', 'utf8');
		const crc = crc32(dataBuf).readUInt32BE(0);

		const localHeader = Buffer.alloc(30);
		localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
		localHeader.writeUInt16LE(20, 4); // version needed
		localHeader.writeUInt16LE(0, 6); // flags
		localHeader.writeUInt16LE(0, 8); // compression method: store
		localHeader.writeUInt16LE(0, 10); // mod time
		localHeader.writeUInt16LE(0, 12); // mod date
		localHeader.writeUInt32LE(crc, 14); // crc32
		localHeader.writeUInt32LE(dataBuf.length, 18); // compressed size
		localHeader.writeUInt32LE(dataBuf.length, 22); // uncompressed size
		localHeader.writeUInt16LE(nameBuf.length, 26); // filename length
		localHeader.writeUInt16LE(0, 28); // extra length

		localParts.push(localHeader, nameBuf, dataBuf);

		const centralHeader = Buffer.alloc(46);
		centralHeader.writeUInt32LE(0x02014b50, 0); // central dir signature
		centralHeader.writeUInt16LE(20, 4); // version made by
		centralHeader.writeUInt16LE(20, 6); // version needed
		centralHeader.writeUInt16LE(0, 8); // flags
		centralHeader.writeUInt16LE(0, 10); // compression
		centralHeader.writeUInt16LE(0, 12); // mod time
		centralHeader.writeUInt16LE(0, 14); // mod date
		centralHeader.writeUInt32LE(crc, 16); // crc32
		centralHeader.writeUInt32LE(dataBuf.length, 20); // compressed size
		centralHeader.writeUInt32LE(dataBuf.length, 24); // uncompressed size
		centralHeader.writeUInt16LE(nameBuf.length, 28); // filename length
		centralHeader.writeUInt16LE(0, 30); // extra length
		centralHeader.writeUInt16LE(0, 32); // comment length
		centralHeader.writeUInt16LE(0, 34); // disk number start
		centralHeader.writeUInt16LE(0, 36); // internal attrs
		centralHeader.writeUInt32LE(0, 38); // external attrs
		centralHeader.writeUInt32LE(offset, 42); // relative offset

		centralParts.push(centralHeader, nameBuf);

		offset += localHeader.length + nameBuf.length + dataBuf.length;
	};

	for (const entry of entries) {
		addEntry(entry.name, Buffer.from(entry.content || '', 'utf8'));
	}

	const centralStart = offset;
	const centralDir = Buffer.concat(centralParts);
	offset += centralDir.length;

	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0); // end of central dir
	eocd.writeUInt16LE(0, 4); // disk number
	eocd.writeUInt16LE(0, 6); // disk w/ central dir
	eocd.writeUInt16LE(entries.length, 8); // records on this disk
	eocd.writeUInt16LE(entries.length, 10); // total records
	eocd.writeUInt32LE(centralDir.length, 12); // central dir size
	eocd.writeUInt32LE(centralStart, 16); // central dir offset
	eocd.writeUInt16LE(0, 20); // comment length

	return Buffer.concat([...localParts, centralDir, eocd]);
}

describe('NetSuiteFileCabinetImportService', () => {
	test('imports files via /app/ide/ide.nl and extracts zip contents into project', async () => {
		const projectFolder = mkTempDir();

		const expectedFileRel = 'FileCabinet/SuiteScripts/smoke-import.txt';
		const expectedFileAbs = path.join(projectFolder, expectedFileRel);
		const statusXml =
			'<status>' +
			'<result><path>/SuiteScripts/smoke-import.txt</path><loaded>true</loaded><message></message></result>' +
			'</status>';

		const zip = await zipBuffer([
			{ name: expectedFileRel, content: 'hello' },
			{ name: 'status.xml', content: statusXml },
		]);

		let lastRequestBody = '';
		const server = http.createServer((req, res) => {
			if (req.method === 'POST' && req.url === '/app/ide/ide.nl') {
				expect(req.headers.authorization).toBe('Bearer abc');
				expect(req.headers['user-agent']).toBe('SuiteCloud SDK');
				expect(`${req.headers['content-type']}`.startsWith('multipart/form-data; boundary=')).toBe(true);

				const chunks = [];
				req.on('data', (c) => chunks.push(c));
				req.on('end', () => {
					lastRequestBody = Buffer.concat(chunks).toString('utf8');
					expect(lastRequestBody).toContain('name=\"action\"');
					expect(lastRequestBody).toContain('ImportFiles');
					expect(lastRequestBody).toContain('<path>/SuiteScripts/smoke-import.txt</path>');
					expect(lastRequestBody).toContain('<content>true</content>');
					expect(lastRequestBody).toContain('<attributes>true</attributes>');

					res.writeHead(200, { 'content-type': 'application/octect-stream;charset=utf-8' });
					res.end(zip);
				});
				return;
			}

			res.writeHead(404, { 'content-type': 'text/plain' });
			res.end('not found');
		});

		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const baseUrl = `http://127.0.0.1:${server.address().port}`;

		try {
			const service = new NetSuiteFileCabinetImportService();
			const result = await service.importFiles({
				systemDomain: baseUrl,
				accessToken: 'abc',
				projectFolder,
				filePaths: ['/SuiteScripts/smoke-import.txt'],
				excludeProperties: false,
			});

			expect(Array.isArray(result.results)).toBe(true);
			expect(result.results[0].path).toBe('/SuiteScripts/smoke-import.txt');
			expect(result.results[0].loaded).toBe(true);
			expect(fs.readFileSync(expectedFileAbs, 'utf8')).toBe('hello');
			expect(result.extractedPaths).toContain(expectedFileAbs);
			expect(lastRequestBody).toContain('<media>');
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	test('excludeproperties sets <attributes>false</attributes>', async () => {
		const projectFolder = mkTempDir();

		const statusXml =
			'<status>' +
			'<result><path>/SuiteScripts/smoke-import.txt</path><loaded>false</loaded><message>NOPE</message></result>' +
			'</status>';
		const zip = await zipBuffer([{ name: 'status.xml', content: statusXml }]);

		const server = http.createServer((req, res) => {
			if (req.method === 'POST' && req.url === '/app/ide/ide.nl') {
				const chunks = [];
				req.on('data', (c) => chunks.push(c));
				req.on('end', () => {
					const body = Buffer.concat(chunks).toString('utf8');
					expect(body).toContain('<attributes>false</attributes>');
					res.writeHead(200, { 'content-type': 'application/octect-stream;charset=utf-8' });
					res.end(zip);
				});
				return;
			}
			res.writeHead(404, { 'content-type': 'text/plain' });
			res.end('not found');
		});

		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const baseUrl = `http://127.0.0.1:${server.address().port}`;

		try {
			const service = new NetSuiteFileCabinetImportService();
			const result = await service.importFiles({
				systemDomain: baseUrl,
				accessToken: 'abc',
				projectFolder,
				filePaths: ['/SuiteScripts/smoke-import.txt'],
				excludeProperties: true,
			});
			expect(result.results[0].loaded).toBe(false);
			expect(result.results[0].message).toBe('NOPE');
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	test('rejects zip path traversal', async () => {
		const projectFolder = mkTempDir();
		const zip = zipBufferManual([
			{ name: '../evil.txt', content: 'pwned' },
			{ name: 'status.xml', content: '<status></status>' },
		]);

		const server = http.createServer((req, res) => {
			if (req.method === 'POST' && req.url === '/app/ide/ide.nl') {
				res.writeHead(200, { 'content-type': 'application/octet-stream' });
				res.end(zip);
				return;
			}
			res.writeHead(404, { 'content-type': 'text/plain' });
			res.end('not found');
		});

		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const baseUrl = `http://127.0.0.1:${server.address().port}`;

		try {
			const service = new NetSuiteFileCabinetImportService();
			await expect(
				service.importFiles({
					systemDomain: baseUrl,
					accessToken: 'abc',
					projectFolder,
					filePaths: ['/SuiteScripts/smoke-import.txt'],
					excludeProperties: true,
				})
			).rejects.toThrow(/outside project folder|invalid relative path/i);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});
});
