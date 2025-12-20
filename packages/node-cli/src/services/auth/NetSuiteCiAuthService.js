/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const HttpClient = require('../http/HttpClient');
const JwtAssertionService = require('./JwtAssertionService');
const NetSuiteDomainsService = require('./NetSuiteDomainsService');

const DEFAULT_SCOPE = 'rest_webservices';

function toAbsolutePath(value) {
	if (!value) {
		return value;
	}
	const trimmed = `${value}`.trim();
	if (!trimmed) {
		return trimmed;
	}
	return path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
}

function mapTokenInfoToAccountInfo(accountId, tokenInfo) {
	const companyName =
		(tokenInfo && (tokenInfo.companyName || tokenInfo.company || tokenInfo.companyname || tokenInfo.accountName)) || accountId;
	const companyId = (tokenInfo && (tokenInfo.companyId || tokenInfo.companyid || tokenInfo.account || tokenInfo.accountId)) || accountId;
	const roleName = (tokenInfo && (tokenInfo.roleName || tokenInfo.rolename || tokenInfo.role)) || 'OAuth2 (CI)';

	return { companyName, companyId, roleName };
}

function normalizeAccountIdForDatacenterUrls(accountId) {
	const raw = `${accountId || ''}`.trim();
	// NetSuite accepts sandbox/release-preview suffixes as `_SB1` / `_RP1` in datacenterurls.
	// Users sometimes provide `-sb1` / `-rp1` (seen in local configs), so normalize.
	const match = raw.match(/^(.+)-(sb|rp)(\d+)$/i);
	if (!match) {
		return raw;
	}
	const prefix = match[1];
	const env = match[2].toUpperCase();
	const num = match[3];
	return `${prefix}_${env}${num}`;
}

function getClientId(params) {
	return (
		(params && params.clientId) ||
		process.env.SUITECLOUD_CLIENT_ID ||
		process.env.SUITECLOUD_OAUTH_CLIENT_ID ||
		process.env.NS_CLIENT_ID ||
		null
	);
}

function normalizeScope(value) {
	const raw = `${value || ''}`.trim();
	if (!raw) {
		return null;
	}
	// allow config-style quoted scopes: "rest_webservices restlets"
	return raw.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim() || null;
}

function getScope(params) {
	return (
		normalizeScope(params && params.scope) ||
		normalizeScope(process.env.SUITECLOUD_SCOPE) ||
		normalizeScope(process.env.SUITECLOUD_SCOPES) ||
		normalizeScope(process.env.NS_SCOPES) ||
		DEFAULT_SCOPE
	);
}

module.exports = class NetSuiteCiAuthService {
	constructor(dependencies) {
		this._httpClient = (dependencies && dependencies.httpClient) || new HttpClient();
		this._jwtAssertionService = (dependencies && dependencies.jwtAssertionService) || new JwtAssertionService();
		this._domainsService = (dependencies && dependencies.domainsService) || new NetSuiteDomainsService({ httpClient: this._httpClient });
	}

	async authenticateCi(params) {
		assert(params);
		assert(params.accountId);
		assert(params.certificateId);
		assert(params.privateKeyPath);

		const clientId = getClientId(params);
		if (!clientId) {
			throw new Error(
				'Missing OAuth2 client ID for client_credentials. Provide --clientid or set SUITECLOUD_CLIENT_ID.'
			);
		}

		const privateKeyPath = toAbsolutePath(params.privateKeyPath);
		if (!fs.existsSync(privateKeyPath)) {
			throw new Error(`Private key file not found: ${privateKeyPath}`);
		}

		const domains = await this._domainsService.resolveDomains({
			accountId: normalizeAccountIdForDatacenterUrls(params.accountId),
			domain: params.domain,
		});
		const tokenUrl = `${domains.restDomain}/services/rest/auth/oauth2/v1/token`;

		const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
		const scope = getScope(params);
		const jwt = this._jwtAssertionService.createClientCredentialsJwt({
			audience: tokenUrl,
			issuer: clientId,
			kid: params.certificateId,
			privateKeyPem,
			scope,
		});

		const tokenResponse = await this._httpClient.requestForm({
			url: tokenUrl,
			form: {
				grant_type: 'client_credentials',
				client_id: clientId,
				client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
				client_assertion: jwt,
			},
		});

		if (tokenResponse.statusCode < 200 || tokenResponse.statusCode >= 300) {
			throw new Error(`OAuth2 token request failed (status=${tokenResponse.statusCode}): ${tokenResponse.text}`);
		}

		const tokenData = tokenResponse.data || {};
		if (!tokenData.access_token) {
			throw new Error(`OAuth2 token response missing access_token: ${JSON.stringify(tokenData)}`);
		}

		const accessToken = tokenData.access_token;
		const expiresIn = Number(tokenData.expires_in || 0);
		const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

		let tokenInfo = null;
		try {
			const tokenInfoResponse = await this._httpClient.requestJson({
				url: `${domains.restDomain}/rest/tokeninfo`,
				method: 'GET',
				headers: { authorization: `Bearer ${accessToken}` },
			});
			if (tokenInfoResponse.statusCode >= 200 && tokenInfoResponse.statusCode < 300) {
				tokenInfo = tokenInfoResponse.data;
			}
		} catch (e) {
			// Best-effort; keep auth usable even if tokeninfo is unavailable.
		}

		return {
			accountInfo: mapTokenInfoToAccountInfo(params.accountId, tokenInfo),
			hostInfo: domains.hostInfo,
			domains: {
				restDomain: domains.restDomain,
				systemDomain: domains.systemDomain,
				webservicesDomain: domains.webservicesDomain,
			},
			token: {
				accessToken,
				expiresAt,
				tokenType: tokenData.token_type || 'Bearer',
			},
			authConfig: {
				accountId: params.accountId,
				clientId,
				certificateId: params.certificateId,
				privateKeyPath,
				domain: params.domain || null,
				scope,
			},
		};
	}
};
