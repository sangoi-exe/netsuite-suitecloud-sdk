/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const { URL } = require('url');

const ProxyAgent = require('../../utils/http/ProxyAgent');
const { sanitizeHeaders, sanitizeUrl } = require('./HttpTraceSanitizer');
const { EVENT, HEADER, PROTOCOL } = require('../../utils/http/HttpConstants');

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_REDIRECTS = 5;

function isTruthy(value) {
	if (value === undefined || value === null) {
		return false;
	}
	const normalized = `${value}`.trim().toLowerCase();
	return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function toUrl(value) {
	if (value instanceof URL) {
		return value;
	}
	return new URL(`${value}`);
}

function readResponseBody(response) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		response.on(EVENT.DATA, (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
		response.on(EVENT.END, () => resolve(Buffer.concat(chunks)));
		response.on(EVENT.ERROR, reject);
	});
}

function normalizeProxy() {
	return process.env.SUITECLOUD_PROXY || process.env.npm_config_https_proxy || process.env.npm_config_proxy || null;
}

function hasHeader(headers, name) {
	const target = `${name}`.toLowerCase();
	return Object.keys(headers || {}).some((k) => `${k}`.toLowerCase() === target);
}

function buildAgentIfNeeded(urlObject, proxy) {
	if (!proxy) {
		return null;
	}
	const isHttps = urlObject.protocol === PROTOCOL.HTTPS;
	// The ProxyAgent supports tunneling when target is https.
	return new ProxyAgent(proxy, { tunnel: isHttps, timeout: 15000 });
}

function isRedirect(statusCode) {
	return [301, 302, 303, 307, 308].includes(statusCode);
}

function normalizeTraceEnabled(requestOptions) {
	if (requestOptions && requestOptions.trace) {
		return true;
	}
	return isTruthy(process.env.SUITECLOUD_HTTP_TRACE) || isTruthy(process.env.npm_config_suitecloud_http_trace);
}

function normalizeTraceBodyEnabled() {
	return isTruthy(process.env.SUITECLOUD_HTTP_TRACE_BODY) || isTruthy(process.env.npm_config_suitecloud_http_trace_body);
}

function normalizeTraceFile() {
	return process.env.SUITECLOUD_HTTP_TRACE_FILE || process.env.npm_config_suitecloud_http_trace_file || null;
}

function maybeWriteTrace(traceEntry) {
	const traceFile = normalizeTraceFile();
	const line = `${JSON.stringify(traceEntry)}\n`;

	if (traceFile) {
		try {
			fs.appendFileSync(traceFile, line, 'utf8');
			return;
		} catch (e) {
			// Fall back to stderr if file write fails.
		}
	}
	process.stderr.write(line);
}

