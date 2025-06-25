/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';
const BaseOutputHandler = require('../../base/BaseOutputHandler');
const NodeTranslationService = require('../../../services/NodeTranslationService');
const { COMMAND_SWITCHACCOUNT } = require('../../../services/TranslationKeys');

module.exports = class SetupOutputHandler extends BaseOutputHandler {
	constructor(options) {
		super(options);
	}

		parse(actionResult) {
			const resultMessage = NodeTranslationService.getMessage(
				COMMAND_SWITCHACCOUNT.OUTPUT.NEW_DEFAULT_ACCOUNT,
				actionResult.authId
			);

			this._log.result(resultMessage);
			this._log.result("[Placeholder Message 2b] Successful account switch.");
			return actionResult;
		}
	};

