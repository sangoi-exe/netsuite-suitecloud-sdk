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
		this._projectDirectory = parameters.projectDirectory;
	}

	validateParameters(parameters) {
		assert(parameters);
		assert(parameters.status, 'status is required when creating an ActionResult object.');
		if (parameters.status === STATUS.SUCCESS) {
			assert(parameters.projectDirectory, 'projectDirectory is required when ActionResult is a success.');
			assert(parameters.authId, '_authId is required when ActionResult is a success.');
		}
		else {
			assert(parameters.errorMessages, 'errorMessages is required when ActionResult is an error.');
			assert(Array.isArray(parameters.errorMessages), 'errorMessages argument must be an array');
		}
	}

	get authId() {
		return this._authId;
	}

	get projectDirectory() {
		return this._projectDirectory;
	}


	static get Builder() {
		return new SwitchAccountActionResultBuilder();
	}
}

class SwitchAccountActionResultBuilder extends ActionResultBuilder {
	constructor() {
		super();
	}

	withSuccess() {
		this.status = STATUS.SUCCESS;
		return this;
	}

	withProjectDirectory(projectDirectory) {
		this.projectDirectory = projectDirectory;
		return this;
	}


	withAuthId(authId) {
		this.authId = authId;
		return this;
	}

	build() {
		return new SwitchAccountActionResult({
			status: this.status,
			...(this.resultMessage && { resultMessage: this.resultMessage }),
			...(this.errorMessages && { errorMessages: this.errorMessages }),
			...(this.projectDirectory && { projectDirectory: this.projectDirectory }),
			...(this.authId && { authId: this.authId }),
			...(this.commandParameters && { commandParameters: this.commandParameters }),
			...(this.commandFlags && { commandFlags: this.commandFlags }),
		});
	}
}

module.exports = SwitchAccountActionResult;
