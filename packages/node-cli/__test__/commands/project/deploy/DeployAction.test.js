'use strict';

jest.mock('../../../../src/SdkExecutor');
jest.mock('../../../../src/services/NodeTranslationService');
jest.mock('../../../../src/utils/AuthenticationUtils', () => ({
	getProjectDefaultAuthId: jest.fn(() => 'default-auth'),
}));

const path = require('path');
const { getProjectDefaultAuthId } = require('../../../../src/utils/AuthenticationUtils');
const DeployAction = require('../../../../src/commands/project/deploy/DeployAction');

const PROJECT_FIXTURE = path.resolve(__dirname, '../../../fixtures/project-acp');

function createAction() {
	return new DeployAction({
		projectFolder: '/tmp/not-a-project',
		commandMetadata: {
			name: 'project:deploy',
			sdkCommand: 'deploy',
			options: {
				project: { name: 'project' },
				authid: { name: 'authid' },
				accountspecificvalues: { name: 'accountspecificvalues' },
			},
		},
		executionPath: '/tmp/not-a-project',
		runInInteractiveMode: false,
		log: { info: jest.fn(), result: jest.fn(), warning: jest.fn(), error: jest.fn() },
		sdkPath: '/tmp/sdk',
		executionEnvironmentContext: {},
	});
}

describe('DeployAction preExecute(params)', () => {
	beforeEach(() => {
		getProjectDefaultAuthId.mockClear();
	});

	it('uses explicit project folder in dryrun mode without requiring auth id', () => {
		const action = createAction();

		const preExecParams = action.preExecute({
			project: PROJECT_FIXTURE,
			dryrun: true,
		});

		expect(preExecParams.project).toBe(`"${PROJECT_FIXTURE}"`);
		expect(preExecParams.authid).toBeUndefined();
		expect(getProjectDefaultAuthId).not.toHaveBeenCalled();
	});

	it('resolves default auth id from explicit project folder when not in dryrun mode', () => {
		const action = createAction();

		const preExecParams = action.preExecute({
			project: PROJECT_FIXTURE,
		});

		expect(preExecParams.project).toBe(`"${PROJECT_FIXTURE}"`);
		expect(preExecParams.authid).toBe('default-auth');
		expect(getProjectDefaultAuthId).toHaveBeenCalledWith(PROJECT_FIXTURE);
	});

	it('preserves explicit auth id when not in dryrun mode', () => {
		const action = createAction();

		const preExecParams = action.preExecute({
			project: PROJECT_FIXTURE,
			authid: 'custom-auth',
		});

		expect(preExecParams.authid).toBe('custom-auth');
		expect(getProjectDefaultAuthId).not.toHaveBeenCalled();
	});
});
