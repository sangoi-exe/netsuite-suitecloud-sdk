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

const ACTION_LIST_OBJECTS = 'FetchCustomObjectList';
const ACTION_IMPORT_OBJECTS = 'FetchCustomObjectXml';

const MULTIPART_ACTION_FIELD = 'action';
const MULTIPART_TYPES_FIELD = 'object_type';
const MULTIPART_SCRIPTID_CONTAINS_FIELD = 'scriptid_contains';
const MULTIPART_CUSTOM_OBJECTS_FIELD = 'custom_objects';
const MULTIPART_MODE_FIELD = 'mode';
const MULTIPART_PACKAGE_ROOT_FIELD = 'package_root';

const CUSTOM_RECORD_WITH_INSTANCES_PATH = '/app/ide/fetchcustomrecordwithinstancesxml.nl';
const CUSTOM_RECORD_WITH_INSTANCES_SCRIPT_ID_FIELD = 'scriptid';
const CUSTOM_RECORD_WITH_INSTANCES_APP_ID_FIELD = 'appid';

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

function buildMultipartBody(fields) {
	const boundary = `----suitecloud-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
	const parts = [];

	const appendField = (name, value) => {
		parts.push(
			Buffer.from(
				`--${boundary}\r\n` +
					`Content-Disposition: form-data; name="${name}"\r\n` +
					`\r\n` +
					`${value}\r\n`,
				'utf8'
			)
		);
	};

	for (const [name, rawValue] of Object.entries(fields || {})) {
		if (rawValue === undefined || rawValue === null) {
			continue;
		}
		if (Array.isArray(rawValue)) {
			rawValue.forEach((v) => appendField(name, v));
			continue;
		}
		appendField(name, rawValue);
	}

	parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
	return { contentType: `multipart/form-data; boundary=${boundary}`, body: Buffer.concat(parts) };
}

function isSubPath(rootDir, candidatePath) {
	const relative = path.relative(rootDir, candidatePath);
	return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function safeResolveDestinationPath(destinationFolder, zipEntryName) {
	const normalized = `${zipEntryName}`.replaceAll('\\', '/').replace(/^\/+/, '');
	const resolved = path.resolve(destinationFolder, normalized);
	if (!isSubPath(destinationFolder, resolved)) {
		throw new Error(`Refusing to write zip entry outside destination folder: ${normalized}`);
	}
	return { normalized, resolved };
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

function buildUrlEncodedFormBody(fields) {
	const parts = [];
	for (const [key, value] of Object.entries(fields || {})) {
		if (value === undefined || value === null) {
			continue;
		}
		parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(`${value}`)}`);
	}
	return parts.join('&');
}

function isZipBuffer(buffer) {
	const b = buffer || Buffer.alloc(0);
	return b.length >= 2 && b[0] === 0x50 && b[1] === 0x4b; // "PK"
}

async function parseCustomObjectListXml(xmlText) {
	const parser = new xml2js.Parser({ explicitArray: false, trim: true });
	const parsed = await parser.parseStringPromise(`${xmlText || ''}`.trim());

	const root =
		(parsed && (parsed.customObjects || parsed.customobjects || parsed.CustomObjects || parsed.Customobjects)) ||
		(parsed && (parsed.customObjectList || parsed.CustomObjectList)) ||
		parsed ||
		{};

	const list =
		(root.customObject || root.customobject || (root.customObjects && root.customObjects.customObject)) ||
		(root.customobject && root.customobject.customObject) ||
		[];

	const items = Array.isArray(list) ? list : [list];
	return items
		.map((item) => {
			const attrs = item && item.$ ? item.$ : {};
			const type = attrs.type || item.type || '';
			const scriptId = attrs.scriptId || attrs.scriptid || item.scriptId || item.scriptid || '';
			const appId = attrs.appId || attrs.appid || item.appId || item.appid || '';
			return {
				type: type ? `${type}` : '',
				scriptId: scriptId ? `${scriptId}` : '',
				appId: appId ? `${appId}` : '',
			};
		})
		.filter((o) => o.scriptId);
}

function buildCustomObjectsXml(objects) {
	const customObjectXml = (objects || [])
		.map((o) => {
			const attrs = [];
			if (o.type) attrs.push(`type="${escapeXml(o.type)}"`);
			if (o.scriptId) attrs.push(`scriptId="${escapeXml(o.scriptId)}"`);
			if (o.appId) attrs.push(`appId="${escapeXml(o.appId)}"`);
			return `<customObject ${attrs.join(' ')} />`;
		})
		.join('');
	return `<customObjects>${customObjectXml}</customObjects>`;
}

