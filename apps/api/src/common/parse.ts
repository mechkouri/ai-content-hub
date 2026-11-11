import { BadRequestException } from '@nestjs/common';
import { ZodSchema } from 'zod';

export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten().fieldErrors);
  }
  return result.data;
}
