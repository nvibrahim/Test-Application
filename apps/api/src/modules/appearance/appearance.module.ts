import { Module } from '@nestjs/common';
import { AppearanceController } from './appearance.controller';

@Module({ controllers: [AppearanceController] })
export class AppearanceModule {}
