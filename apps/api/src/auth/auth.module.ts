import { Global, Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { TOKEN_VERIFIER } from './auth.types';
import { SupabaseTokenVerifier } from './supabase-token.verifier';

@Global()
@Module({
  providers: [AuthGuard, { provide: TOKEN_VERIFIER, useClass: SupabaseTokenVerifier }],
  exports: [AuthGuard, TOKEN_VERIFIER],
})
export class AuthModule {}
