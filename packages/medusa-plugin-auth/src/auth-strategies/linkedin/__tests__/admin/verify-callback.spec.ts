import { ConfigModule, MedusaContainer } from '@medusajs/medusa/dist/types/global';
import { AUTH_PROVIDER_KEY } from '../../../../types';
import { LinkedinAdminStrategy } from '../../admin';
import { LinkedinAuthOptions, LINKEDIN_ADMIN_STRATEGY_NAME, Profile } from '../../types';

describe('Linkedin admin strategy verify callback', function () {
	const existsEmail = 'exists@test.fr';
	const existsEmailWithProviderKey = 'exist3s@test.fr';
	const existsEmailWithWrongProviderKey = 'exist4s@test.fr';

	let container: MedusaContainer;
	let req: Request;
	let accessToken: string;
	let refreshToken: string;
	let profile: Profile;
	let linkedinAdminStrategy: LinkedinAdminStrategy;

	beforeEach(() => {
		profile = {
			emails: [{ value: existsEmail }],
		};

		container = {
			resolve: (name: string) => {
				const container_ = {
					userService: {
						retrieveByEmail: jest.fn().mockImplementation(async (email: string) => {
							if (email === existsEmail) {
								return {
									id: 'test',
								};
							}

							if (email === existsEmailWithProviderKey) {
								return {
									id: 'test2',
									metadata: {
										[AUTH_PROVIDER_KEY]: LINKEDIN_ADMIN_STRATEGY_NAME,
									},
								};
							}

							if (email === existsEmailWithWrongProviderKey) {
								return {
									id: 'test3',
									metadata: {
										[AUTH_PROVIDER_KEY]: 'fake_provider_key',
									},
								};
							}

							return;
						}),
					},
				};

				return container_[name];
			},
		} as MedusaContainer;

		linkedinAdminStrategy = new LinkedinAdminStrategy(
			container,
			{} as ConfigModule,
			{ clientID: 'fake', clientSecret: 'fake', admin: {} } as LinkedinAuthOptions
		);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it('should succeed', async () => {
		profile = {
			emails: [{ value: existsEmailWithProviderKey }],
		};

		const data = await linkedinAdminStrategy.validate(req, accessToken, refreshToken, profile);
		expect(data).toEqual(
			expect.objectContaining({
				id: 'test2',
			})
		);
	});

	it('should fail when a user exists without the auth provider metadata', async () => {
		profile = {
			emails: [{ value: existsEmail }],
		};

		const err = await linkedinAdminStrategy.validate(req, accessToken, refreshToken, profile).catch((err) => err);
		expect(err).toEqual(new Error(`Admin with email ${existsEmail} already exists`));
	});

	it('should fail when a user exists with the wrong auth provider key', async () => {
		profile = {
			emails: [{ value: existsEmailWithWrongProviderKey }],
		};

		const err = await linkedinAdminStrategy.validate(req, accessToken, refreshToken, profile).catch((err) => err);
		expect(err).toEqual(new Error(`Admin with email ${existsEmailWithWrongProviderKey} already exists`));
	});

	it('should fail when the user does not exist', async () => {
		profile = {
			emails: [{ value: 'fake' }],
		};

		const err = await linkedinAdminStrategy.validate(req, accessToken, refreshToken, profile).catch((err) => err);
		expect(err).toEqual(new Error(`Unable to authenticate the user with the email fake`));
	});
});
