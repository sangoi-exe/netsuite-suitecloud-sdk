/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

'use strict';

const BaseAction = require('../../base/BaseAction');
const DeployActionResult = require('../../../services/actionresult/DeployActionResult');
const SdkExecutionContext = require('../../../SdkExecutionContext');
const SdkOperationResultUtils = require('../../../utils/SdkOperationResultUtils');
const NodeTranslationService = require('../../../services/NodeTranslationService');
const CommandUtils = require('../../../utils/CommandUtils');
const ProjectInfoService = require('../../../services/ProjectInfoService');
const AccountSpecificValuesUtils = require('../../../utils/AccountSpecificValuesUtils');
const ApplyInstallationPreferencesUtils = require('../../../utils/ApplyInstallationPreferencesUtils');
const { executeWithSpinner } = require('../../../ui/CliSpinner');
const { getProjectDefaultAuthId } = require('../../../utils/AuthenticationUtils');

const {
	COMMAND_VALIDATE: { MESSAGES },
} = require('../../../services/TranslationKeys');

const COMMAND_OPTIONS = {
	SERVER: 'server',
	ACCOUNT_SPECIFIC_VALUES: 'accountspecificvalues',
	APPLY_INSTALLATION_PREFERENCES: 'applyinstallprefs',
	PROJECT: 'project',
	AUTH_ID: 'authid',
};

module.exports = class ValidateAction extends BaseAction {
	constructor(options) {
		super(options);
		this._activeProjectFolder = this._projectFolder;
		this._activeProjectType = null;
		this._activeProjectName = null;
	}

	preExecute(params) {
		const selectedProjectFolder = params[COMMAND_OPTIONS.PROJECT]
			? CommandUtils.unquoteString(params[COMMAND_OPTIONS.PROJECT])
			: this._projectFolder;
		const projectInfoService = new ProjectInfoService(selectedProjectFolder);

		this._activeProjectFolder = selectedProjectFolder;
		this._activeProjectType = projectInfoService.getProjectType();
		this._activeProjectName = projectInfoService.getProjectName();

		params[COMMAND_OPTIONS.PROJECT] = CommandUtils.quoteString(selectedProjectFolder);

		AccountSpecificValuesUtils.validate(params, selectedProjectFolder);
		ApplyInstallationPreferencesUtils.validate(params, selectedProjectFolder, this._commandMetadata.name, this._log);

		// Local validation is java-free and does not require auth; server validation will.
		if (params[COMMAND_OPTIONS.SERVER] && !params[COMMAND_OPTIONS.AUTH_ID]) {
			params[COMMAND_OPTIONS.AUTH_ID] = getProjectDefaultAuthId(selectedProjectFolder);
		}

		return {
			...params,
			...AccountSpecificValuesUtils.transformArgument(params),
		};
	}

	async execute(params) {
		try {
			let isServerValidation = false;
			let installationPreferencesApplied = false;
			const flags = [];

			if (params[COMMAND_OPTIONS.SERVER]) {
				flags.push(COMMAND_OPTIONS.SERVER);
				isServerValidation = true;
				delete params[COMMAND_OPTIONS.SERVER];
			}

			if (params[COMMAND_OPTIONS.APPLY_INSTALLATION_PREFERENCES]) {
				delete params[COMMAND_OPTIONS.APPLY_INSTALLATION_PREFERENCES];
				flags.push(COMMAND_OPTIONS.APPLY_INSTALLATION_PREFERENCES);
				installationPreferencesApplied = true;
			}

			const sdkParams = CommandUtils.extractCommandOptions(params, this._commandMetadata);

			const executionContext = SdkExecutionContext.Builder.forCommand(this._commandMetadata.sdkCommand)
				.integration()
				.addParams(sdkParams)
				.addFlags(flags)
				.build();

			const operationResult = await executeWithSpinner({
				action: this._sdkExecutor.execute(executionContext),
				message: isServerValidation
					? NodeTranslationService.getMessage(MESSAGES.VALIDATING, this._activeProjectName, params[COMMAND_OPTIONS.AUTH_ID])
					: `Validating project "${this._activeProjectName}" (local)`,
			});

			return operationResult.status === SdkOperationResultUtils.STATUS.SUCCESS
				? DeployActionResult.Builder.withData(operationResult.data)
						.withResultMessage(operationResult.resultMessage)
						.withServerValidation(isServerValidation)
						.withAppliedInstallationPreferences(installationPreferencesApplied)
						.withProjectType(this._activeProjectType)
						.withProjectFolder(this._activeProjectFolder)
						.withCommandParameters(sdkParams)
						.withCommandFlags(flags)
						.build()
				: DeployActionResult.Builder.withErrors(operationResult.errorMessages)
						.withServerValidation(isServerValidation)
						.withCommandParameters(sdkParams)
						.withCommandFlags(flags)
						.build();
		} catch (error) {
			return DeployActionResult.Builder.withErrors([error]).build();
		}
	}
};
