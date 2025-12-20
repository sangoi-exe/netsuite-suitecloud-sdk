/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const DiagnosticsService = require('../../services/DiagnosticsService');

module.exports = class BaseOutputHandler {
	constructor(options) {
		this._log = options.log;
		this._commandName = options && options.commandMetadata && options.commandMetadata.name ? options.commandMetadata.name : null;
	}

	parse(actionResult) {
		return actionResult;
	}

	parseError(actionResult) {
		if (actionResult.errorMessages && actionResult.errorMessages.length > 0) {
			const prefix =
				(this._commandName && (DiagnosticsService.isDebugEnabled() || DiagnosticsService.isVerboseEnabled()))
					? `[${this._commandName}] `
					: '';
			for (let i =0; i<actionResult.errorMessages.length; i++) {
				this._log.error(`${prefix}${actionResult.errorMessages[i]}`);
			}
		}
		return actionResult;
	}
};
