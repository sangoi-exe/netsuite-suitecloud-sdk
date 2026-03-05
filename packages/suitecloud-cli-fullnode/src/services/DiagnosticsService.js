/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

function isTruthy(value) {
	if (value === undefined || value === null) {
		return false;
	}
	const normalized = `${value}`.trim().toLowerCase();
	return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function formatDurationMs(ms) {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	const seconds = ms / 1000;
	if (seconds < 60) {
		return `${seconds.toFixed(2)}s`;
	}
	const minutes = Math.floor(seconds / 60);
	const remSeconds = seconds - minutes * 60;
	return `${minutes}m${remSeconds.toFixed(1)}s`;
}

function redactParamValue(paramName, value) {
	const name = `${paramName}`.toLowerCase();
	if (/(secret|password|passkey|token|privatekey|authorization)/i.test(name)) {
		return '<redacted>';
	}
	return value;
}

function sanitizeSdkParams(params) {
	if (!params || typeof params !== 'object') {
		return {};
	}
	const sanitized = {};
	for (const [key, value] of Object.entries(params)) {
		sanitized[key] = redactParamValue(key, value);
	}
	return sanitized;
}

class DiagnosticsService {
	isDebugEnabled() {
		return isTruthy(process.env.SUITECLOUD_DEBUG) || isTruthy(process.env.npm_config_suitecloud_debug);
	}

	isVerboseEnabled() {
		return isTruthy(process.env.SUITECLOUD_VERBOSE) || isTruthy(process.env.npm_config_suitecloud_verbose);
	}

	formatDuration(ms) {
		return formatDurationMs(ms);
	}

	sanitizeSdkParams(params) {
		return sanitizeSdkParams(params);
	}
}

module.exports = new DiagnosticsService();
