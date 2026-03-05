/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const ConsoleLogger = require('./ConsoleLogger');

let fontFormatter = null;
let fontFormatterLoadError = null;
(async () => {
	try {
		fontFormatter = await import('./LoggerFontFormatter.mjs');
	} catch (error) {
		fontFormatterLoadError = error;
	}
})();

function colorize(colorKey, message) {
	if (!fontFormatter || !fontFormatter.COLORS || !fontFormatter.COLORS[colorKey]) {
		return `${message}`;
	}
	return fontFormatter.COLORS[colorKey](`${message}`);
}

class NodeConsoleLogger extends ConsoleLogger {

	info(message) {
		this._println(colorize('INFO', message));
	}

	result(message) {
		this._println(colorize('RESULT', message));
	}

	warning(message) {
		this._println(colorize('WARNING', message));
	}

	error(message) {
		this._println(colorize('ERROR', message));
	}

	_println(message) {
		console.log(message);
	}

}

module.exports = new NodeConsoleLogger();
