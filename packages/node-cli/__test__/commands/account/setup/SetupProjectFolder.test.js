'use strict';

jest.mock('../../../../src/utils/AuthenticationUtils', () => ({
	authenticateWithOauth: jest.fn(),
	setDefaultAuthentication: jest.fn(),
}));

const { authenticateWithOauth, setDefaultAuthentication } = require('../../../../src/utils/AuthenticationUtils');
const SetupAction = require('../../../../src/commands/account/setup/SetupAction');

const AUTH_MODE = {
	OAUTH: 'OAUTH',
	REUSE: 'REUSE',
};

describe('SetupAction project folder auth persistence', () => {
	afterEach(() => {
		jest.clearAllMocks();
	});

	test('uses projectFolder when forwarding OAuth authenticate call', async () => {
		const executionEnvironmentContext = { name: 'ctx' };
		const setupAction = new SetupAction({
			projectFolder: '/repo/src',
			executionPath: '/repo',
			sdkPath: '/sdk-home',
			executionEnvironmentContext,
		});
		const oauthResult = { isSuccess: () => true };
		authenticateWithOauth.mockResolvedValue(oauthResult);

		const params = { mode: AUTH_MODE.OAUTH, authid: 'myauth' };
		const result = await setupAction.execute(params);

		expect(result).toBe(oauthResult);
		expect(authenticateWithOauth).toHaveBeenCalledWith(params, '/sdk-home', '/repo/src', executionEnvironmentContext);
	});

	test('persists reused auth id in projectFolder', async () => {
		const setupAction = new SetupAction({
			projectFolder: '/repo/src',
			executionPath: '/repo',
			sdkPath: '/sdk-home',
		});

		const actionResult = await setupAction.execute({
			mode: AUTH_MODE.REUSE,
			authentication: {
				authId: 'lucas_wsl_sandbox',
				accountInfo: { companyName: 'ACME', roleName: 'Administrator' },
			},
		});

		expect(setDefaultAuthentication).toHaveBeenCalledWith('/repo/src', 'lucas_wsl_sandbox');
		expect(actionResult.isSuccess()).toBe(true);
	});
});
