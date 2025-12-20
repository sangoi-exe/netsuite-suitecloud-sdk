/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const NodeSdkExecutor = require('./core/sdkexecutor/NodeSdkExecutor');
const SdkHomeService = require('./services/SdkHomeService');

module.exports = class SdkExecutor {
	constructor(sdkPath, executionEnvironmentContext) {
		// Java/JAR have been removed from this fork; the Node engine is the only executor.
		const resolvedSdkPath = sdkPath || SdkHomeService.getSdkHomePath();
		this._executor = new NodeSdkExecutor(resolvedSdkPath, executionEnvironmentContext);
	}

	execute(executionContext, token) {
		return this._executor.execute(executionContext, token);
	}
};
