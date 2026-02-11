/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

jest.mock('../../../../src/ui/CliSpinner', () => ({
	executeWithSpinner: jest.fn(async ({ action }) => action),
}));

const AddDependenciesAction = require('../../../../src/commands/project/adddependencies/AddDependenciesAction');

function createAction() {
	return new AddDependenciesAction({
		projectFolder: '/tmp/project',
		commandMetadata: { sdkCommand: 'adddependencies' },
		executionPath: '/tmp/project',
		runInInteractiveMode: false,
		log: { info: jest.fn(), result: jest.fn(), warning: jest.fn(), error: jest.fn() },
		sdkPath: '/tmp/sdk',
		executionEnvironmentContext: {},
	});
}

describe('AddDependenciesAction execute(params)', () => {
	test('does not force -all flag when all is not provided', async () => {
		const addDependenciesAction = createAction();
		let capturedExecutionContext;
		addDependenciesAction._sdkExecutor = {
			execute: jest.fn(async (executionContext) => {
				capturedExecutionContext = executionContext;
				return { status: 'SUCCESS', data: [], resultMessage: 'ok' };
			}),
		};

		const actionResult = await addDependenciesAction.execute({
			project: '"/tmp/project"',
			feature: '"SERVERSIDESCRIPTING"',
		});

		expect(actionResult.isSuccess()).toBe(true);
		expect(capturedExecutionContext.getFlags()).toEqual([]);
	});

	test('adds -all flag when all=true', async () => {
		const addDependenciesAction = createAction();
		let capturedExecutionContext;
		addDependenciesAction._sdkExecutor = {
			execute: jest.fn(async (executionContext) => {
				capturedExecutionContext = executionContext;
				return { status: 'SUCCESS', data: [], resultMessage: 'ok' };
			}),
		};

		const actionResult = await addDependenciesAction.execute({
			project: '"/tmp/project"',
			all: true,
		});

		expect(actionResult.isSuccess()).toBe(true);
		expect(capturedExecutionContext.getFlags()).toEqual(['-all']);
	});
});
