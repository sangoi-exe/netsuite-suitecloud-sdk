/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const AuthStoreService = require('../../src/services/auth/AuthStoreService');
const { ENV_VARS } = require('../../src/ApplicationConstants');

function mkTempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'suitecloud-auth-store-'));
}

describe('AuthStoreService', () => {
	const originalEnv = { ...process.env };

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	test('encrypts and hydrates token when passkey is set', () => {
		process.env[ENV_VARS.SUITECLOUD_CI_PASSKEY] = 'test-passkey';

		const tmp = mkTempDir();
		const store = new AuthStoreService(tmp);

		store.upsert('auth1', {
			type: 'CLIENT_CREDENTIALS',
			accountInfo: { companyName: 'ACME', companyId: '123', roleName: 'Role' },
			hostInfo: { hostName: 'system.example.com' },
			token: { accessToken: 'secret-token', expiresAt: '2099-01-01T00:00:00.000Z' },
		});

		const raw = JSON.parse(fs.readFileSync(store.getStorePath(), 'utf8'));
		expect(raw.authIds.auth1.token.accessTokenEnc).toBeTruthy();
		expect(raw.authIds.auth1.token.accessToken).toBeUndefined();

		const publicRecord = store.get('auth1');
		expect(publicRecord.token.accessTokenEnc).toBeUndefined();
		expect(publicRecord.token.accessToken).toBeUndefined();
		expect(publicRecord.token.expiresAt).toBe('2099-01-01T00:00:00.000Z');

		const hydrated = store.getWithSecrets('auth1');
		expect(hydrated.token.accessToken).toBe('secret-token');
	});

	test('rename and remove operate on auth IDs', () => {
		process.env[ENV_VARS.SUITECLOUD_CI_PASSKEY] = 'test-passkey';

		const tmp = mkTempDir();
		const store = new AuthStoreService(tmp);

		store.upsert('auth1', { type: 'CLIENT_CREDENTIALS', token: { accessToken: 't', expiresAt: null } });
		store.rename('auth1', 'auth2');

		expect(store.get('auth1')).toBeNull();
		expect(store.get('auth2')).not.toBeNull();

		const removed = store.remove('auth2');
		expect(removed).toBe(true);
		expect(store.get('auth2')).toBeNull();
	});
});

