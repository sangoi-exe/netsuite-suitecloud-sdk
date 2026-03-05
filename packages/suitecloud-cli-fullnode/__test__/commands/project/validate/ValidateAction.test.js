'use strict';

jest.mock('../../../../src/SdkExecutor');
jest.mock('../../../../src/services/NodeTranslationService');
jest.mock('../../../../src/utils/AuthenticationUtils', () => ({
	getProjectDefaultAuthId: jest.fn(() => 'default-auth'),
}));

const path = require('path');
const { getProjectDefaultAuthId } = require('../../../../src/utils/AuthenticationUtils');
const ValidateAction = require('../../../../src/commands/project/validate/ValidateAction');

const PROJECT_FIXTURE = path.resolve(__dirname, '../../../fixtures/project-acp');

function createAction() {
	return new ValidateAction({
		projectFolder: '/tmp/not-a-project',
		commandMetadata: {
			name: 'project:validate',
			sdkCommand: 'validate',
			options: {
				project: { name: 'project' },
				server: { name: 'server' },
				authid: { name: 'authid' },
				accountspecificvalues: { name: 'accountspecificvalues' },
				applyinstallprefs: { name: 'applyinstallprefs' },
			},
		},
		executionPath: '/tmp/not-a-project',
		runInInteractiveMode: false,
		log: { info: jest.fn(), result: jest.fn(), warning: jest.fn(), error: jest.fn() },
		sdkPath: '/tmp/sdk',
		executionEnvironmentContext: {},
	});
}

describe('ValidateAction preExecute(params)', () => {
	beforeEach(() => {
		getProjectDefaultAuthId.mockClear();
	});

	it('uses explicit project folder when provided', () => {
		const action = createAction();

		const preExecParams = action.preExecute({
			project: PROJECT_FIXTURE,
		});

		expect(preExecParams.project).toBe(`"${PROJECT_FIXTURE}"`);
	});

	it('resolves default auth id from explicit project folder for server validation', () => {
		const action = createAction();

		const preExecParams = action.preExecute({
			project: PROJECT_FIXTURE,
			server: true,
		});

		expect(getProjectDefaultAuthId).toHaveBeenCalledWith(PROJECT_FIXTURE);
		expect(preExecParams.authid).toBe('default-auth');
	});

	it('preserves explicit auth id for server validation', () => {
		const action = createAction();

		const preExecParams = action.preExecute({
			project: PROJECT_FIXTURE,
			server: true,
			authid: 'custom-auth',
		});

		expect(preExecParams.authid).toBe('custom-auth');
		expect(getProjectDefaultAuthId).not.toHaveBeenCalled();
	});
});
