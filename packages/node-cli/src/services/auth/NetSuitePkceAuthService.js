/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { URL } = require('url');

const HttpClient = require('../http/HttpClient');
const NetSuiteDomainsService = require('./NetSuiteDomainsService');
const { DOMAIN, FILES } = require('../../ApplicationConstants');

const CALLBACK_HOST = '127.0.0.1';
const CALLBACK_PATH = '/suitecloud-auth';
const CALLBACK_URL_TEMPLATE = `http://${CALLBACK_HOST}:%d${CALLBACK_PATH}`;
const PORT_RANGE_MIN = 52300;
const PORT_RANGE_MAX = 52315;
const DEFAULT_TIMEOUT_MS = 300000;
const DEFAULT_SCOPE = 'rest_webservices';

const PRODUCTION_INTEGRATION_CLIENT_ID = '6da57bf05a6247fc876c6d228184ff487760a382a43ac7e93eaff743803d22ac';
const DEVELOPMENT_INTEGRATION_CLIENT_ID = 'a3f34eae0e4ab97240fb221ea91623e790b7cb577421e0185bf5d108837c7bd1';

const OAUTH_SUCCESS_HTML = '<!doctype html><html><head><meta charset="utf-8" /></head><body><h2>Authentication completed.</h2><p>You can close this window and return to SuiteCloud CLI.</p></body></html>';
const OAUTH_FAILURE_HTML = '<!doctype html><html><head><meta charset="utf-8" /></head><body><h2>Authentication failed.</h2><p>Please return to SuiteCloud CLI and retry.</p></body></html>';

function normalizeDomainUrl(domainValue) {
	if (!domainValue) {
		return `https://${DOMAIN.PRODUCTION.GENERIC_NETSUITE_DOMAIN}`;
	}
	const value = `${domainValue}`.trim();
	if (!value) {
		return `https://${DOMAIN.PRODUCTION.GENERIC_NETSUITE_DOMAIN}`;
	}
	if (value.startsWith('http://') || value.startsWith('https://')) {
		return value.replace(/\/+$/, '');
	}
	return `https://${value.replace(/\/+$/, '')}`;
}

function normalizeScope(scope) {
	const raw = `${scope || ''}`.trim();
	if (!raw) {
		return DEFAULT_SCOPE;
	}
	return raw.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim() || DEFAULT_SCOPE;
}

function isFDomain(domainUrl) {
	const hostname = new URL(domainUrl).hostname;
	return (
		/^(?:\w+)\.app\.f\.netsuite\.com$/i.test(hostname) ||
		/^system\.f\.netsuite\.com$/i.test(hostname) ||
		/^(?:\w+)\.suitetalk\.api\.f\.netsuite\.com$/i.test(hostname)
	);
}

function mapTokenInfoToAccountInfo(accountId, tokenInfo) {
	const companyName =
		(tokenInfo && (tokenInfo.companyName || tokenInfo.company || tokenInfo.companyname || tokenInfo.accountName)) || accountId;
	const companyId = (tokenInfo && (tokenInfo.companyId || tokenInfo.companyid || tokenInfo.account || tokenInfo.accountId)) || accountId;
	const roleName = (tokenInfo && (tokenInfo.roleName || tokenInfo.rolename || tokenInfo.role)) || 'OAuth2 (PKCE)';

	return { companyName, companyId, roleName };
}

function toBase64Url(buffer) {
	return Buffer.from(buffer)
		.toString('base64')
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
}

function createPkceCodeVerifier() {
	return toBase64Url(crypto.randomBytes(64));
}

function createPkceCodeChallenge(codeVerifier) {
	return toBase64Url(crypto.createHash('sha256').update(codeVerifier, 'utf8').digest());
}

function createStateToken() {
	return toBase64Url(crypto.randomBytes(32));
}

function buildAuthorizeUrl({ baseDomain, clientId, redirectUri, state, scope, codeChallenge }) {
	const authorizeUrl = new URL('/app/login/oauth2/authorize.nl', baseDomain);
	authorizeUrl.searchParams.set('response_type', 'code');
	authorizeUrl.searchParams.set('client_id', clientId);
	authorizeUrl.searchParams.set('redirect_uri', redirectUri);
	authorizeUrl.searchParams.set('scope', scope);
	authorizeUrl.searchParams.set('state', state);
	authorizeUrl.searchParams.set('code_challenge', codeChallenge);
	authorizeUrl.searchParams.set('code_challenge_method', 'S256');
	return authorizeUrl.toString();
}

