/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const AddDependenciesOutputHandler = require('../../../../src/commands/project/adddependencies/AddDependenciesOutputHandler');

describe('AddDependenciesOutputHandler parse(actionResult)', () => {
	test('prints no-dependency message when no dependencies were added', () => {
		const resultLogger = jest.fn();
		const outputHandler = new AddDependenciesOutputHandler({
			log: {
				result: resultLogger,
				info: jest.fn(),
				warning: jest.fn(),
				error: jest.fn(),
			},
		});

		const actionResult = { data: [] };
		const parsed = outputHandler.parse(actionResult);

		expect(parsed).toBe(actionResult);
		expect(resultLogger).toHaveBeenCalledTimes(1);
		expect(resultLogger).toHaveBeenCalledWith('There are no dependencies to add to the manifest.xml file.');
	});

	test('formats all supported dependency categories', () => {
		const resultLogger = jest.fn();
		const outputHandler = new AddDependenciesOutputHandler({
			log: {
				result: resultLogger,
				info: jest.fn(),
				warning: jest.fn(),
				error: jest.fn(),
			},
		});

		const actionResult = {
			data: [
				{ type: 'FEATURE', value: 'SERVERSIDESCRIPTING', required: true },
				{ type: 'FILE', value: '/SuiteScripts/lib/helper.js' },
				{ type: 'FOLDER', value: '/SuiteScripts/lib' },
				{ type: 'BUNDLE', value: '8205' },
				{ type: 'OBJECT', scriptId: 'customrecord_dep', appId: 'com.other.app' },
				{ type: 'OBJECT', scriptId: 'customrecord_bundle_dep', bundleIds: '3006' },
				{ type: 'PLATFORMEXTENSION', appId: 'com.other.app', objectType: 'customrecordtype' },
			],
		};

		outputHandler.parse(actionResult);

		expect(resultLogger).toHaveBeenCalledWith('The following dependencies were added to the manifest:');
		expect(resultLogger).toHaveBeenCalledWith('Feature - SERVERSIDESCRIPTING:required');
		expect(resultLogger).toHaveBeenCalledWith('File - /SuiteScripts/lib/helper.js');
		expect(resultLogger).toHaveBeenCalledWith('Folder - /SuiteScripts/lib');
		expect(resultLogger).toHaveBeenCalledWith('Bundle - bundleId=8205');
		expect(resultLogger).toHaveBeenCalledWith('[Object - scriptId=customrecord_dep] in [Application - appId=com.other.app]');
		expect(resultLogger).toHaveBeenCalledWith('[Object - scriptId=customrecord_bundle_dep] in [Bundle - bundleId=3006]');
		expect(resultLogger).toHaveBeenCalledWith('Platform Extension - appId=com.other.app, objectType=customrecordtype');
	});
});
