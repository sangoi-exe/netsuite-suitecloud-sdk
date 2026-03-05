/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

'use strict';

const { sanitizeHeaders, sanitizeUrl } = require('../../src/services/http/HttpTraceSanitizer');

describe('HttpTraceSanitizer', () => {
	test('sanitizeUrl does not mutate URL instances', () => {
		const url = new URL(
			'https://1234567-sb1.restlets.api.netsuite.com/rest/datacenterurls?account=1234567-sb1&token=abc&foo=bar'
		);
		const original = url.toString();
		const out = sanitizeUrl(url);
		expect(out).not.toBe(original);
		expect(url.toString()).toBe(original);
	});

	test('sanitizeUrl redacts account ids, emails, and sensitive query params', () => {
		const input =
			'https://1234567-sb1.restlets.api.netsuite.com/rest/datacenterurls?account=1234567-sb1&token=abc&email=test@example.com&foo=bar';
		const out = sanitizeUrl(input);

		expect(out).not.toContain('1234567-sb1');
		expect(out).not.toContain('test@example.com');
		expect(out).not.toContain('test%40example.com');
		expect(out).not.toContain('token=abc');
		expect(out).toContain('foo=bar');
		expect(out).toContain('account=redacted');
		expect(out).toContain('token=redacted');
		expect(out).toContain('email=redacted');
		expect(out).toContain('redacted.restlets.api.netsuite.com');
	});

	test('sanitizeHeaders redacts authorization/cookies and sanitizes host', () => {
		const headers = {
			Authorization: 'Bearer abc',
			cookie: 'bm_sz=abc; JSESSIONID=def',
			'set-cookie': 'bm_sz=abc; Path=/;',
			host: '1234567-sb1.restlets.api.netsuite.com',
			accept: 'application/json',
		};

		const out = sanitizeHeaders(headers);
		expect(out.Authorization).toBe('<redacted>');
		expect(out.cookie).toBe('<redacted>');
		expect(out['set-cookie']).toBe('<redacted>');
		expect(out.host).toBe('redacted.restlets.api.netsuite.com');
		expect(out.accept).toBe('application/json');
	});
});
