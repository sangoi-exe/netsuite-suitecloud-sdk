/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const HttpClient = require('../http/HttpClient');
const CookieJar = require('../../utils/http/CookieJar');

const USER_AGENT = 'SuiteCloud SDK';
const ACTION_HEADER = 'Sdf-Action';

const PARAM_ACCOUNT_SPECIFIC_VALUES = 'accountspecificvalues';
const PARAM_APPLY_INSTALL_PREFS = 'applyinstallprefs';
const PARAM_DEPLOY_TOKEN = 'token';

const BOOL_TRUE = 'T';
const BOOL_FALSE = 'F';

const MULTIPART_FILE_FIELD = 'mediafile';
const ZIP_CONTENT_TYPE = 'application/x-zip-compressed';

const PATHS = {
	IDE_PREVIEW_HANDLER: '/app/suiteapp/devframework/idepreviewhandler.nl',
	IDE_VALIDATION_HANDLER: '/app/suiteapp/devframework/idevalidationhandler.nl',
	IDE_INSTALL_HANDLER: '/app/suiteapp/devframework/ideinstallhandler.nl',
};

const ACTIONS = {
	PREVIEW: 'preview',
	VALIDATE: 'validate',
	DEPLOY: 'deploy',
};

function joinUrl(base, pathname) {
	const url = new URL(`${base}`);
	url.pathname = pathname;
	return url;
}

function toTf(value) {
	return value ? BOOL_TRUE : BOOL_FALSE;
}

function normalizeAccountSpecificValues(value) {
	const normalized = `${value || ''}`.trim();
	return normalized || 'ERROR';
}

function buildMultipartBody({ zipPath, fields }) {
	const boundary = `----suitecloud-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
	const fileName = path.basename(zipPath);
	const fileContent = fs.readFileSync(zipPath);

	const parts = [];
	const addTextField = (name, value) => {
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

	for (const [name, value] of Object.entries(fields || {})) {
		addTextField(name, value);
	}

	parts.push(
		Buffer.from(
			`--${boundary}\r\n` +
				`Content-Disposition: form-data; name="${MULTIPART_FILE_FIELD}"; filename="${fileName}"\r\n` +
				`Content-Type: ${ZIP_CONTENT_TYPE}\r\n` +
				`\r\n`,
			'utf8'
		)
	);
	parts.push(fileContent);
	parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));

	return {
		contentType: `multipart/form-data; boundary=${boundary}`,
		body: Buffer.concat(parts),
	};
}

function detectTextEncoding(contentType) {
	const normalized = `${contentType || ''}`.toLowerCase();
	if (normalized.includes('charset=iso-8859-1') || normalized.includes('charset=iso_8859_1')) {
		return 'latin1';
	}
	return 'utf8';
}

function parseResponseToLines(responseBody, contentType) {
	const encoding = detectTextEncoding(contentType);
	const raw = Buffer.isBuffer(responseBody) ? responseBody.toString(encoding) : `${responseBody || ''}`;
	const text = raw.replaceAll('{linebreak}', '\n').trim();

	if (!text) {
		throw new Error('Empty response from server.');
	}
	if (text.includes('<!DOCTYPE html>')) {
		const snippet = text.slice(0, 200);
		throw new Error(`Unexpected HTML response from server: ${snippet}`);
	}
	if (text.includes('*** ERROR ***')) {
		const lines = text
			.split(/\r?\n/)
			.map((l) => l.trim())
			.filter(Boolean)
			.filter((l) => l !== '*** ERROR ***');
		throw new Error(lines.length > 0 ? lines.join('\n') : 'Server returned an error.');
	}

	return text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
}

function extractDeployTokenFromLines(lines) {
	for (const line of lines || []) {
		const trimmed = `${line}`.trim();
		if (trimmed.startsWith('token=')) {
			const token = trimmed.slice('token='.length).trim();
			return token || null;
		}
	}
	return null;
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
	// This matches the Redwood error template used by NetSuite.
	const match = text.match(/<div class=\"uir-error-page-message\">([^<]+)<\/div>/i);
	if (match && match[1]) {
		return match[1].replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&#39;', "'").trim();
	}
	return null;
}

module.exports = class NetSuiteSdfDevFrameworkService {
	constructor(dependencies) {
		this._httpClient = (dependencies && dependencies.httpClient) || new HttpClient();
	}

	async preview(options) {
		return this._uploadAndParse({
			...options,
			action: ACTIONS.PREVIEW,
			pathname: PATHS.IDE_PREVIEW_HANDLER,
		});
	}

	async validateServer(options) {
		return this._uploadAndParse({
			...options,
			action: ACTIONS.VALIDATE,
			pathname: PATHS.IDE_VALIDATION_HANDLER,
		});
	}

	async deploy(options) {
		const lines = await this._uploadAndParse({
			...options,
			action: ACTIONS.DEPLOY,
			pathname: PATHS.IDE_INSTALL_HANDLER,
		});

		const deployToken = extractDeployTokenFromLines(lines);
		if (!deployToken) {
			return lines;
		}

		return this._uploadAndParse({
			...options,
			action: ACTIONS.DEPLOY,
			pathname: PATHS.IDE_INSTALL_HANDLER,
			query: { [PARAM_DEPLOY_TOKEN]: deployToken },
		});
	}

	async _uploadAndParse(options) {
		assert(options);
		assert(options.systemDomain);
		assert(options.accessToken);
		assert(options.zipPath);
		assert(options.pathname);
		assert(options.action);

		const accountSpecificValues = normalizeAccountSpecificValues(options.accountSpecificValues);
		const applyInstallPrefs = toTf(Boolean(options.applyInstallPrefs));

		const cookieJar = options.cookieJar || new CookieJar();
		const url = joinUrl(options.systemDomain, options.pathname);
		for (const [key, value] of Object.entries(options.query || {})) {
			url.searchParams.set(key, value);
		}

		const multipart = buildMultipartBody({
			zipPath: options.zipPath,
			fields: {
				[PARAM_ACCOUNT_SPECIFIC_VALUES]: accountSpecificValues,
				[PARAM_APPLY_INSTALL_PREFS]: applyInstallPrefs,
			},
		});

		for (let attempt = 0; attempt < 2; attempt++) {
			const response = await this._httpClient.request({
				url: url.toString(),
				method: 'POST',
				cookieJar,
				headers: {
					authorization: `Bearer ${options.accessToken}`,
					'user-agent': USER_AGENT,
					[ACTION_HEADER]: options.action,
					'content-type': multipart.contentType,
					accept: 'text/plain',
				},
				body: multipart.body,
			});

			if (response.statusCode < 200 || response.statusCode >= 300) {
				const loginMessage = extractLoginHtmlMessage(response.text);
				if (loginMessage) {
					throw new Error(
						`${loginMessage}\n\n` +
							`This usually means the OAuth2 token is missing required scopes for SDF handlers. ` +
							`Re-run account:setup:ci with --scope "rest_webservices restlets" (or set SUITECLOUD_SCOPES/NS_SCOPES) and try again.`
					);
				}
				const snippet = `${response.text || ''}`.slice(0, 500);
				throw new Error(`SDF handler request failed (status=${response.statusCode}): ${snippet}`);
			}

			if ((response.body || Buffer.alloc(0)).length === 0 && attempt === 0 && response.headers && response.headers['set-cookie']) {
				continue;
			}

			return parseResponseToLines(response.body, response.headers && response.headers['content-type']);
		}

		throw new Error('Empty response from server.');
	}
};
