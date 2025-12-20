/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { ENV_VARS } = require('../../ApplicationConstants');
const { encrypt, decrypt } = require('../../utils/CryptoUtils');

const STORE_VERSION = 1;
const STORE_FOLDER = 'auth';
const STORE_FILE = 'auth-store.json';

function deriveKeyFromPasskey(passkey) {
	const normalized = `${passkey}`.trim();
	if (!normalized) {
		return null;
	}
	// CryptoUtils expects a 32-byte key string (AES-256 key length); derive from passkey deterministically.
	return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 32);
}

function getPasskey() {
	return process.env[ENV_VARS.SUITECLOUD_CI_PASSKEY] || process.env[ENV_VARS.SUITECLOUD_FALLBACK_PASSKEY] || null;
}

function nowIso() {
	return new Date().toISOString();
}

module.exports = class AuthStoreService {
	constructor(sdkHomePath) {
		assert(sdkHomePath);
		this._sdkHomePath = sdkHomePath;
		this._storePath = path.join(sdkHomePath, STORE_FOLDER, STORE_FILE);
	}

	getStorePath() {
		return this._storePath;
	}

	_readStore() {
		if (!fs.existsSync(this._storePath)) {
			return { version: STORE_VERSION, updatedAt: nowIso(), authIds: {} };
		}
		const raw = fs.readFileSync(this._storePath, 'utf8');
		const data = JSON.parse(raw);
		if (!data || typeof data !== 'object') {
			throw new Error(`Invalid auth store format at ${this._storePath}`);
		}
		if (!data.authIds || typeof data.authIds !== 'object') {
			data.authIds = {};
		}
		return data;
	}

	_writeStore(store) {
		fs.mkdirSync(path.dirname(this._storePath), { recursive: true });
		const data = {
			version: STORE_VERSION,
			updatedAt: nowIso(),
			authIds: store.authIds || {},
		};
		fs.writeFileSync(this._storePath, JSON.stringify(data, null, 2), 'utf8');
	}

	list() {
		const store = this._readStore();
		const authIds = {};
		for (const [authId, record] of Object.entries(store.authIds)) {
			authIds[authId] = this._stripSecrets(record);
		}
		return authIds;
	}

	get(authId) {
		assert(authId);
		const store = this._readStore();
		const record = store.authIds[authId];
		return record ? this._stripSecrets(record) : null;
	}

	getWithSecrets(authId) {
		assert(authId);
		const store = this._readStore();
		const record = store.authIds[authId];
		return record ? this._hydrateSecrets(record) : null;
	}

	upsert(authId, record) {
		assert(authId);
		assert(record);
		const store = this._readStore();
		store.authIds[authId] = this._persistSecrets(record);
		this._writeStore(store);
	}

	remove(authId) {
		assert(authId);
		const store = this._readStore();
		if (!store.authIds[authId]) {
			return false;
		}
		delete store.authIds[authId];
		this._writeStore(store);
		return true;
	}

	rename(fromAuthId, toAuthId) {
		assert(fromAuthId);
		assert(toAuthId);
		const store = this._readStore();
		if (!store.authIds[fromAuthId]) {
			throw new Error(`Authentication ID "${fromAuthId}" not found.`);
		}
		if (store.authIds[toAuthId]) {
			throw new Error(`Authentication ID "${toAuthId}" already exists.`);
		}
		store.authIds[toAuthId] = store.authIds[fromAuthId];
		delete store.authIds[fromAuthId];
		this._writeStore(store);
	}

	_stripSecrets(record) {
		if (!record || typeof record !== 'object') {
			return record;
		}
		const copy = { ...record };
		if (copy.token && copy.token.accessToken) {
			copy.token = { ...copy.token };
			delete copy.token.accessToken;
		}
		if (copy.token && copy.token.accessTokenEnc) {
			copy.token = { ...copy.token };
			delete copy.token.accessTokenEnc;
		}
		return copy;
	}

	_persistSecrets(record) {
		const passkey = getPasskey();
		const key = passkey ? deriveKeyFromPasskey(passkey) : null;

		const copy = { ...record };
		if (copy.token && copy.token.accessToken) {
			if (!key) {
				// No passkey configured: do not persist raw access tokens.
				copy.token = { ...copy.token };
				delete copy.token.accessToken;
			} else {
				copy.token = { ...copy.token };
				copy.token.accessTokenEnc = encrypt(copy.token.accessToken, key);
				delete copy.token.accessToken;
			}
		}
		return copy;
	}

	_hydrateSecrets(record) {
		const passkey = getPasskey();
		const key = passkey ? deriveKeyFromPasskey(passkey) : null;

		if (!record || typeof record !== 'object') {
			return record;
		}
		const copy = { ...record };
		if (copy.token && copy.token.accessTokenEnc) {
			if (!key) {
				throw new Error(
					`Credentials for authId require a passkey. Set ${ENV_VARS.SUITECLOUD_CI_PASSKEY} or ${ENV_VARS.SUITECLOUD_FALLBACK_PASSKEY}.`
				);
			}
			copy.token = { ...copy.token };
			copy.token.accessToken = decrypt(copy.token.accessTokenEnc, key);
		}
		return copy;
	}
};

