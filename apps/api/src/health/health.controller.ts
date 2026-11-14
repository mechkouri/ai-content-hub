import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Is the process up? Cheap, never touches the database: for "restart it if this fails". */
  @Get()
  check() {
    return { status: 'ok', service: 'api', time: new Date().toISOString() };
  }

  /** Can it serve requests? Checks the database too: for "send traffic here only if this passes". */
  @Get('ready')
  async ready() {
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000).unref()),
      ]);
    } catch {
      throw new ServiceUnavailableException('The database is not reachable');
    }
    return { status: 'ready', time: new Date().toISOString() };
  }
}
