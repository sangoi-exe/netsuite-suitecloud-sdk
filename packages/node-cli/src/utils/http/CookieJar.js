/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const assert = require('assert');
const { URL } = require('url');

function toUrl(value) {
	if (value instanceof URL) {
		return value;
	}
	return new URL(`${value}`);
}

function normalizeSetCookieHeader(value) {
	if (!value) {
		return [];
	}
	if (Array.isArray(value)) {
		return value.filter(Boolean).map((v) => `${v}`);
	}
	return [`${value}`];
}

function parseSetCookie(headerValue) {
	const first = `${headerValue}`.split(';', 1)[0].trim();
	if (!first || !first.includes('=')) {
		return null;
	}
	const idx = first.indexOf('=');
	const name = first.slice(0, idx).trim();
	const value = first.slice(idx + 1).trim();
	if (!name) {
		return null;
	}
	return { name, value };
}

module.exports = class CookieJar {
	constructor() {
		this._cookiesByHost = new Map(); // host -> Map(name -> value)
	}

	getCookieHeader(url) {
		const urlObject = toUrl(url);
		const host = urlObject.host;
		const map = this._cookiesByHost.get(host);
		if (!map || map.size === 0) {
			return null;
		}
		return Array.from(map.entries())
			.map(([name, value]) => `${name}=${value}`)
			.join('; ');
	}

	storeFromResponse(url, setCookieHeader) {
		assert(url);
		const urlObject = toUrl(url);
		const host = urlObject.host;
		const headers = normalizeSetCookieHeader(setCookieHeader);
		if (headers.length === 0) {
			return;
		}

		if (!this._cookiesByHost.has(host)) {
			this._cookiesByHost.set(host, new Map());
		}
		const map = this._cookiesByHost.get(host);

		for (const headerValue of headers) {
			const parsed = parseSetCookie(headerValue);
			if (!parsed) {
				continue;
			}
			map.set(parsed.name, parsed.value);
		}
	}
};