function parseOAuthErrorPayload(response) {
	if (!response) {
		return { code: null, description: null };
	}
	const data = response.data || {};
	const code = data.error || null;
	const description = data.error_description || response.text || null;
	return { code, description };
}

function openInDefaultBrowser(url) {
	assert(url);

	let command;
	let args;
	if (process.platform === 'darwin') {
		command = 'open';
		args = [url];
	} else if (process.platform === 'win32') {
		command = 'cmd';
		args = ['/c', 'start', '', url];
	} else {
		command = 'xdg-open';
		args = [url];
	}

	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: 'ignore', detached: process.platform !== 'win32' });
		child.once('error', (error) => {
			const message = error && error.message ? error.message : `${error}`;
			reject(new Error(`Unable to launch browser for OAuth authorization (${command}): ${message}`));
		});
		child.once('spawn', () => {
			child.unref();
			resolve();
		});
	});
}

function resolveClientIdFromSettings(sdkPath) {
	if (!sdkPath) {
		return null;
	}
	const settingsPath = path.join(sdkPath, FILES.SDK_SETTINGS);
	if (!fs.existsSync(settingsPath)) {
		return null;
	}

	let settings;
	try {
		settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
	} catch (error) {
		const message = error && error.message ? error.message : `${error}`;
		throw new Error(`Invalid SDK settings file "${settingsPath}": ${message}`);
	}

	const configuredClientId = settings && settings.integrationClientId ? `${settings.integrationClientId}`.trim() : '';
	return configuredClientId || null;
}

function resolveClientId({ clientId, sdkPath, domainUrl }) {
	const explicitClientId = `${clientId || ''}`.trim();
	if (explicitClientId) {
		return explicitClientId;
	}

	const envClientId =
		process.env.SUITECLOUD_INTEGRATION_CLIENT_ID || process.env.SUITECLOUD_OAUTH_CLIENT_ID || process.env.SUITECLOUD_CLIENT_ID || null;
	if (envClientId && `${envClientId}`.trim()) {
		return `${envClientId}`.trim();
	}

	const configuredClientId = resolveClientIdFromSettings(sdkPath);
	if (configuredClientId) {
		return configuredClientId;
	}

	return isFDomain(domainUrl) ? DEVELOPMENT_INTEGRATION_CLIENT_ID : PRODUCTION_INTEGRATION_CLIENT_ID;
}

function toRedirectUri(port) {
	return CALLBACK_URL_TEMPLATE.replace('%d', `${port}`);
}

function createTimeoutError(timeoutMs) {
	const seconds = Math.ceil(timeoutMs / 1000);
	return new Error(`OAuth authorization timed out after ${seconds}s. Retry "suitecloud account:setup".`);
}

