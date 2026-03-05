/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const assert = require('assert');

const HttpClient = require('../http/HttpClient');

const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_MAX_PAGES = 50;

function joinUrl(base, path) {
	const normalizedBase = `${base}`.replace(/\/+$/, '');
	const normalizedPath = `${path}`.startsWith('/') ? `${path}` : `/${path}`;
	return `${normalizedBase}${normalizedPath}`;
}

module.exports = class SuiteQlService {
	constructor(dependencies) {
		this._httpClient = (dependencies && dependencies.httpClient) || new HttpClient();
	}

	async queryAll(options) {
		assert(options);
		assert(options.restDomain);
		assert(options.accessToken);
		assert(options.query);

		const pageSize = options.pageSize || DEFAULT_PAGE_SIZE;
		const maxPages = options.maxPages || DEFAULT_MAX_PAGES;

		const items = [];
		let offset = 0;
		for (let page = 0; page < maxPages; page++) {
			const url = joinUrl(
				options.restDomain,
				`/services/rest/query/v1/suiteql?limit=${encodeURIComponent(pageSize)}&offset=${encodeURIComponent(offset)}`
			);

			const response = await this._httpClient.requestJson({
				url,
				method: 'POST',
				headers: {
					authorization: `Bearer ${options.accessToken}`,
					'content-type': 'application/json',
					accept: 'application/json',
					prefer: 'transient',
				},
				body: JSON.stringify({ q: options.query }),
			});

			if (response.statusCode < 200 || response.statusCode >= 300) {
				throw new Error(`SuiteQL request failed (status=${response.statusCode}): ${response.text}`);
			}

			const data = response.data || {};
			const pageItems = Array.isArray(data.items) ? data.items : [];
			items.push(...pageItems);

			const hasMore = Boolean(data.hasMore);
			if (!hasMore || pageItems.length === 0) {
				break;
			}

			offset += pageItems.length;
		}

		return items;
	}
};