async function parseStatusResultsXml(statusXmlText) {
	const parser = new xml2js.Parser({ explicitArray: false, trim: true });
	const parsed = await parser.parseStringPromise(`${statusXmlText || ''}`.trim());

	const status = (parsed && (parsed.status || parsed.Status)) || parsed || {};
	const resultsNode = status.result || (status.results && status.results.result) || [];
	const resultsRaw = Array.isArray(resultsNode) ? resultsNode : [resultsNode];

	return resultsRaw
		.map((r) => ({
			key: r && r.key ? `${r.key}` : '',
			type: r && r.type ? `${r.type}` : '',
			message: r && r.message ? `${r.message}` : '',
		}))
		.filter((r) => r.key);
}

async function extractZipToDestination(zipBuffer, destinationFolder) {
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

					const { normalized, resolved } = safeResolveDestinationPath(destinationFolder, name);

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
		throw new Error('ImportObjects zip is missing status.xml');
	}

	return { statusXmlText, extractedPaths };
}

function listXmlFilesRecursive(rootDir) {
	const found = [];
	if (!rootDir || !fs.existsSync(rootDir)) {
		return found;
	}

	const stack = [rootDir];
	while (stack.length > 0) {
		const current = stack.pop();
		let entries;
		try {
			entries = fs.readdirSync(current, { withFileTypes: true });
		} catch (e) {
			continue;
		}

		for (const entry of entries) {
			const fullPath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(fullPath);
				continue;
			}
			if (entry.isFile() && entry.name.toLowerCase().endsWith('.xml')) {
				found.push(fullPath);
			}
		}
	}
	return found;
}

