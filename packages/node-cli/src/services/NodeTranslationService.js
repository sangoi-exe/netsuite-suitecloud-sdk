/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const TranslationService = require('./TranslationService');
const { DEFAULT_MESSAGES_FILE } = require('../ApplicationConstants');

class NodeTranslationService extends TranslationService {
	constructor() {
		super();
		const filePath = path.join(__dirname, DEFAULT_MESSAGES_FILE);
		this._MESSAGES = JSON.parse(fs.readFileSync(filePath, 'utf8'));
	}
}

module.exports = new NodeTranslationService();
