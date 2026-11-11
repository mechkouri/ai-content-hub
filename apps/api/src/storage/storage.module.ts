import { Global, Module } from '@nestjs/common';
import { LocalStorageProvider, STORAGE } from './storage';

@Global()
@Module({
  providers: [{ provide: STORAGE, useClass: LocalStorageProvider }],
  exports: [STORAGE],
})
export class StorageModule {}
