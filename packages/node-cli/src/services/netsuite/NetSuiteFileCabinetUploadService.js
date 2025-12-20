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

const FILE_CABINET_UPLOAD_PATH = '/app/suiteapp/devframework/fileupload/filecabinetupload.nl';
const FILE_MULTIPART_KEY = 'file';
const PARENT_FOLDER_QUERY_KEY = 'parentFolder';

function joinUrl(base, pathname) {
	const baseUrl = new URL(`${base}`);
	baseUrl.pathname = pathname;
	return baseUrl;
}

function buildMultipartBody({ fieldName, filePath, contentType }) {
	const boundary = `----suitecloud-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
	const fileName = path.basename(filePath);
	const fileContent = fs.readFileSync(filePath);

	const preamble =
		`--${boundary}\r\n` +
		`Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
		`Content-Type: ${contentType || 'application/octet-stream'}\r\n` +
		`\r\n`;
	const epilogue = `\r\n--${boundary}--\r\n`;

	return {
		contentType: `multipart/form-data; boundary=${boundary}`,
		body: Buffer.concat([Buffer.from(preamble, 'utf8'), fileContent, Buffer.from(epilogue, 'utf8')]),
	};
}

module.exports = class NetSuiteFileCabinetUploadService {
	constructor(dependencies) {
		this._httpClient = (dependencies && dependencies.httpClient) || new HttpClient();
	}

	async uploadFile(options) {
		assert(options);
		assert(options.systemDomain);
		assert(options.accessToken);
		assert(options.parentFolderPath);
		assert(options.filePath);

		const url = joinUrl(options.systemDomain, FILE_CABINET_UPLOAD_PATH);
		url.searchParams.set(PARENT_FOLDER_QUERY_KEY, options.parentFolderPath);

		const multipart = buildMultipartBody({
			fieldName: FILE_MULTIPART_KEY,
			filePath: options.filePath,
			contentType: options.fileContentType,
		});

		const response = await this._httpClient.requestJson({
			url: url.toString(),
			method: 'POST',
			headers: {
				authorization: `Bearer ${options.accessToken}`,
				'content-type': multipart.contentType,
				accept: 'application/json',
			},
			body: multipart.body,
		});

		if (response.statusCode < 200 || response.statusCode >= 300) {
			throw new Error(`File upload failed (status=${response.statusCode}): ${response.text}`);
		}

		return response.data;
	}
};

