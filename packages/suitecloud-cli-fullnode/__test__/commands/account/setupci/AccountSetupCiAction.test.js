'use strict';

jest.mock('../../../../src/utils/AuthenticationUtils', () => ({
	authenticateCi: jest.fn(),
}));

jest.mock('../../../../src/services/ExecutionContextService', () => ({
	validateMachineToMachineAuthIsAllowed: jest.fn(),
}));

jest.mock('../../../../src/services/ProjectInfoService', () =>
	jest.fn().mockImplementation(() => ({
		checkWorkingDirectoryContainsValidProject: jest.fn(),
	}))
);

const { authenticateCi } = require('../../../../src/utils/AuthenticationUtils');
const { validateMachineToMachineAuthIsAllowed } = require('../../../../src/services/ExecutionContextService');
const AccountSetupCiAction = require('../../../../src/commands/account/setupci/AccountSetupCiAction');

describe('AccountSetupCiAction project folder auth persistence', () => {
	afterEach(() => {
		jest.clearAllMocks();
	});

	test('uses projectFolder when forwarding CI authenticate call', async () => {
		const executionEnvironmentContext = { name: 'ctx' };
		const action = new AccountSetupCiAction({
			projectFolder: '/repo/src',
			executionPath: '/repo',
			sdkPath: '/sdk-home',
			executionEnvironmentContext,
			commandMetadata: { name: 'account:setup:ci' },
		});

		const params = {
			account: '12345_SB1',
			authid: 'lucas_wsl_sandbox',
			certificateid: 'cert-id',
			privatekeypath: '/tmp/key.pem',
			clientid: 'client-id',
			scope: 'rest_webservices restlets',
		};
		const expectedResult = { status: 'SUCCESS' };
		authenticateCi.mockResolvedValue(expectedResult);

		const result = await action.execute(params);

		expect(result).toBe(expectedResult);
		expect(validateMachineToMachineAuthIsAllowed).toHaveBeenCalledTimes(1);
		expect(authenticateCi).toHaveBeenCalledWith(params, '/sdk-home', '/repo/src', executionEnvironmentContext);
	});
});
