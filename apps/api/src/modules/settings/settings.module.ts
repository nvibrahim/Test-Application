import { Global, Module } from '@nestjs/common';
import { SettingsReader } from './settings-reader';

@Global()
@Module({ providers: [SettingsReader], exports: [SettingsReader] })
export class SettingsModule {}
