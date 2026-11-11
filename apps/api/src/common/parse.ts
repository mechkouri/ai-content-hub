import { BadRequestException } from '@nestjs/common';
import { ZodType, ZodTypeDef } from 'zod';

// Input and output types may differ (defaults, transforms), so the input type is left open.
export function parseBody<T>(schema: ZodType<T, ZodTypeDef, unknown>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten().fieldErrors);
  }
  return result.data;
}
