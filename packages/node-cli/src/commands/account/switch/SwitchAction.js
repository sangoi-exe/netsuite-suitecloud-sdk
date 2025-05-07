/*
 ** Copyright (c) 2025 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const BaseAction = require('../../base/BaseAction');
const SwitchAccountActionResult = require('../../../services/actionresult/SwitchAccountActionResult');
const { setDefaultAuthentication } = require('../../../utils/AuthenticationUtils');
const ProjectInfoService = require('../../../services/ProjectInfoService');
const {
	validateFieldHasNoSpaces,
	validateFieldIsNotEmpty,
	validateAlphanumericHyphenUnderscore,
	validateMaximumLength,
	showValidationResults,
} = require('../../../validation/InteractiveAnswersValidator');
const { throwValidationException, unwrapExceptionMessage } = require('../../../utils/ExceptionUtils');

const COMMAND = {
	OPTIONS: {
		AUTHID: 'authid'
	}
};


module.exports = class SetupAction extends BaseAction {
	constructor(options) {
		super(options);
		this._projectInfoService = new ProjectInfoService(this._projectFolder);
	}

	//TODO: [STEP 1] Validate in right folder

	async preExecute(params) {
		this._projectInfoService.checkWorkingDirectoryContainsValidProject(this._commandMetadata.name);

		//TODO: Should we validate here?
		return params;
	}

	//TODO: [STEP 2] Suitecloud calls Command._validateActionParameters(preExec) and validates command options

	async execute(params) {
		try {

			//TODO: [STEP 3] Validate AuthId (Do we want to do it)?
			let validationErrors= this._validateParams(params);
			if (validationErrors.length > 0) {
				validationErrors = validationErrors.map(error => `Invalid authId: ${error}`); //TODO: (* __ *)
				throwValidationException(validationErrors, false, this._commandMetadata);
			}

			//TODO: [STEP 4] Exec Command
			const authId = params[COMMAND.OPTIONS.AUTHID];
			setDefaultAuthentication(this._executionPath, authId);

			// SPINNER

			return SwitchAccountActionResult.Builder
				.withSuccess()
				.withProjectDirectory(this._executionPath)
				.withAuthId(authId)
				.build();

		} catch (error) {
			return SwitchAccountActionResult.Builder.withErrors([unwrapExceptionMessage(error)]).build();
		}
	}

	_validateParams(params) {
		const validationErrors = [];
		validationErrors.push(
			showValidationResults(
				params[COMMAND.OPTIONS.AUTHID],
				validateFieldIsNotEmpty,	// This never throws error (is thrown earlier): "This value cannot be empty.",
				validateFieldHasNoSpaces,	// "This field cannot contain spaces.",
				validateAlphanumericHyphenUnderscore,	// "This field contains forbidden characters. Use only alphanumerical characters, hyphens, or underscores.",
				validateMaximumLength	// "This field can only contain up to {0} characters.",
			)
		);

		return validationErrors.filter((item) => item !== true);
	}
};
