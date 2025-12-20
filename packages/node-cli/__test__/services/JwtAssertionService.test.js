/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

'use strict';

const crypto = require('crypto');

const JwtAssertionService = require('../../src/services/auth/JwtAssertionService');

function base64UrlDecode(input) {
	const normalized = input.replaceAll('-', '+').replaceAll('_', '/');
	const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
	return Buffer.from(normalized + pad, 'base64');
}

describe('JwtAssertionService', () => {
	test('creates a PS256 client_credentials JWT with expected claims', () => {
		const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
		const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
		const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });

		const jwtService = new JwtAssertionService();
		const jwt = jwtService.createClientCredentialsJwt({
			audience: 'https://example.invalid/token',
			issuer: 'client-id',
			kid: 'kid-123',
			privateKeyPem,
			nowSeconds: 1700000000,
			expiresInSeconds: 300,
			scope: 'rest_webservices',
		});

		const [headerB64, payloadB64, signatureB64] = jwt.split('.');
		expect(headerB64).toBeTruthy();
		expect(payloadB64).toBeTruthy();
		expect(signatureB64).toBeTruthy();

		const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
		const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));

		expect(header).toEqual({ alg: 'PS256', typ: 'JWT', kid: 'kid-123' });
		expect(payload.iss).toBe('client-id');
		expect(payload.aud).toBe('https://example.invalid/token');
		expect(payload.iat).toBe(1700000000);
		expect(payload.exp).toBe(1700000300);
		expect(payload.scope).toBe('rest_webservices');
		expect(payload.sub).toBeUndefined();

		const signingInput = `${headerB64}.${payloadB64}`;
		const signature = base64UrlDecode(signatureB64);
		const ok = crypto.verify(
			'sha256',
			Buffer.from(signingInput),
			{
				key: publicKeyPem,
				padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
				saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
			},
			signature
		);
		expect(ok).toBe(true);
	});
});
