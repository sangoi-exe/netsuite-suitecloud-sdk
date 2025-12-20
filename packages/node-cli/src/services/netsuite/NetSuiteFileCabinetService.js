/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const assert = require('assert');

const SuiteQlService = require('./SuiteQlService');

function normalizeFolderPath(folderPath) {
	const raw = `${folderPath || ''}`.trim();
	if (!raw) {
		return '/';
	}
	return raw.startsWith('/') ? raw : `/${raw}`;
}

function joinPath(folderPath, fileName) {
	const base = normalizeFolderPath(folderPath).replace(/\/+$/, '');
	const name = `${fileName}`.replace(/^\/+/, '');
	return base ? `${base}/${name}` : `/${name}`;
}

function buildFolderPathCache(foldersById) {
	const cache = new Map();

	const compute = (id) => {
		if (cache.has(id)) {
			return cache.get(id);
		}
		const node = foldersById.get(id);
		if (!node) {
			return null;
		}

		const name = `${node.name || ''}`.trim();
		const parentId = node.parentId;

		let path;
		if (!parentId) {
			path = `/${name}`;
		} else {
			const parentPath = compute(parentId);
			path = parentPath ? `${parentPath}/${name}` : `/${name}`;
		}

		path = path.replace(/\/{2,}/g, '/');
		cache.set(id, path);
		return path;
	};

	return { compute };
}

module.exports = class NetSuiteFileCabinetService {
	constructor(dependencies) {
		this._suiteQlService = (dependencies && dependencies.suiteQlService) || new SuiteQlService();
	}

	async listFolders(options) {
		const folders = await this._getFoldersIndex(options);
		return Array.from(folders.pathToId.keys()).sort();
	}

	async listFiles(options) {
		assert(options);
		assert(options.folderPath);

		const folderPath = normalizeFolderPath(options.folderPath);
		const folders = await this._getFoldersIndex(options);
		const folderId = folders.pathToId.get(folderPath);
		if (!folderId) {
			throw new Error(`Folder not found in File Cabinet: ${folderPath}`);
		}

		// NOTE: SuiteQL schema is based on NetSuite REST Query Service. If this fails in the wild, we need to adjust field names.
		const query = `SELECT id, name FROM file WHERE folder = ${Number(folderId)}`;
		const fileItems = await this._suiteQlService.queryAll({
			restDomain: options.restDomain,
			accessToken: options.accessToken,
			query,
		});

		const files = [];
		for (const item of fileItems) {
			if (!item || typeof item !== 'object') {
				continue;
			}
			if (!item.name) {
				continue;
			}
			files.push(joinPath(folderPath, item.name));
		}

		return files.sort();
	}

	async _getFoldersIndex(options) {
		assert(options);
		assert(options.restDomain);
		assert(options.accessToken);

		// NOTE: SuiteQL schema is based on NetSuite REST Query Service. If this fails in the wild, we need to adjust field names.
		const folderItems = await this._suiteQlService.queryAll({
			restDomain: options.restDomain,
			accessToken: options.accessToken,
			query: 'SELECT id, name, parent FROM folder',
		});

		const foldersById = new Map();
		for (const item of folderItems) {
			if (!item || typeof item !== 'object') {
				continue;
			}
			if (!item.id) {
				continue;
			}
			foldersById.set(String(item.id), {
				id: String(item.id),
				name: item.name,
				parentId: item.parent ? String(item.parent) : null,
			});
		}

		const cache = buildFolderPathCache(foldersById);
		const pathToId = new Map();
		for (const [id] of foldersById.entries()) {
			const folderPath = cache.compute(id);
			if (folderPath) {
				pathToId.set(folderPath, id);
			}
		}

		return { foldersById, pathToId };
	}
};

