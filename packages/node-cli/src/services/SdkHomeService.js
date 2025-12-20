/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const os = require('os');
const path = require('path');
const { FOLDERS } = require('../ApplicationConstants');

const DEFAULT_SDK_HOME_FOLDER = (FOLDERS && FOLDERS.SUITECLOUD_SDK) || '.suitecloud-sdk';

class SdkHomeService {
	getSdkHomePath() {
		return process.env.SUITECLOUD_SDK_HOME || path.join(os.homedir(), DEFAULT_SDK_HOME_FOLDER);
	}
}

module.exports = new SdkHomeService();

