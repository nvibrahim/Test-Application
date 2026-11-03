import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import * as en from '@zxcvbn-ts/language-en';
import { z } from 'zod';

/**
 * Password rules, one implementation for the browser and the API. The values come from
 * Settings -> Security (Phase 4); these are the defaults the owner decided on.
 */
export const passwordRulesSchema = z.object({
  minLength: z.number().int().min(8).max(64).default(8),
  superAdminMinLength: z.number().int().min(8).max(64).default(12),
  maxLength: z.literal(128).default(128),
  minStrengthScore: z.number().int().min(2).max(4).default(3),
  breachedPasswordCheck: z.boolean().default(true),
  historyCount: z.number().int().min(0).max(24).default(5),
  /** 0 = never expires */
  expiryDays: z.number().int().min(0).max(365).default(0),
});
export type PasswordRules = z.infer<typeof passwordRulesSchema>;
export const defaultPasswordRules: PasswordRules = passwordRulesSchema.parse({});

export const PASSWORD_MAX_LENGTH = 128;

let checker: ZxcvbnFactory | undefined;
function strength(): ZxcvbnFactory {
  checker ??= new ZxcvbnFactory({
    translations: en.translations,
    graphs: common.adjacencyGraphs,
    dictionary: { ...common.dictionary, ...en.dictionary },
  });
  return checker;
}

export interface PasswordContext {
  email?: string | null;
  fullName?: string | null;
  organizationName?: string | null;
  appName?: string | null;
  isSuperAdmin?: boolean;
}

export type PasswordProblem =
  | { code: 'too_short'; minLength: number }
  | { code: 'too_long'; maxLength: number }
  | { code: 'contains_personal'; word: string }
  | { code: 'too_weak'; score: number; warning: string; suggestions: string[] }
  | { code: 'breached' }
  | { code: 'reused' };

export interface PasswordEvaluation {
  ok: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  problems: PasswordProblem[];
}

/** Words of three letters or more from the person's own details; a password must not contain them. */
export function personalWords(context: PasswordContext): string[] {
  const words = new Set<string>();
  const add = (value?: string | null) => {
    for (const part of (value ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
      if (part.length >= 3) words.add(part);
    }
  };
  add(context.email?.split('@')[0]);
  add(context.fullName);
  add(context.organizationName);
  add(context.appName);
  return [...words];
}

/**
 * Checks length, personal words and strength. The breached-password and history checks need
 * the server (network and database); the API adds `breached` or `reused` to the problems.
 */
export function evaluatePassword(
  password: string,
  rules: PasswordRules = defaultPasswordRules,
  context: PasswordContext = {},
): PasswordEvaluation {
  const problems: PasswordProblem[] = [];
  const minLength = context.isSuperAdmin ? rules.superAdminMinLength : rules.minLength;

  if (password.length < minLength) problems.push({ code: 'too_short', minLength });
  if (password.length > PASSWORD_MAX_LENGTH)
    problems.push({ code: 'too_long', maxLength: PASSWORD_MAX_LENGTH });

  const lower = password.toLowerCase();
  const personal = personalWords(context);
  const hit = personal.find((w) => lower.includes(w));
  if (hit) problems.push({ code: 'contains_personal', word: hit });

  const result = strength().check(password.slice(0, PASSWORD_MAX_LENGTH), personal);
  const score = result.score as 0 | 1 | 2 | 3 | 4;
  if (score < rules.minStrengthScore) {
    problems.push({
      code: 'too_weak',
      score,
      warning: result.feedback.warning ?? '',
      suggestions: result.feedback.suggestions,
    });
  }

  return { ok: problems.length === 0, score, problems };
}

/** One plain sentence per problem, for forms and API messages. */
export function describePasswordProblem(problem: PasswordProblem): string {
  switch (problem.code) {
    case 'too_short':
      return `Use at least ${problem.minLength} characters.`;
    case 'too_long':
      return `Use at most ${problem.maxLength} characters.`;
    case 'contains_personal':
      return 'Do not include your name, email, organization or the product name.';
    case 'too_weak':
      return problem.warning
        ? `${problem.warning}. ${problem.suggestions[0] ?? 'Try a longer phrase of unrelated words.'}`
        : (problem.suggestions[0] ??
            'This password is too easy to guess. Try a longer phrase of unrelated words.');
    case 'breached':
      return 'This password has appeared in a data breach. Choose a different one.';
    case 'reused':
      return 'You have used this password before. Choose a different one.';
  }
}