async function extractZipToProject(zipBuffer, { projectFolder, objectsFolder, requireStatusXml }) {
	let statusXmlText = null;
	const extractedPaths = [];

	const scriptIdToExistingPath = new Map(
		listXmlFilesRecursive(objectsFolder).map((filePath) => [path.basename(filePath, path.extname(filePath)), filePath])
	);

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

					const normalizedName = `${name}`.replaceAll('\\', '/').replace(/^\/+/, '');
					const hasDirectories = normalizedName.includes('/');

					let resolved;
					if (hasDirectories) {
						resolved = safeResolveProjectPath(projectFolder, normalizedName).resolved;
					} else {
						const scriptId = path.basename(normalizedName, path.extname(normalizedName));
						const existingPath = scriptIdToExistingPath.get(scriptId);
						resolved = existingPath || path.resolve(objectsFolder, normalizedName);
						if (!isSubPath(objectsFolder, resolved)) {
							throw new Error(`Refusing to write zip entry outside objects folder: ${normalizedName}`);
						}
					}

					if (normalizedName.endsWith('/')) {
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

	if (requireStatusXml && !statusXmlText) {
		throw new Error('Custom objects zip is missing status.xml');
	}

	return { statusXmlText, extractedPaths };
}

module.exports = class NetSuiteCustomObjectsService {
	constructor(dependencies) {
		this._httpClient = (dependencies && dependencies.httpClient) || new HttpClient();
	}

	async listObjects(options) {
		assert(options);
		assert(options.systemDomain);
		assert(options.accessToken);

		const cookieJar = options.cookieJar || new CookieJar();
		const url = joinUrl(options.systemDomain, IDE_SERVLET_PATH);

		const types = Array.isArray(options.types) ? options.types : [];
		const scriptIdContains = options.scriptIdContains ? `${options.scriptIdContains}`.trim() : '';

			const multipart = buildMultipartBody({
				[MULTIPART_ACTION_FIELD]: ACTION_LIST_OBJECTS,
				...(types.length > 0 ? { [MULTIPART_TYPES_FIELD]: types } : {}),
				...(scriptIdContains ? { [MULTIPART_SCRIPTID_CONTAINS_FIELD]: scriptIdContains } : {}),
				...(options.packageRoot !== undefined && options.packageRoot !== null ? { [MULTIPART_PACKAGE_ROOT_FIELD]: `${options.packageRoot}` } : {}),
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
							`This usually means the OAuth2 token is missing required scopes for listing objects. ` +
							`Re-run account:setup:ci with --scope "rest_webservices restlets" (or set SUITECLOUD_SCOPES/NS_SCOPES) and try again.`
					);
				}
				const snippet = `${response.text || ''}`.slice(0, 500);
				throw new Error(`List objects request failed (status=${response.statusCode}): ${snippet}`);
			}

				const responseBody = response.body || Buffer.alloc(0);
				if (responseBody.length === 0 && attempt === 0 && response.headers && response.headers['set-cookie']) {
					continue;
				}
				if (responseBody.length === 0) {
					throw new Error('Empty response from FetchCustomObjectList endpoint.');
				}
				const loginMessage = extractLoginHtmlMessage(response.text);
				if (loginMessage) {
					throw new Error(
						`${loginMessage}\n\n` +
							`This usually means the OAuth2 token is missing required scopes for listing objects. ` +
							`Re-run account:setup:ci with --scope "rest_webservices restlets" (or set SUITECLOUD_SCOPES/NS_SCOPES) and try again.`
					);
				}

				const allObjects = await parseCustomObjectListXml(response.text);
				const filterAppId = options.appId === undefined ? undefined : options.appId === null ? null : `${options.appId}`.trim();
				const filtered = allObjects.filter((o) => {
					const appId = `${o.appId || ''}`.trim();
					if (filterAppId === undefined) {
						return true;
					}
					if (filterAppId === null) {
						return !appId;
					}
					return appId === filterAppId;
				});
				return filtered;
		}

		throw new Error('Empty response from FetchCustomObjectList endpoint.');
	}

	async importObjects(options) {
		assert(options);
		assert(options.systemDomain);
		assert(options.accessToken);
		assert(options.destinationFolder);
		assert(Array.isArray(options.objects));

		const cookieJar = options.cookieJar || new CookieJar();
		const url = joinUrl(options.systemDomain, IDE_SERVLET_PATH);

		const objectsXml = buildCustomObjectsXml(options.objects);
		const multipart = buildMultipartBody({
			[MULTIPART_ACTION_FIELD]: ACTION_IMPORT_OBJECTS,
			[MULTIPART_CUSTOM_OBJECTS_FIELD]: objectsXml,
			...(options.mode ? { [MULTIPART_MODE_FIELD]: `${options.mode}` } : {}),
			...(options.packageRoot !== undefined && options.packageRoot !== null ? { [MULTIPART_PACKAGE_ROOT_FIELD]: `${options.packageRoot}` } : {}),
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
							`This usually means the OAuth2 token is missing required scopes for object import. ` +
							`Re-run account:setup:ci with --scope "rest_webservices restlets" (or set SUITECLOUD_SCOPES/NS_SCOPES) and try again.`
					);
				}
				const snippet = `${response.text || ''}`.slice(0, 500);
				throw new Error(`Import objects request failed (status=${response.statusCode}): ${snippet}`);
			}

			const responseBody = response.body || Buffer.alloc(0);
			if (responseBody.length === 0 && attempt === 0 && response.headers && response.headers['set-cookie']) {
				continue;
			}
			if (responseBody.length === 0) {
				throw new Error('Empty response from FetchCustomObjectXml endpoint.');
			}

			const loginMessage = extractLoginHtmlMessage(response.text);
			if (loginMessage) {
				throw new Error(
					`${loginMessage}\n\n` +
						`This usually means the OAuth2 token is missing required scopes for object import. ` +
						`Re-run account:setup:ci with --scope "rest_webservices restlets" (or set SUITECLOUD_SCOPES/NS_SCOPES) and try again.`
				);
			}

			fs.mkdirSync(options.destinationFolder, { recursive: true });
			const { statusXmlText, extractedPaths } = await extractZipToDestination(responseBody, options.destinationFolder);
			const results = await parseStatusResultsXml(statusXmlText);
			return { results, extractedPaths };
		}

		throw new Error('Empty response from FetchCustomObjectXml endpoint.');
	}

	async updateObjects(options) {
		assert(options);
		assert(options.systemDomain);
		assert(options.accessToken);
		assert(options.projectFolder);
		assert(Array.isArray(options.objects));

		const cookieJar = options.cookieJar || new CookieJar();
		const url = joinUrl(options.systemDomain, IDE_SERVLET_PATH);
		const objectsXml = buildCustomObjectsXml(options.objects);
		const multipart = buildMultipartBody({
			[MULTIPART_ACTION_FIELD]: ACTION_IMPORT_OBJECTS,
			[MULTIPART_CUSTOM_OBJECTS_FIELD]: objectsXml,
			[MULTIPART_MODE_FIELD]: 'UPDATE',
			...(options.packageRoot !== undefined && options.packageRoot !== null ? { [MULTIPART_PACKAGE_ROOT_FIELD]: `${options.packageRoot}` } : {}),
		});

		const objectsFolder = options.objectsFolder || path.join(options.projectFolder, 'Objects');

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
							`This usually means the OAuth2 token is missing required scopes for object update. ` +
							`Re-run account:setup:ci with --scope "rest_webservices restlets" (or set SUITECLOUD_SCOPES/NS_SCOPES) and try again.`
					);
				}
				const snippet = `${response.text || ''}`.slice(0, 500);
				throw new Error(`Update objects request failed (status=${response.statusCode}): ${snippet}`);
			}

			const responseBody = response.body || Buffer.alloc(0);
			if (responseBody.length === 0 && attempt === 0 && response.headers && response.headers['set-cookie']) {
				continue;
			}
			if (responseBody.length === 0) {
				throw new Error('Empty response from FetchCustomObjectXml endpoint.');
			}

			const loginMessage = extractLoginHtmlMessage(response.text);
			if (loginMessage) {
				throw new Error(
					`${loginMessage}\n\n` +
						`This usually means the OAuth2 token is missing required scopes for object update. ` +
						`Re-run account:setup:ci with --scope "rest_webservices restlets" (or set SUITECLOUD_SCOPES/NS_SCOPES) and try again.`
				);
			}

			const { statusXmlText, extractedPaths } = await extractZipToProject(responseBody, {
				projectFolder: options.projectFolder,
				objectsFolder,
				requireStatusXml: true,
			});
			const results = await parseStatusResultsXml(statusXmlText);
			return { results, extractedPaths };
		}

		throw new Error('Empty response from FetchCustomObjectXml endpoint.');
	}

	async updateCustomRecordWithInstances(options) {
		assert(options);
		assert(options.systemDomain);
		assert(options.accessToken);
		assert(options.projectFolder);
		assert(options.scriptId);

		const cookieJar = options.cookieJar || new CookieJar();
		const url = joinUrl(options.systemDomain, CUSTOM_RECORD_WITH_INSTANCES_PATH);
		const bodyText = buildUrlEncodedFormBody({
			[CUSTOM_RECORD_WITH_INSTANCES_SCRIPT_ID_FIELD]: options.scriptId,
			...(options.appId ? { [CUSTOM_RECORD_WITH_INSTANCES_APP_ID_FIELD]: `${options.appId}` } : {}),
		});

		const objectsFolder = options.objectsFolder || path.join(options.projectFolder, 'Objects');

		for (let attempt = 0; attempt < 2; attempt++) {
			const response = await this._httpClient.request({
				url: url.toString(),
				method: 'POST',
				cookieJar,
				headers: {
					authorization: `Bearer ${options.accessToken}`,
					'user-agent': USER_AGENT,
					accept: '*/*',
					'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
				},
				body: Buffer.from(bodyText, 'utf8'),
			});

			if (response.statusCode < 200 || response.statusCode >= 300) {
				const loginMessage = extractLoginHtmlMessage(response.text);
				if (loginMessage) {
					throw new Error(
						`${loginMessage}\n\n` +
							`This usually means the OAuth2 token is missing required scopes for custom record update. ` +
							`Re-run account:setup:ci with --scope "rest_webservices restlets" (or set SUITECLOUD_SCOPES/NS_SCOPES) and try again.`
					);
				}
				const snippet = `${response.text || ''}`.slice(0, 500);
				throw new Error(`Custom record update request failed (status=${response.statusCode}): ${snippet}`);
			}

			const responseBody = response.body || Buffer.alloc(0);
			if (responseBody.length === 0 && attempt === 0 && response.headers && response.headers['set-cookie']) {
				continue;
			}
			if (responseBody.length === 0) {
				throw new Error('Empty response from fetchcustomrecordwithinstancesxml endpoint.');
			}

			const loginMessage = extractLoginHtmlMessage(response.text);
			if (loginMessage) {
				throw new Error(
					`${loginMessage}\n\n` +
						`This usually means the OAuth2 token is missing required scopes for custom record update. ` +
						`Re-run account:setup:ci with --scope "rest_webservices restlets" (or set SUITECLOUD_SCOPES/NS_SCOPES) and try again.`
				);
			}

			if (!isZipBuffer(responseBody)) {
				const snippet = `${response.text || ''}`.slice(0, 500);
				throw new Error(`Unexpected response from fetchcustomrecordwithinstancesxml endpoint (expected zip): ${snippet}`);
			}

			const { extractedPaths } = await extractZipToProject(responseBody, {
				projectFolder: options.projectFolder,
				objectsFolder,
				requireStatusXml: false,
			});

			return { extractedPaths };
		}

		throw new Error('Empty response from fetchcustomrecordwithinstancesxml endpoint.');
	}
};
