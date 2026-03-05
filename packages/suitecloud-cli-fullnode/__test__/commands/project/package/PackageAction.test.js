'use strict';

const path = require('path');
const PackageAction = require('../../../../src/commands/project/package/PackageAction');

const PROJECT_FIXTURE = path.resolve(__dirname, '../../../fixtures/project-acp');

function createAction(executionPath, projectFolder = PROJECT_FIXTURE) {
	return new PackageAction({
		projectFolder,
		commandMetadata: {
			name: 'project:package',
			sdkCommand: 'package',
			options: {
				destination: { name: 'destination' },
				project: { name: 'project' },
			},
		},
		executionPath,
		runInInteractiveMode: false,
		log: { info: jest.fn(), result: jest.fn(), warning: jest.fn(), error: jest.fn() },
		sdkPath: '/tmp/sdk',
		executionEnvironmentContext: {},
	});
}

describe('PackageAction preExecute(params)', () => {
	test('keeps explicit destination when provided', () => {
		const action = createAction('/tmp/execution-path');
		const preExecParams = action.preExecute({
			destination: '/tmp/custom-output',
		});

		expect(preExecParams.destination).toBe('/tmp/custom-output');
	});

	test('uses default destination when not provided', () => {
		const action = createAction('/tmp/execution-path');
		const preExecParams = action.preExecute({});

		expect(preExecParams.destination).toBe('"/tmp/execution-path/build"');
	});

	test('keeps explicit project folder when provided', () => {
		const action = createAction('/tmp/execution-path');
		const preExecParams = action.preExecute({
			project: PROJECT_FIXTURE,
		});

		expect(preExecParams.project).toBe(PROJECT_FIXTURE);
	});

	test('validates explicit project folder even when execution project folder is invalid', () => {
		const action = createAction('/tmp/execution-path', '/tmp/not-a-project');
		const preExecParams = action.preExecute({
			project: PROJECT_FIXTURE,
		});

		expect(preExecParams.project).toBe(PROJECT_FIXTURE);
	});
});
