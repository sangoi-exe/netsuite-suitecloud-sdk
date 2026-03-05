/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const { URL } = require('url');

const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_TEST_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
// NetSuite account ids are commonly numeric and often appear as `1234567-sb1` or `1234567_SB1`.
const ACCOUNT_ID_LIKE_REGEX = /\b\d{6,}(?:[-_](?:sb|rp)\d+)?\b/gi;
const ACCOUNT_ID_LIKE_TEST_REGEX = /\b\d{6,}(?:[-_](?:sb|rp)\d+)?\b/i;

const URL_REDACTION_PLACEHOLDER = 'redacted';
const HEADER_REDACTION_PLACEHOLDER = '<redacted>';

function toUrl(value) {
	if (value instanceof URL) {
		// Never mutate the original URL object (the caller may be using it for a real request).
		return new URL(value.toString());
	}
	return new URL(`${value}`);
}

function sanitizeAccountLike(value, placeholder) {
	return `${value}`.replace(ACCOUNT_ID_LIKE_REGEX, placeholder || URL_REDACTION_PLACEHOLDER);
}

function sanitizeEmailLike(value, placeholder) {
	return `${value}`.replace(EMAIL_REGEX, placeholder || URL_REDACTION_PLACEHOLDER);
}

function shouldRedactQueryParam(key) {
	const name = `${key}`.trim().toLowerCase();
	if (!name) return false;
	if (/(token|pass|secret|key|authorization)/i.test(name)) return true;
	return name === 'account' || name === 'company' || name === 'companyid' || name === 'c';
}

function sanitizeUrl(urlValue) {
	try {
		const urlObject = toUrl(urlValue);

		for (const key of Array.from(urlObject.searchParams.keys())) {
			const value = urlObject.searchParams.get(key);
			if (shouldRedactQueryParam(key)) {
				urlObject.searchParams.set(key, URL_REDACTION_PLACEHOLDER);
				continue;
			}
			if (value && EMAIL_TEST_REGEX.test(value)) {
				urlObject.searchParams.set(key, URL_REDACTION_PLACEHOLDER);
				continue;
			}
			if (value && ACCOUNT_ID_LIKE_TEST_REGEX.test(value)) {
				urlObject.searchParams.set(key, URL_REDACTION_PLACEHOLDER);
			}
		}

		urlObject.hostname = sanitizeAccountLike(urlObject.hostname, URL_REDACTION_PLACEHOLDER);
		urlObject.pathname = sanitizeAccountLike(urlObject.pathname, URL_REDACTION_PLACEHOLDER);

		const serialized = urlObject.toString();
		// Extra pass for safety in case some pieces appear outside query params.
		return sanitizeEmailLike(sanitizeAccountLike(serialized, URL_REDACTION_PLACEHOLDER), URL_REDACTION_PLACEHOLDER);
	} catch (e) {
		return sanitizeEmailLike(sanitizeAccountLike(urlValue, URL_REDACTION_PLACEHOLDER), URL_REDACTION_PLACEHOLDER);
	}
}

function sanitizeHeaders(headers) {
	const out = {};
	for (const [key, rawValue] of Object.entries(headers || {})) {
		const name = `${key}`.toLowerCase();

		if (name === 'authorization' || name === 'cookie' || name === 'set-cookie') {
			out[key] = HEADER_REDACTION_PLACEHOLDER;
			continue;
		}

		if (name === 'host') {
			out[key] = sanitizeAccountLike(rawValue, URL_REDACTION_PLACEHOLDER);
			continue;
		}

		if (typeof rawValue === 'string' && (rawValue.startsWith('http://') || rawValue.startsWith('https://'))) {
			out[key] = sanitizeUrl(rawValue);
			continue;
		}

		out[key] = rawValue;
	}
	return out;
}

module.exports = { sanitizeUrl, sanitizeHeaders };