module.exports = class NetSuitePkceAuthService {
	constructor(dependencies) {
		this._httpClient = (dependencies && dependencies.httpClient) || new HttpClient();
		this._domainsService = (dependencies && dependencies.domainsService) || new NetSuiteDomainsService({ httpClient: this._httpClient });
		this._openBrowser = (dependencies && dependencies.openBrowser) || openInDefaultBrowser;
		this._defaultTimeoutMs = (dependencies && dependencies.timeoutMs) || DEFAULT_TIMEOUT_MS;
	}

	async authenticate(options) {
		const domainUrl = normalizeDomainUrl(options && options.domain);
		const clientId = resolveClientId({
			clientId: options && options.clientId,
			sdkPath: options && options.sdkPath,
			domainUrl,
		});
		const scope = normalizeScope(options && options.scope);
		const timeoutMs = Number(options && options.timeoutMs) > 0 ? Number(options.timeoutMs) : this._defaultTimeoutMs;
		const state = createStateToken();
		const codeVerifier = createPkceCodeVerifier();
		const codeChallenge = createPkceCodeChallenge(codeVerifier);

		const callbackServer = await this._startCallbackServer(state);
		const redirectUri = toRedirectUri(callbackServer.port);
		const authorizeUrl = buildAuthorizeUrl({
			baseDomain: domainUrl,
			clientId,
			redirectUri,
			state,
			scope,
			codeChallenge,
		});

		try {
			await this._openBrowser(authorizeUrl);
			const callbackParams = await callbackServer.waitForCallback(timeoutMs);
			const accountId = this._validateAuthorizationCallback(callbackParams, state);
			const domains = await this._domainsService.resolveDomains({ accountId, domain: options && options.domain });
			const authResult = await this._requestAuthorizationCodeToken({
				restDomain: domains.restDomain,
				code: `${callbackParams.code}`.trim(),
				clientId,
				redirectUri,
				codeVerifier,
				scope,
				accountId,
			});

			return {
				accountInfo: authResult.accountInfo,
				hostInfo: domains.hostInfo,
				domains: {
					restDomain: domains.restDomain,
					systemDomain: domains.systemDomain,
					webservicesDomain: domains.webservicesDomain,
				},
				token: authResult.token,
				authConfig: {
					accountId,
					clientId,
					domain: options && options.domain ? `${options.domain}` : null,
					scope,
				},
			};
		} finally {
			await callbackServer.close();
		}
	}

	async refreshWithRefreshToken(options) {
		assert(options);
		const accountId = `${options.accountId || ''}`.trim();
		const clientId = `${options.clientId || ''}`.trim();
		const refreshToken = `${options.refreshToken || ''}`.trim();

		if (!accountId) {
			throw new Error('Missing accountId for PKCE token refresh.');
		}
		if (!clientId) {
			throw new Error('Missing clientId for PKCE token refresh.');
		}
		if (!refreshToken) {
			throw new Error('Missing refresh token for PKCE reauthorization. Re-run "suitecloud account:setup".');
		}

		const domains = await this._resolveDomainsForRefresh(options, accountId);
		const tokenResponse = await this._httpClient.requestForm({
			url: `${domains.restDomain}/services/rest/auth/oauth2/v1/token`,
			form: {
				grant_type: 'refresh_token',
				client_id: clientId,
				refresh_token: refreshToken,
			},
		});
		if (tokenResponse.statusCode < 200 || tokenResponse.statusCode >= 300) {
			const { code, description } = parseOAuthErrorPayload(tokenResponse);
			const suffix = code ? ` (${code})` : '';
			throw new Error(`OAuth refresh request failed${suffix}: ${description || tokenResponse.text}`);
		}

		const tokenData = tokenResponse.data || {};
		if (!tokenData.access_token) {
			throw new Error(`OAuth refresh response missing access_token: ${JSON.stringify(tokenData)}`);
		}

		const expiresIn = Number(tokenData.expires_in || 0);
		const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
		const accessToken = tokenData.access_token;
		const resolvedRefreshToken = tokenData.refresh_token || refreshToken;

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
			// Best effort.
		}

		return {
			accountInfo: mapTokenInfoToAccountInfo(accountId, tokenInfo),
			hostInfo: {
				hostName: new URL(domains.systemDomain).hostname,
			},
			domains: {
				restDomain: domains.restDomain,
				systemDomain: domains.systemDomain,
				webservicesDomain: domains.webservicesDomain || null,
			},
			token: {
				accessToken,
				refreshToken: resolvedRefreshToken,
				expiresAt,
				tokenType: tokenData.token_type || 'Bearer',
				scope: tokenData.scope || options.scope || DEFAULT_SCOPE,
			},
			authConfig: {
				accountId,
				clientId,
				domain: options.domain || null,
				scope: options.scope || DEFAULT_SCOPE,
			},
		};
	}

	async _resolveDomainsForRefresh(options, accountId) {
		if (options.domains && options.domains.restDomain && options.domains.systemDomain) {
			return {
				restDomain: normalizeDomainUrl(options.domains.restDomain),
				systemDomain: normalizeDomainUrl(options.domains.systemDomain),
				webservicesDomain: options.domains.webservicesDomain ? normalizeDomainUrl(options.domains.webservicesDomain) : null,
			};
		}
		return this._domainsService.resolveDomains({ accountId, domain: options.domain });
	}

	async _requestAuthorizationCodeToken({ restDomain, code, clientId, redirectUri, codeVerifier, scope, accountId }) {
		const tokenResponse = await this._httpClient.requestForm({
			url: `${restDomain}/services/rest/auth/oauth2/v1/token`,
			form: {
				grant_type: 'authorization_code',
				client_id: clientId,
				code,
				redirect_uri: redirectUri,
				code_verifier: codeVerifier,
			},
		});
		if (tokenResponse.statusCode < 200 || tokenResponse.statusCode >= 300) {
			const { code: errorCode, description } = parseOAuthErrorPayload(tokenResponse);
			const suffix = errorCode ? ` (${errorCode})` : '';
			throw new Error(`OAuth authorization-code token request failed${suffix}: ${description || tokenResponse.text}`);
		}

		const tokenData = tokenResponse.data || {};
		if (!tokenData.access_token) {
			throw new Error(`OAuth token response missing access_token: ${JSON.stringify(tokenData)}`);
		}

		const accessToken = tokenData.access_token;
		const refreshToken = tokenData.refresh_token || null;
		const expiresIn = Number(tokenData.expires_in || 0);
		const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

		let tokenInfo = null;
		try {
			const tokenInfoResponse = await this._httpClient.requestJson({
				url: `${restDomain}/rest/tokeninfo`,
				method: 'GET',
				headers: { authorization: `Bearer ${accessToken}` },
			});
			if (tokenInfoResponse.statusCode >= 200 && tokenInfoResponse.statusCode < 300) {
				tokenInfo = tokenInfoResponse.data;
			}
		} catch (e) {
			// Best effort.
		}

		return {
			accountInfo: mapTokenInfoToAccountInfo(accountId, tokenInfo),
			token: {
				accessToken,
				refreshToken,
				expiresAt,
				tokenType: tokenData.token_type || 'Bearer',
				scope: tokenData.scope || scope || DEFAULT_SCOPE,
			},
		};
	}

	_validateAuthorizationCallback(params, expectedState) {
		const callbackParams = params || {};
		const errorCode = callbackParams.error ? `${callbackParams.error}`.trim() : '';
		const errorDescription = callbackParams.error_description ? `${callbackParams.error_description}`.trim() : '';
		if (errorCode) {
			const suffix = errorDescription ? `: ${errorDescription}` : '';
			throw new Error(`OAuth authorization failed (${errorCode})${suffix}`);
		}

		const state = callbackParams.state ? `${callbackParams.state}`.trim() : '';
		if (!state || state !== expectedState) {
			throw new Error('OAuth authorization callback state mismatch. Retry "suitecloud account:setup".');
		}

		const code = callbackParams.code ? `${callbackParams.code}`.trim() : '';
		if (!code) {
			throw new Error('OAuth authorization callback did not provide an authorization code.');
		}

		const accountId = callbackParams.company ? `${callbackParams.company}`.trim() : '';
		if (!accountId) {
			throw new Error('OAuth authorization callback did not provide account information ("company").');
		}
		return accountId;
	}

	async _startCallbackServer(expectedState) {
		let lastError;
		for (let port = PORT_RANGE_MIN; port <= PORT_RANGE_MAX; port += 1) {
			try {
				return await this._startCallbackServerOnPort({ port, expectedState });
			} catch (error) {
				if (error && error.code === 'EADDRINUSE') {
					lastError = error;
					continue;
				}
				throw error;
			}
		}
		const suffix = lastError && lastError.message ? ` (${lastError.message})` : '';
		throw new Error(`Unable to start local OAuth callback server on ports ${PORT_RANGE_MIN}-${PORT_RANGE_MAX}${suffix}.`);
	}

	async _startCallbackServerOnPort({ port, expectedState }) {
		let callbackResolver;
		const callbackPromise = new Promise((resolve) => {
			callbackResolver = resolve;
		});

		const server = http.createServer((request, response) => {
			const requestUrl = new URL(request.url || '/', toRedirectUri(port));
			if (requestUrl.pathname !== CALLBACK_PATH) {
				response.writeHead(404, { 'content-type': 'text/plain' });
				response.end('Not found');
				return;
			}

			const params = {};
			for (const [key, value] of requestUrl.searchParams.entries()) {
				params[key] = value;
			}
			callbackResolver(params);

			const isSuccess = !params.error && params.code && params.state && params.state === expectedState;
			response.writeHead(isSuccess ? 200 : 400, { 'content-type': 'text/html' });
			response.end(isSuccess ? OAUTH_SUCCESS_HTML : OAUTH_FAILURE_HTML);
		});

		await new Promise((resolve, reject) => {
			server.once('error', reject);
			server.listen(port, CALLBACK_HOST, () => {
				server.removeListener('error', reject);
				resolve();
			});
		});

		return {
			port,
			waitForCallback: (timeoutMs) =>
				new Promise((resolve, reject) => {
					const effectiveTimeoutMs = Number(timeoutMs) > 0 ? Number(timeoutMs) : this._defaultTimeoutMs;
					const timer = setTimeout(() => reject(createTimeoutError(effectiveTimeoutMs)), effectiveTimeoutMs);
					callbackPromise
						.then((params) => {
							clearTimeout(timer);
							resolve(params);
						})
						.catch((error) => {
							clearTimeout(timer);
							reject(error);
						});
				}),
			close: () =>
				new Promise((resolve) => {
					if (!server.listening) {
						resolve();
						return;
					}
					server.close(() => resolve());
				}),
		};
	}
};
