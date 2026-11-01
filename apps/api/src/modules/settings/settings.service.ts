import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import {
  adminEventKeys,
  generalSettingsSchema,
  appearanceSettingsSchema,
  maintenanceSettingsSchema,
  settingsSections,
  settingsSecretKeys,
  type PublicSettings,
  type SettingsSectionKey,
  type SettingsSectionResponse,
} from '@inspower/shared';
import type { ZodType } from 'zod';
import { effectiveKey, type Env } from '../../platform/config/config';
import { ENV } from '../../platform/config/config.module';
import { seal } from '../../platform/crypto/crypto';
import { PrismaService } from '../../platform/database/prisma.service';
import { ApiException } from '../../platform/http/api-error';
import { TransactionService } from '../../platform/transaction/transaction.service';
import type { AuthContext } from '../access/request-context';
import { ctxOf } from '../auth/credentials.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrganizationService } from '../organization/organization.service';
import { SettingsReader } from './settings-reader';

void adminEventKeys;

@Injectable()
export class SettingsService {
  private readonly key: Buffer;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly reader: SettingsReader,
    private readonly transactions: TransactionService,
    private readonly organizations: OrganizationService,
    private readonly notifications: NotificationsService,
  ) {
    this.key = effectiveKey(env, 'AUTH_ENCRYPTION_KEY');
  }

  schemaFor(section: string): ZodType<unknown> {
    const schema = (settingsSections as Record<string, ZodType<unknown>>)[section];
    if (!schema) throw new ApiException('not_found', 'Unknown settings section');
    return schema;
  }

  /** The section as the screen sees it: values with defaults, secrets as "set", who saved it last. */
  async read(
    organizationId: string,
    section: SettingsSectionKey,
  ): Promise<SettingsSectionResponse> {
    const schema = this.schemaFor(section);
    const value = (await this.reader.read(organizationId, section, schema)) as Record<
      string,
      unknown
    >;
    const rows = await this.prisma.appSetting.findMany({
      where: { organizationId, section },
      orderBy: { updatedAt: 'desc' },
    });
    const secretsSet = rows.filter((r) => r.isSecret).map((r) => r.key);
    const latest = rows[0];
    const by = latest?.updatedBy
      ? await this.prisma.user.findUnique({
          where: { id: latest.updatedBy },
          select: { fullName: true },
        })
      : null;
    return {
      section,
      value,
      secretsSet,
      updatedAt: latest?.updatedAt.toISOString() ?? null,
      updatedByName: by?.fullName ?? null,
    };
  }

  /**
   * Saves one section: validates the whole value, writes one row per top-level key, seals the
   * secrets (a secret left out or empty keeps its saved value), drops the cache, audits with
   * before and after (secrets never in the audit), and announces the change.
   */
  async write(
    req: Request,
    auth: AuthContext,
    section: SettingsSectionKey,
    input: Record<string, unknown>,
  ): Promise<SettingsSectionResponse> {
    const schema = this.schemaFor(section);
    const secretKeys = settingsSecretKeys[section] ?? [];
    const secrets: Record<string, string> = {};
    const plain: Record<string, unknown> = { ...input };
    for (const k of secretKeys) {
      const v = plain[k];
      delete plain[k];
      if (typeof v === 'string' && v.length) secrets[k] = v;
    }
    const parsed = schema.safeParse(plain);
    if (!parsed.success) {
      throw new ApiException(
        'validation_failed',
        'The settings are not valid',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    const value = parsed.data as Record<string, unknown>;
    const before = (await this.reader.read(auth.organizationId, section, schema)) as Record<
      string,
      unknown
    >;

    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      for (const [key, v] of Object.entries(value)) {
        await tx.appSetting.upsert({
          where: {
            organizationId_section_key: { organizationId: auth.organizationId, section, key },
          },
          update: { value: v as object, isSecret: false, updatedBy: auth.userId },
          create: {
            organizationId: auth.organizationId,
            section,
            key,
            value: v as object,
            isSecret: false,
            updatedBy: auth.userId,
          },
        });
      }
      for (const [key, secret] of Object.entries(secrets)) {
        const sealed = seal(secret, this.key, `settings:${auth.organizationId}:${section}:${key}`);
        await tx.appSetting.upsert({
          where: {
            organizationId_section_key: { organizationId: auth.organizationId, section, key },
          },
          update: { value: sealed as unknown as object, isSecret: true, updatedBy: auth.userId },
          create: {
            organizationId: auth.organizationId,
            section,
            key,
            value: sealed as unknown as object,
            isSecret: true,
            updatedBy: auth.userId,
          },
        });
      }
      await audit({
        action: `settings.${section}.updated`,
        entityType: 'settings',
        entityId: section,
        changes: { before, after: value, secretsChanged: Object.keys(secrets) },
      });
      await emit({
        name: 'settings.section.updated',
        channels: ['organization'],
        payload: { section },
      });
      if (section === 'security') {
        await this.notifications.notifyAdmins(tx, auth.organizationId, {
          type: 'admin.security_settings_changed',
          title: 'Security settings were changed',
          body: `By ${auth.fullName}.`,
          link: '/admin/settings?section=security',
          adminEvent: 'security.settings_changed',
        });
      }
      if (section === 'maintenance' && before['enabled'] !== value['enabled']) {
        await this.notifications.notifyAdmins(tx, auth.organizationId, {
          type: 'admin.maintenance_changed',
          title: value['enabled'] ? 'Maintenance mode is on' : 'Maintenance mode is off',
          body: `By ${auth.fullName}.`,
          link: '/admin/settings?section=maintenance',
          adminEvent: 'system.maintenance_changed',
        });
      }
    });
    await this.reader.invalidate(auth.organizationId, section);
    return this.read(auth.organizationId, section);
  }

  /** What the browser may know before signing in. */
  async publicSettings(): Promise<PublicSettings> {
    const org = await this.organizations.current();
    if (!org) {
      return {
        appName: this.env.APP_NAME,
        tagline: '',
        supportEmail: null,
        landing: generalSettingsSchema.parse({}).landing,
        appearance: appearanceSettingsSchema.parse({}),
        maintenance: { enabled: false, message: '' },
        organizationName: null,
        version: this.env.APP_VERSION,
      };
    }
    const [general, appearance, maintenance] = await Promise.all([
      this.reader.read(org.id, 'general', generalSettingsSchema),
      this.reader.read(org.id, 'appearance', appearanceSettingsSchema),
      this.reader.read(org.id, 'maintenance', maintenanceSettingsSchema),
    ]);
    return {
      appName: general.appName,
      tagline: general.tagline,
      supportEmail: general.supportEmail,
      landing: general.landing,
      appearance,
      maintenance: { enabled: maintenance.enabled, message: maintenance.message },
      organizationName: org.setupCompletedAt ? org.tradingName || org.legalName : null,
      version: this.env.APP_VERSION,
    };
  }
}
