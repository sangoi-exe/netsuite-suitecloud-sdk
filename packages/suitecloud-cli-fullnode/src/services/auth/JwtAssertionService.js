/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const crypto = require('crypto');

function base64UrlEncode(buffer) {
	return Buffer.from(buffer)
		.toString('base64')
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
}

function signPs256(message, privateKeyPem) {
	const signature = crypto.sign('sha256', Buffer.from(message), {
		key: privateKeyPem,
		padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
		saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
	});
	return base64UrlEncode(signature);
}

module.exports = class JwtAssertionService {
	createClientCredentialsJwt(options) {
		const nowSeconds = options.nowSeconds || Math.floor(Date.now() / 1000);
		const expiresInSeconds = options.expiresInSeconds || 300;

		const header = {
			alg: 'PS256',
			typ: 'JWT',
			...(options.kid && { kid: options.kid }),
		};
		const payload = {
			aud: options.audience,
			iss: options.issuer,
			iat: nowSeconds,
			exp: nowSeconds + expiresInSeconds,
			...(options.scope && { scope: options.scope }),
		};

		const headerB64 = base64UrlEncode(JSON.stringify(header));
		const payloadB64 = base64UrlEncode(JSON.stringify(payload));
		const signingInput = `${headerB64}.${payloadB64}`;

		const signatureB64 = signPs256(signingInput, options.privateKeyPem);
		return `${signingInput}.${signatureB64}`;
	}
};
