/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const NetSuiteSdfDevFrameworkService = require('../../src/services/netsuite/NetSuiteSdfDevFrameworkService');

function mkTempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'suitecloud-sdf-devframework-'));
}

describe('NetSuiteSdfDevFrameworkService', () => {
	test('validateServer uploads mediafile + parameters and parses lines', async () => {
		const tmp = mkTempDir();
		const zipPath = path.join(tmp, 'project.zip');
		fs.writeFileSync(zipPath, Buffer.from('ZIPDATA', 'utf8'));

		const server = http.createServer((req, res) => {
			if (req.method === 'POST' && req.url === '/app/suiteapp/devframework/idevalidationhandler.nl') {
				expect(req.headers.authorization).toBe('Bearer abc');
				expect(req.headers['sdf-action']).toBe('validate');
				expect(req.headers['user-agent']).toBe('SuiteCloud SDK');
				expect(`${req.headers['content-type']}`.startsWith('multipart/form-data; boundary=')).toBe(true);

				const chunks = [];
				req.on('data', (c) => chunks.push(c));
				req.on('end', () => {
					const bodyText = Buffer.concat(chunks).toString('utf8');
					expect(bodyText).toContain('name=\"accountspecificvalues\"');
					expect(bodyText).toContain('\r\nERROR\r\n');
					expect(bodyText).toContain('name=\"applyinstallprefs\"');
					expect(bodyText).toContain('\r\nF\r\n');
					expect(bodyText).toContain('name=\"mediafile\"; filename=\"project.zip\"');
					expect(bodyText).toContain('Content-Type: application/x-zip-compressed');
					expect(bodyText).toContain('ZIPDATA');

					res.writeHead(200, { 'content-type': 'text/plain;charset=utf-8' });
					res.end('Instalação iniciada\nline2\n');
				});
				return;
			}

			res.writeHead(404, { 'content-type': 'text/plain' });
			res.end('not found');
		});

		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const baseUrl = `http://127.0.0.1:${server.address().port}`;

		try {
			const service = new NetSuiteSdfDevFrameworkService();
			const lines = await service.validateServer({
				systemDomain: baseUrl,
				accessToken: 'abc',
				zipPath,
			});
			expect(lines).toEqual(['Instalação iniciada', 'line2']);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	test('retries once when response is empty but sets cookie', async () => {
		const tmp = mkTempDir();
		const zipPath = path.join(tmp, 'project.zip');
		fs.writeFileSync(zipPath, Buffer.from('ZIPDATA', 'utf8'));

		let calls = 0;
		const server = http.createServer((req, res) => {
			if (req.method === 'POST' && req.url === '/app/suiteapp/devframework/idevalidationhandler.nl') {
				calls += 1;
				if (calls === 1) {
					res.writeHead(200, { 'set-cookie': 'bm_sz=abc; Path=/;', 'content-type': 'text/plain;charset=utf-8' });
					res.end('');
					return;
				}

				expect(req.headers.cookie).toContain('bm_sz=abc');
				res.writeHead(200, { 'content-type': 'text/plain;charset=utf-8' });
				res.end('ok\n');
				return;
			}

			res.writeHead(404, { 'content-type': 'text/plain' });
			res.end('not found');
		});

		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const baseUrl = `http://127.0.0.1:${server.address().port}`;

		try {
			const service = new NetSuiteSdfDevFrameworkService();
			const lines = await service.validateServer({
				systemDomain: baseUrl,
				accessToken: 'abc',
				zipPath,
			});
			expect(calls).toBe(2);
			expect(lines).toEqual(['ok']);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	test('throws when server returns *** ERROR *** response', async () => {
		const tmp = mkTempDir();
		const zipPath = path.join(tmp, 'project.zip');
		fs.writeFileSync(zipPath, Buffer.from('ZIPDATA', 'utf8'));

		const server = http.createServer((req, res) => {
			if (req.method === 'POST' && req.url === '/app/suiteapp/devframework/idevalidationhandler.nl') {
				res.writeHead(200, { 'content-type': 'text/plain;charset=utf-8' });
				res.end('*** ERROR ***\\nSomething bad happened\\n');
				return;
			}
			res.writeHead(404, { 'content-type': 'text/plain' });
			res.end('not found');
		});

		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const baseUrl = `http://127.0.0.1:${server.address().port}`;

		try {
			const service = new NetSuiteSdfDevFrameworkService();
			await expect(
				service.validateServer({
					systemDomain: baseUrl,
					accessToken: 'abc',
					zipPath,
				})
			).rejects.toThrow('Something bad happened');
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	test('throws helpful message when server returns HTML login page (missing scopes)', async () => {
		const tmp = mkTempDir();
		const zipPath = path.join(tmp, 'project.zip');
		fs.writeFileSync(zipPath, Buffer.from('ZIPDATA', 'utf8'));

		const server = http.createServer((req, res) => {
			if (req.method === 'POST' && req.url === '/app/suiteapp/devframework/idevalidationhandler.nl') {
				res.writeHead(500, { 'content-type': 'text/html;charset=utf-8' });
				res.end(
					'<!DOCTYPE html><html><body><div class=\"uir-error-page-message\">You must &lt;a href=&#39;/pages/login.jsp&#39;&gt;log in&lt;/a&gt; before accessing this page.</div></body></html>'
				);
				return;
			}
			res.writeHead(404, { 'content-type': 'text/plain' });
			res.end('not found');
		});

		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const baseUrl = `http://127.0.0.1:${server.address().port}`;

		try {
			const service = new NetSuiteSdfDevFrameworkService();
			await expect(
				service.validateServer({
					systemDomain: baseUrl,
					accessToken: 'abc',
					zipPath,
				})
			).rejects.toThrow('restlets');
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});
});
