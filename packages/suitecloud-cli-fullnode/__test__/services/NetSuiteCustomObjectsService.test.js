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

const NetSuiteCustomObjectsService = require('../../src/services/netsuite/NetSuiteCustomObjectsService');

function mkTempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'suitecloud-customobjects-'));
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
		localHeader.writeUInt32LE(0x04034b50, 0);
		localHeader.writeUInt16LE(20, 4);
		localHeader.writeUInt16LE(0, 6);
		localHeader.writeUInt16LE(0, 8);
		localHeader.writeUInt16LE(0, 10);
		localHeader.writeUInt16LE(0, 12);
		localHeader.writeUInt32LE(crc, 14);
		localHeader.writeUInt32LE(dataBuf.length, 18);
		localHeader.writeUInt32LE(dataBuf.length, 22);
		localHeader.writeUInt16LE(nameBuf.length, 26);
		localHeader.writeUInt16LE(0, 28);

		localParts.push(localHeader, nameBuf, dataBuf);

		const centralHeader = Buffer.alloc(46);
		centralHeader.writeUInt32LE(0x02014b50, 0);
		centralHeader.writeUInt16LE(20, 4);
		centralHeader.writeUInt16LE(20, 6);
		centralHeader.writeUInt16LE(0, 8);
		centralHeader.writeUInt16LE(0, 10);
		centralHeader.writeUInt16LE(0, 12);
		centralHeader.writeUInt16LE(0, 14);
		centralHeader.writeUInt32LE(crc, 16);
		centralHeader.writeUInt32LE(dataBuf.length, 20);
		centralHeader.writeUInt32LE(dataBuf.length, 24);
		centralHeader.writeUInt16LE(nameBuf.length, 28);
		centralHeader.writeUInt16LE(0, 30);
		centralHeader.writeUInt16LE(0, 32);
		centralHeader.writeUInt16LE(0, 34);
		centralHeader.writeUInt16LE(0, 36);
		centralHeader.writeUInt32LE(0, 38);
		centralHeader.writeUInt32LE(offset, 42);

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
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(0, 4);
	eocd.writeUInt16LE(0, 6);
	eocd.writeUInt16LE(entries.length, 8);
	eocd.writeUInt16LE(entries.length, 10);
	eocd.writeUInt32LE(centralDir.length, 12);
	eocd.writeUInt32LE(centralStart, 16);
	eocd.writeUInt16LE(0, 20);

	return Buffer.concat([...localParts, centralDir, eocd]);
}

describe('NetSuiteCustomObjectsService', () => {
	test('lists objects via /app/ide/ide.nl FetchCustomObjectList (multipart) and filters by appId', async () => {
		const server = http.createServer((req, res) => {
			if (req.method === 'POST' && req.url === '/app/ide/ide.nl') {
				expect(req.headers.authorization).toBe('Bearer abc');
				expect(req.headers['user-agent']).toBe('SuiteCloud SDK');

				const chunks = [];
				req.on('data', (c) => chunks.push(c));
				req.on('end', () => {
					const body = Buffer.concat(chunks).toString('utf8');
					expect(body).toContain('name="action"');
					expect(body).toContain('FetchCustomObjectList');
					expect(body).toContain('name="object_type"');
					expect(body).toContain('customrecordtype');
					expect(body).toContain('name="scriptid_contains"');
					expect(body).toContain('custom');

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

		try {
			const service = new NetSuiteCustomObjectsService();

			const noApp = await service.listObjects({
				systemDomain: baseUrl,
				accessToken: 'abc',
				types: ['customrecordtype'],
				scriptIdContains: 'custom',
				appId: null,
			});
			expect(noApp).toEqual([{ type: 'customrecordtype', scriptId: 'customrecord_noapp', appId: '' }]);

			const withApp = await service.listObjects({
				systemDomain: baseUrl,
				accessToken: 'abc',
				types: ['customrecordtype'],
				scriptIdContains: 'custom',
				appId: 'org.myapp',
			});
			expect(withApp).toEqual([{ type: 'customrecordtype', scriptId: 'customrecord_app', appId: 'org.myapp' }]);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	test('imports objects via FetchCustomObjectXml and extracts zip into destination folder (rejects traversal)', async () => {
		const destinationFolder = mkTempDir();

		const statusXml =
			'<status>' +
			'<result><key>customrecord_test</key><type>SUCCESS</type><message></message></result>' +
			'</status>';

		const zip = await zipBuffer([
			{ name: 'customrecord_test.xml', content: '<customrecord />' },
			{ name: 'status.xml', content: statusXml },
		]);

		const traversalZip = zipBufferManual([
			{ name: '../evil.txt', content: 'pwned' },
			{ name: 'status.xml', content: statusXml },
		]);

		let requestCount = 0;
		const server = http.createServer((req, res) => {
			if (req.method === 'POST' && req.url === '/app/ide/ide.nl') {
				requestCount += 1;
				const chunks = [];
				req.on('data', (c) => chunks.push(c));
				req.on('end', () => {
					const body = Buffer.concat(chunks).toString('utf8');
					expect(body).toContain('name="action"');
					expect(body).toContain('FetchCustomObjectXml');
					expect(body).toContain('name="custom_objects"');
					expect(body).toContain('<customObjects>');
					expect(body).toContain('scriptId="customrecord_test"');

					res.writeHead(200, { 'content-type': 'application/octet-stream' });
					res.end(requestCount === 1 ? zip : traversalZip);
				});
				return;
			}

			res.writeHead(404, { 'content-type': 'text/plain' });
			res.end('not found');
		});

		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const baseUrl = `http://127.0.0.1:${server.address().port}`;

		try {
			const service = new NetSuiteCustomObjectsService();

			const ok = await service.importObjects({
				systemDomain: baseUrl,
				accessToken: 'abc',
				destinationFolder,
				objects: [{ type: 'customrecordtype', scriptId: 'customrecord_test', appId: '' }],
			});

			expect(ok.results[0].key).toBe('customrecord_test');
			expect(ok.results[0].type).toBe('SUCCESS');
			expect(fs.readFileSync(path.join(destinationFolder, 'customrecord_test.xml'), 'utf8')).toContain('<customrecord');

			await expect(
				service.importObjects({
					systemDomain: baseUrl,
					accessToken: 'abc',
					destinationFolder,
					objects: [{ type: 'customrecordtype', scriptId: 'customrecord_test', appId: '' }],
				})
			).rejects.toThrow(/outside destination folder|refusing to write zip entry|invalid relative path/i);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});
});
