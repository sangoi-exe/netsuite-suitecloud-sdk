/*
 ** Copyright (c) 2025 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';
const assert = require('assert');
const { ActionResult, ActionResultBuilder, STATUS } = require('./ActionResult');

class SwitchAccountActionResult extends ActionResult {
	constructor(parameters) {
		super(parameters);
		this._authId = parameters.authId;
	}

	validateParameters(parameters) {
		super.validateParameters(parameters);
		if (parameters.status === STATUS.SUCCESS) {
			assert(parameters.authId, 'authId is required when ActionResult is a success.');
		}
	}

	get authId() {
		return this._authId;
	}

	static get Builder() {
		return new SwitchAccountActionResultBuilder();
	}
}

class SwitchAccountActionResultBuilder extends ActionResultBuilder {
	constructor() {
		super();
	}


	withAuthId(authId) {
		this.authId = authId;
		return this;
	}

	build() {
		return new SwitchAccountActionResult({
			status: this.status,
			...(this.data && { data: this.data }),
			...(this.resultMessage && { resultMessage: this.resultMessage }),
			...(this.errorMessages && { errorMessages: this.errorMessages }),
			...(this.authId && { authId: this.authId }),
			...(this.projectFolder && { projectFolder: this.projectFolder }),
			...(this.commandParameters && { commandParameters: this.commandParameters }),
		});
	}
}

module.exports = SwitchAccountActionResult;
