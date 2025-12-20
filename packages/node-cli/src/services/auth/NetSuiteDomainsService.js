/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const assert = require('assert');
const { URL } = require('url');

const HttpClient = require('../http/HttpClient');
const { DOMAIN } = require('../../ApplicationConstants');

function normalizeBaseUrl(domainOrUrl) {
	if (!domainOrUrl) {
		return `https://${DOMAIN.PRODUCTION.GENERIC_NETSUITE_DOMAIN}`;
	}
	const value = `${domainOrUrl}`.trim();
	if (value.startsWith('http://') || value.startsWith('https://')) {
		return value.replace(/\/+$/, '');
	}
	return `https://${value.replace(/\/+$/, '')}`;
}

function normalizeDomainUrl(domainValue) {
	if (!domainValue) {
		return null;
	}
	const value = `${domainValue}`.trim();
	if (value.startsWith('http://') || value.startsWith('https://')) {
		return value.replace(/\/+$/, '');
	}
	return `https://${value.replace(/\/+$/, '')}`;
}

function asHostname(domainOrUrl) {
	if (!domainOrUrl) {
		return null;
	}
	try {
		return new URL(normalizeDomainUrl(domainOrUrl)).hostname;
	} catch (e) {
		return `${domainOrUrl}`;
	}
}

function normalizeAccountIdForDatacenterUrls(accountId) {
	const raw = `${accountId || ''}`.trim();
	const match = raw.match(/^(.+)-(sb|rp)(\d+)$/i);
	if (!match) {
		return raw;
	}
	const prefix = match[1];
	const env = match[2].toUpperCase();
	const num = match[3];
	return `${prefix}_${env}${num}`;
}

module.exports = class NetSuiteDomainsService {
	constructor(dependencies) {
		this._httpClient = (dependencies && dependencies.httpClient) || new HttpClient();
	}

	async resolveDomains(options) {
		assert(options);
		assert(options.accountId);

		const baseUrl = normalizeBaseUrl(options.domain);
		const accountId = normalizeAccountIdForDatacenterUrls(options.accountId);
		const url = `${baseUrl}/rest/datacenterurls?account=${encodeURIComponent(accountId)}`;

		const response = await this._httpClient.requestJson({ url, method: 'GET' });
		if (response.statusCode < 200 || response.statusCode >= 300) {
			throw new Error(`Failed to resolve datacenter domains (status=${response.statusCode}): ${response.text}`);
		}

		const data = response.data || {};

		// Seen in JAR strings: restDomain/systemDomain/webservicesDomain
		const restDomain = data.restDomain || (data.urls && data.urls.restDomain) || null;
		const systemDomain = data.systemDomain || (data.urls && data.urls.systemDomain) || null;
		const webservicesDomain = data.webservicesDomain || (data.urls && data.urls.webservicesDomain) || null;

		if (!restDomain || !systemDomain) {
			throw new Error(`Unexpected datacenterurls response: ${JSON.stringify(data)}`);
		}

		return {
			restDomain: normalizeDomainUrl(restDomain),
			systemDomain: normalizeDomainUrl(systemDomain),
			webservicesDomain: normalizeDomainUrl(webservicesDomain),
			hostInfo: {
				hostName: asHostname(systemDomain),
			},
		};
	}
};
