/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const xml2js = require('xml2js');
const yauzl = require('yauzl');

const HttpClient = require('../http/HttpClient');
const CookieJar = require('../../utils/http/CookieJar');

const USER_AGENT = 'SuiteCloud SDK';

const IDE_SERVLET_PATH = '/app/ide/ide.nl';
const ACTION_VALUE = 'ImportFiles';

const MULTIPART_ACTION_FIELD = 'action';
const MULTIPART_FILES_FIELD = 'files';

function joinUrl(base, pathname) {
	const url = new URL(`${base}`);
	url.pathname = pathname;
	return url;
}

function escapeXml(value) {
	return `${value}`
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function buildFilesXml(filePaths, excludeProperties) {
	const normalizedPaths = (filePaths || []).map((p) => {
		const trimmed = `${p || ''}`.trim();
		if (!trimmed) return null;
		return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
	}).filter(Boolean);

	const attributesValue = excludeProperties ? 'false' : 'true';
	const fileXml = normalizedPaths
		.map(
			(p) =>
				`<file>` +
				`<path>${escapeXml(p)}</path>` +
				`<content>true</content>` +
				`<attributes>${attributesValue}</attributes>` +
				`</file>`
		)
		.join('');

	return `<media><files>${fileXml}</files></media>`;
}

function buildMultipartBody(fields) {
	const boundary = `----suitecloud-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
	const parts = [];

	for (const [name, value] of Object.entries(fields || {})) {
		parts.push(
			Buffer.from(
				`--${boundary}\r\n` +
					`Content-Disposition: form-data; name="${name}"\r\n` +
					`\r\n` +
					`${value}\r\n`,
				'utf8'
			)
		);
	}
	parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));

	return { contentType: `multipart/form-data; boundary=${boundary}`, body: Buffer.concat(parts) };
}

function isSubPath(rootDir, candidatePath) {
	const relative = path.relative(rootDir, candidatePath);
	return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function safeResolveProjectPath(projectFolder, zipEntryName) {
	const normalized = `${zipEntryName}`.replaceAll('\\', '/').replace(/^\/+/, '');
	const resolved = path.resolve(projectFolder, normalized);
	if (!isSubPath(projectFolder, resolved)) {
		throw new Error(`Refusing to write zip entry outside project folder: ${normalized}`);
	}
	return { normalized, resolved };
}

function extractLoginHtmlMessage(htmlText) {
	const text = `${htmlText || ''}`;
	if (!text) {
		return null;
	}
	const normalized = text.toLowerCase();
	if (!normalized.includes('log in')) {
		return null;
	}
	const match = text.match(/<div class=\"uir-error-page-message\">([^<]+)<\/div>/i);
	if (match && match[1]) {
		return match[1].replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&#39;', "'").trim();
	}
	return null;
}

async function parseStatusXml(statusXmlText) {
	const parser = new xml2js.Parser({ explicitArray: false, trim: true });
	const parsed = await parser.parseStringPromise(statusXmlText);
	const status = parsed && parsed.status ? parsed.status : {};
	const resultsRaw = status.result ? (Array.isArray(status.result) ? status.result : [status.result]) : [];
	return resultsRaw.map((r) => ({
		path: r && r.path ? `${r.path}` : '',
		loaded: `${r && r.loaded !== undefined ? r.loaded : ''}`.trim().toLowerCase() === 'true',
		message: r && r.message ? `${r.message}` : '',
	}));
}

async function extractZipToProject(zipBuffer, projectFolder) {
	let statusXmlText = null;
	const extractedPaths = [];

	await new Promise((resolve, reject) => {
		yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
			if (err) return reject(err);

			let settled = false;
			const safeResolve = () => {
				if (settled) return;
				settled = true;
				try {
					zipfile.close();
				} catch (e) {
					// ignore
				}
				resolve();
			};
			const safeReject = (error) => {
				if (settled) return;
				settled = true;
				try {
					zipfile.close();
				} catch (e) {
					// ignore
				}
				reject(error);
			};

			const next = () => zipfile.readEntry();
			next();

			zipfile.on('entry', (entry) => {
				if (settled) {
					return;
				}
				try {
					const name = `${entry.fileName || ''}`;

					if (name === 'status.xml') {
						zipfile.openReadStream(entry, (streamErr, stream) => {
							if (streamErr) return safeReject(streamErr);
							const chunks = [];
							stream.on('data', (c) => chunks.push(c));
							stream.on('end', () => {
								statusXmlText = Buffer.concat(chunks).toString('utf8');
								next();
							});
							stream.on('error', safeReject);
						});
						return;
					}

					const { normalized, resolved } = safeResolveProjectPath(projectFolder, name);

					if (normalized.endsWith('/')) {
						fs.mkdirSync(resolved, { recursive: true });
						next();
						return;
					}

					fs.mkdirSync(path.dirname(resolved), { recursive: true });
					zipfile.openReadStream(entry, (streamErr, readStream) => {
						if (streamErr) return safeReject(streamErr);
						const out = fs.createWriteStream(resolved);
						out.on('error', safeReject);
						out.on('finish', () => {
							extractedPaths.push(resolved);
							next();
						});
						readStream.on('error', safeReject);
						readStream.pipe(out);
					});
				} catch (e) {
					safeReject(e);
				}
			});

			zipfile.on('end', safeResolve);
			zipfile.on('error', safeReject);
		});
	});

	if (!statusXmlText) {
		throw new Error('ImportFiles zip is missing status.xml');
	}

	return { statusXmlText, extractedPaths };
}

module.exports = class NetSuiteFileCabinetImportService {
	constructor(dependencies) {
		this._httpClient = (dependencies && dependencies.httpClient) || new HttpClient();
	}

	async importFiles(options) {
		assert(options);
		assert(options.systemDomain);
		assert(options.accessToken);
		assert(options.projectFolder);
		assert(Array.isArray(options.filePaths));

		const cookieJar = options.cookieJar || new CookieJar();
		const url = joinUrl(options.systemDomain, IDE_SERVLET_PATH);

		const filesXml = buildFilesXml(options.filePaths, Boolean(options.excludeProperties));
		const multipart = buildMultipartBody({
			[MULTIPART_ACTION_FIELD]: ACTION_VALUE,
			[MULTIPART_FILES_FIELD]: filesXml,
		});

		for (let attempt = 0; attempt < 2; attempt++) {
			const response = await this._httpClient.request({
				url: url.toString(),
				method: 'POST',
				cookieJar,
				headers: {
					authorization: `Bearer ${options.accessToken}`,
					'user-agent': USER_AGENT,
					accept: '*/*',
					'content-type': multipart.contentType,
				},
				body: multipart.body,
			});

			if (response.statusCode < 200 || response.statusCode >= 300) {
				const loginMessage = extractLoginHtmlMessage(response.text);
				if (loginMessage) {
					throw new Error(
						`${loginMessage}\n\n` +
							`This usually means the OAuth2 token is missing required scopes for file import. ` +
							`Re-run account:setup:ci with --scope "rest_webservices restlets" (or set SUITECLOUD_SCOPES/NS_SCOPES) and try again.`
					);
				}
				const snippet = `${response.text || ''}`.slice(0, 500);
				throw new Error(`Import files request failed (status=${response.statusCode}): ${snippet}`);
			}

			if ((response.body || Buffer.alloc(0)).length === 0 && attempt === 0 && response.headers && response.headers['set-cookie']) {
				continue;
			}

			const { statusXmlText, extractedPaths } = await extractZipToProject(response.body, options.projectFolder);
			const results = await parseStatusXml(statusXmlText);
			return { results, extractedPaths };
		}

		throw new Error('Empty response from ImportFiles endpoint.');
	}
};
