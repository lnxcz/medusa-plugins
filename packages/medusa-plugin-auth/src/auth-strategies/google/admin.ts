import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth2';
import jwt from 'jsonwebtoken';
import { ConfigModule, MedusaContainer } from '@medusajs/medusa/dist/types/global';
import { ADMIN_AUTH_TOKEN_COOKIE_NAME, TWENTY_FOUR_HOURS_IN_MS } from '../../types';
import { UserService } from '@medusajs/medusa';
import formatRegistrationName from '@medusajs/medusa/dist/utils/format-registration-name';
import { MedusaError } from 'medusa-core-utils';
import { Router } from 'express';
import cors from 'cors';
import { getCookieOptions } from '../../utils/get-cookie-options';
import { GoogleAuthOptions } from './types';

const GOOGLE_ADMIN_STRATEGY_NAME = 'google.admin.medusa-auth-plugin';

/**
 * Load the google strategy and attach the given verifyCallback or use the default implementation
 * @param container
 * @param configModule
 * @param google
 */
export function loadGoogleAdminStrategy(
	container: MedusaContainer,
	configModule: ConfigModule,
	google: GoogleAuthOptions
): void {
	const verifyCallbackFn: GoogleAuthOptions['admin']['verifyCallback'] =
		google.admin.verifyCallback ?? verifyAdminCallback;

	passport.use(
		GOOGLE_ADMIN_STRATEGY_NAME,
		new GoogleStrategy(
			{
				clientID: google.clientID,
				clientSecret: google.clientSecret,
				callbackURL: google.admin.callbackUrl,
				passReqToCallback: true,
			},
			async (
				req: Request & { session: { jwt: string } },
				accessToken: string,
				refreshToken: string,
				profile: { emails: { value: string }[]; name?: { givenName?: string; familyName?: string } },
				done: (err: null | unknown, data: null | { id: string }) => void
			) => {
				const done_ = (err: null | unknown, data: null | { id: string }) => {
					if (err) {
						return done(err, null);
					}
					done(null, data);
				};

				await verifyCallbackFn(container, req, accessToken, refreshToken, profile, done_);
			}
		)
	);
}

/**
 * Return the router that hold the google admin authentication routes
 * @param google
 * @param configModule
 */
export function getGoogleAdminAuthRouter(google: GoogleAuthOptions, configModule: ConfigModule): Router {
	const router = Router();

	const adminCorsOptions = {
		origin: configModule.projectConfig.admin_cors.split(','),
		credentials: true,
	};

	router.get(google.admin.authPath, cors(adminCorsOptions));
	router.get(
		google.admin.authPath,
		passport.authenticate(GOOGLE_ADMIN_STRATEGY_NAME, {
			scope: [
				'https://www.googleapis.com/auth/userinfo.email',
				'https://www.googleapis.com/auth/userinfo.profile',
			],
			session: false,
		})
	);

	const callbackHandler = (req, res) => {
		const token = jwt.sign({ userId: req.user.id }, configModule.projectConfig.jwt_secret, {
			expiresIn: google.admin.expiresIn ?? TWENTY_FOUR_HOURS_IN_MS,
		});
		res.cookie(ADMIN_AUTH_TOKEN_COOKIE_NAME, token, getCookieOptions()).redirect(google.admin.successRedirect);
	};

	router.get(google.admin.authCallbackPath, cors(adminCorsOptions));
	router.get(
		google.admin.authCallbackPath,
		(req, res, next) => {
			if (req.user) {
				callbackHandler(req, res);
			}

			next();
		},
		passport.authenticate(GOOGLE_ADMIN_STRATEGY_NAME, {
			failureRedirect: google.admin.failureRedirect,
			session: false,
		}),
		callbackHandler
	);

	return router;
}

/**
 * Default callback to execute when the strategy is called.
 * @param container
 * @param req
 * @param accessToken
 * @param refreshToken
 * @param profile
 * @param done
 */
export async function verifyAdminCallback(
	container: MedusaContainer,
	req: Request,
	accessToken: string,
	refreshToken: string,
	profile: { emails: { value: string }[]; name?: { givenName?: string; familyName?: string } },
	done: (err: null | unknown, data: null | { id: string }) => void
): Promise<void> {
	const userService: UserService = container.resolve(formatRegistrationName(`${process.cwd()}/services/user.js`));
	const email = profile.emails?.[0]?.value;

	if (!email) {
		const err = new MedusaError(
			MedusaError.Types.NOT_ALLOWED,
			`Your Google account does not contains any email and cannot be used`
		);
		return done(err, null);
	}

	const user = await userService.retrieveByEmail(email).catch(() => void 0);
	if (!user) {
		const err = new MedusaError(
			MedusaError.Types.NOT_ALLOWED,
			`Unable to authenticate the user with the email ${email}`
		);
		return done(err, null);
	}

	return done(null, { id: user.id });
}
