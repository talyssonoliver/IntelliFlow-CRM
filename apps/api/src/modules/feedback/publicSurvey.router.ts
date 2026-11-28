/**
 * Public survey answer router (MVP-012): the two calls behind /feedback/<token>, no sign-in.
 *
 * The token is the only input that finds a survey (strict schemas: no tenant or id from the body).
 * Unknown, unsent, used and expired links answer with a status, never an error that tells a probe
 * more than that. The only tenant data returned is the company name. A per-IP throttle (hashed IP,
 * as the other public endpoints) runs before any database read.
 */
import { createTRPCRouter, publicProcedure } from '../../trpc';
import { publicSurveyLookupSchema, publicSurveySubmitSchema } from '@intelliflow/validators';
import { PublicRateLimiter } from '../../security/public-rate-limiter';
import { extractClientIp } from '../public-feedback/public-feedback.router';
import { lookupPublicSurvey, submitPublicSurvey, type SurveyDb } from './survey-service';

export const surveyLookupLimiter = new PublicRateLimiter({ windowMs: 250 });
export const surveySubmitLimiter = new PublicRateLimiter({ windowMs: 2000 });

function ipKey(req: Request | undefined): string {
  const salt = process.env.PUBLIC_FEEDBACK_IP_SALT ?? 'mvp-012-dev-salt';
  return PublicRateLimiter.hashIp(extractClientIp(req), salt);
}

export const publicSurveyRouter = createTRPCRouter({
  get: publicProcedure.input(publicSurveyLookupSchema).query(async ({ ctx, input }) => {
    surveyLookupLimiter.check(ipKey(ctx.req));
    return lookupPublicSurvey(ctx.prisma as unknown as SurveyDb, input.token);
  }),

  submit: publicProcedure.input(publicSurveySubmitSchema).mutation(async ({ ctx, input }) => {
    surveySubmitLimiter.check(ipKey(ctx.req));
    return submitPublicSurvey(ctx.prisma as unknown as SurveyDb, input);
  }),
});
