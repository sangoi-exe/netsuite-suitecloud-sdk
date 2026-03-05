jest.mock('../../../../src/commands/base/BaseAction');
jest.mock('../../../../src/SdkExecutor');
jest.mock('../../../../src/services/NodeTranslationService');

const SdkExecutor = require('../../../../src/SdkExecutor');
const NodeTranslationService = require('../../../../src/services/NodeTranslationService');

const sdkExecutorExecuteMock = jest.spyOn(SdkExecutor.prototype, 'execute');
const nodeTranslationServiceGetMessageMock = jest.spyOn(NodeTranslationService, 'getMessage');

const AuthenticateActionResult = require('../../../../src/services/actionresult/AuthenticateActionResult');
const SetupAction = require('../../../../src/commands/account/setup/SetupAction');

const AUTH_MODE = {
	OAUTH: 'OAUTH',
	REUSE: 'REUSE',
};

describe('SetupAction execute(params)', () => {
	afterEach(() => {
		jest.clearAllMocks();
	});

	it('should fail when an execution error message is returned from core services', async () => {
		// given
		const setupAction = new SetupAction({});
		const mockedExecutionExceptionMessage = 'My mocked execution exception';
		// needed to avoid missing spinner message
		nodeTranslationServiceGetMessageMock.mockReturnValue('My mocked spinner message');
		sdkExecutorExecuteMock.mockImplementation(() => {
			return Promise.reject(mockedExecutionExceptionMessage);
		});

		// when
		const actionResult = await setupAction.execute({ mode: AUTH_MODE.OAUTH, });

		// then
		const expectedResult = AuthenticateActionResult.Builder.withErrors([mockedExecutionExceptionMessage]).build();
		expect(actionResult.isSuccess()).toBe(false);
		expect(actionResult.errorMessages).toStrictEqual(expectedResult.errorMessages);
	});

	it('should forward optional scope and clientid to authenticate SDK execution context', async () => {
		// given
		const setupAction = new SetupAction({});
		nodeTranslationServiceGetMessageMock.mockReturnValue('My mocked spinner message');
		let capturedExecutionContext;
		sdkExecutorExecuteMock.mockImplementation((executionContext) => {
			capturedExecutionContext = executionContext;
			return Promise.reject('forced failure');
		});

		// when
		const actionResult = await setupAction.execute({
			mode: AUTH_MODE.OAUTH,
			authid: 'lucas_wsl_sandbox',
			clientid: 'custom-client-id',
			scope: 'rest_webservices restlets',
			url: 'https://system.netsuite.com',
		});

		// then
		expect(actionResult.isSuccess()).toBe(false);
		expect(capturedExecutionContext).toBeDefined();
		expect(capturedExecutionContext.getParams()).toMatchObject({
			'-authid': 'lucas_wsl_sandbox',
			'-clientid': 'custom-client-id',
			'-scope': 'rest_webservices restlets',
			'-url': 'https://system.netsuite.com',
		});
	});
});
