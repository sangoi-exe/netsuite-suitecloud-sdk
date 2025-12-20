/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

function buildNotImplementedMessage(executionContext) {
	const command = executionContext && executionContext.getCommand ? executionContext.getCommand() : '<unknown>';
	return `Java-free Node engine: SDK command "${command}" is not implemented yet.`;
}

module.exports = class NodeSdkExecutor {
	constructor(sdkPath, executionEnvironmentContext) {
		this._sdkPath = sdkPath;
		this._executionEnvironmentContext = executionEnvironmentContext;
	}

	async execute(executionContext) {
		const message = buildNotImplementedMessage(executionContext);

		if (executionContext && executionContext.isIntegrationMode && executionContext.isIntegrationMode()) {
			return {
				status: 'ERROR',
				errorMessages: [message],
			};
		}
		throw new Error(message);
	}
};

