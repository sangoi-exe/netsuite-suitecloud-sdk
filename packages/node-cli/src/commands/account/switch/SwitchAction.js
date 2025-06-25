/*
 ** Copyright (c) 2025 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const BaseAction = require('../../base/BaseAction');
const SwitchAccountActionResult = require('../../../services/actionresult/SwitchAccountActionResult');
const { setDefaultAuthentication } = require('../../../utils/AuthenticationUtils');
const ProjectInfoService = require('../../../services/ProjectInfoService');
const { FILES } = require('../../../ApplicationConstants');
const {
	validateFieldHasNoSpaces,
	validateFieldIsNotEmpty,
	validateAlphanumericHyphenUnderscore,
	validateMaximumLength,
	showValidationResults,
} = require('../../../validation/InteractiveAnswersValidator');
const { throwValidationException, unwrapExceptionMessage } = require('../../../utils/ExceptionUtils');
const path = require('path');
const NodeTranslationService = require('../../../services/NodeTranslationService');
const TRANSLATION_KEYS = require('../../../services/TranslationKeys');

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


	async execute(params) {
		try {
			const authID = params[COMMAND.OPTIONS.AUTHID];

			// Validate AuthID value and inside SuiteCloud project folder
			this._validateAuthID(authID);
			this._projectInfoService.checkWorkingDirectoryContainsValidProject(this._commandMetadata.name);

			// execute Action
			setDefaultAuthentication(this._executionPath, authID);
			return SwitchAccountActionResult.Builder
				.withData({'projectFilePath' : path.join(this._executionPath, FILES.PROJECT_JSON)})
				.withProjectFolder(this._executionPath)
				.withAuthId(authID)
				.build();

		} catch (error) {
			return SwitchAccountActionResult.Builder.withErrors([unwrapExceptionMessage(error)]).build();
		}
	}

	_validateAuthID(authId) {
		const validateResult = showValidationResults(
				authId,
				validateFieldIsNotEmpty,
				validateFieldHasNoSpaces,
				validateAlphanumericHyphenUnderscore,
				validateMaximumLength
		);

		if (validateResult !== true) {
			throwValidationException(
				[NodeTranslationService.getMessage(TRANSLATION_KEYS.COMMAND_OPTIONS.VALIDATION_SHOW_ERROR_MESSAGE, authId, validateResult)],
				false,
				this._commandMetadata
			);
		}
	}
};