module.exports = class HttpClient {
	constructor(options) {
		this._timeoutMs = (options && options.timeoutMs) || DEFAULT_TIMEOUT_MS;
		this._maxRedirects = (options && options.maxRedirects) || DEFAULT_MAX_REDIRECTS;
	}

	async request(requestOptions) {
		const urlObject = toUrl(requestOptions.url);
		const method = (requestOptions.method || 'GET').toUpperCase();
		const headers = { ...(requestOptions.headers || {}) };
		const timeoutMs = requestOptions.timeoutMs || this._timeoutMs;
		const proxy = requestOptions.proxy === undefined ? normalizeProxy() : requestOptions.proxy;
		const cookieJar = requestOptions.cookieJar || null;
		const traceEnabled = normalizeTraceEnabled(requestOptions);
		const traceBodyEnabled = normalizeTraceBodyEnabled();
		const traceId = `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

		const body = requestOptions.body === undefined || requestOptions.body === null ? null : requestOptions.body;
		if (body !== null && !headers['content-length']) {
			const bodyLength = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(`${body}`);
			headers['content-length'] = `${bodyLength}`;
		}

		if (cookieJar && !hasHeader(headers, 'cookie')) {
			const cookieHeader = cookieJar.getCookieHeader(urlObject);
			if (cookieHeader) {
				headers.cookie = cookieHeader;
			}
		}

		if (traceEnabled) {
			maybeWriteTrace({
				traceId,
				phase: 'request',
				method,
				url: sanitizeUrl(urlObject),
				headers: sanitizeHeaders(headers),
				bodyLength: body === null ? 0 : Buffer.isBuffer(body) ? body.length : Buffer.byteLength(`${body}`),
			});
			if (traceBodyEnabled && typeof body === 'string') {
				maybeWriteTrace({
					traceId,
					phase: 'request-body',
					bodySnippet: `${body}`.slice(0, 500),
				});
			}
		}

		const maxRedirects = requestOptions.maxRedirects === undefined ? this._maxRedirects : requestOptions.maxRedirects;
		const redirectCount = requestOptions._redirectCount || 0;
		if (redirectCount > maxRedirects) {
			throw new Error(`Too many redirects while requesting ${urlObject.toString()}`);
		}

		const httpx = urlObject.protocol === PROTOCOL.HTTP ? http : https;
		const agent = buildAgentIfNeeded(urlObject, proxy);

		const response = await new Promise((resolve, reject) => {
			const req = httpx.request(
				urlObject,
				{
					method,
					headers,
					...(agent && { agent }),
				},
				(res) => resolve(res)
			);

			req.once(EVENT.TIMEOUT, () => {
				req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
			});
			req.once(EVENT.ERROR, reject);
			req.setTimeout(timeoutMs);

			if (body !== null) {
				req.write(body);
			}
			req.end();
		});

		const statusCode = response.statusCode || 0;
		const responseHeaders = response.headers || {};

		if (cookieJar && responseHeaders['set-cookie']) {
			cookieJar.storeFromResponse(urlObject, responseHeaders['set-cookie']);
		}

		if (isRedirect(statusCode) && responseHeaders.location) {
			const nextUrl = new URL(responseHeaders.location, urlObject);
			response.resume();
			return this.request({
				...requestOptions,
				url: nextUrl.toString(),
				_redirectCount: redirectCount + 1,
			});
		}

		const responseBody = await readResponseBody(response);
		const contentType = responseHeaders[HEADER.CONTENT_TYPE] ? `${responseHeaders[HEADER.CONTENT_TYPE]}` : '';

		if (traceEnabled) {
			maybeWriteTrace({
				traceId,
				phase: 'response',
				url: sanitizeUrl(urlObject),
				statusCode,
				headers: sanitizeHeaders(responseHeaders),
				bodyLength: responseBody ? responseBody.length : 0,
			});
			if (traceBodyEnabled && responseBody && responseBody.length > 0 && responseBody.length <= 1000) {
				maybeWriteTrace({
					traceId,
					phase: 'response-body',
					contentType,
					bodySnippet: responseBody.toString('utf8').slice(0, 500),
				});
			}
		}

		return {
			statusCode,
			headers: responseHeaders,
			body: responseBody,
			text: responseBody.toString('utf8'),
			json: () => {
				if (!responseBody || responseBody.length === 0) {
					return null;
				}
				try {
					return JSON.parse(responseBody.toString('utf8'));
				} catch (error) {
					const snippet = responseBody.toString('utf8').slice(0, 500);
					throw new Error(`Failed to parse JSON response (content-type=${contentType}): ${snippet}`);
				}
			},
		};
	}

	async requestJson(requestOptions) {
		const response = await this.request({
			...requestOptions,
			headers: {
				accept: 'application/json',
				...(requestOptions.headers || {}),
			},
		});
		return {
			...response,
			data: response.json(),
		};
	}

	async requestForm(requestOptions) {
		const formBody = new URLSearchParams(requestOptions.form || {}).toString();
		return this.requestJson({
			...requestOptions,
			method: requestOptions.method || 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				accept: 'application/json',
				...(requestOptions.headers || {}),
			},
			body: formBody,
		});
	}
};
