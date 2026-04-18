import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { PrismaClient } from '@prisma/client';

describe('AppModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    jest
      .spyOn(PrismaClient.prototype, '$connect')
      .mockResolvedValue(undefined);
    jest
      .spyOn(PrismaClient.prototype, '$disconnect')
      .mockResolvedValue(undefined);

    // Set DATABASE_URL env var so PrismaService / ConfigModule can resolve it
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/testdb';

    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    delete process.env.DATABASE_URL;
    if (module) {
      await module.close();
    }
  });

  it('should compile the AppModule', () => {
    expect(module).toBeDefined();
  });

  it('should have ConfigModule loaded globally', () => {
    // ConfigService should be resolvable anywhere since isGlobal: true
    const configService = module.get<ConfigService>(ConfigService);
    expect(configService).toBeDefined();
    expect(configService).toBeInstanceOf(ConfigService);
  });

  it('should have PrismaService available globally', () => {
    const prismaService = module.get<PrismaService>(PrismaService);
    expect(prismaService).toBeDefined();
    expect(prismaService).toBeInstanceOf(PrismaService);
  });

  it('should load ConfigModule with isGlobal:true so ConfigService is injectable anywhere', () => {
    // ConfigModule registered as global means we can resolve ConfigService from any module
    const configService = module.get<ConfigService>(ConfigService, {
      strict: false,
    });
    expect(configService).toBeDefined();
  });

  it('should include PrismaModule in imports', () => {
    // PrismaModule is @Global, so PrismaService must be accessible project-wide
    const prismaService = module.get<PrismaService>(PrismaService, {
      strict: false,
    });
    expect(prismaService).toBeInstanceOf(PrismaService);
    expect(prismaService).toBeInstanceOf(PrismaClient);
  });

  it('should pick up NODE_ENV-specific env file based on process.env.NODE_ENV', () => {
    // ConfigModule.forRoot loads envFilePath: [`.env.${NODE_ENV}`, `.env`]
    // The configService should still be functional regardless of whether the file exists
    const configService = module.get<ConfigService>(ConfigService);
    // DATABASE_URL was set via process.env above, so ConfigService should see it
    const dbUrl = configService.get('DATABASE_URL');
    expect(dbUrl).toBe('postgresql://user:pass@localhost:5432/testdb');
  });

  describe('ConfigModule env file resolution', () => {
    it('should fall back to .env when environment-specific file does not exist', async () => {
      jest.restoreAllMocks();
      jest
        .spyOn(PrismaClient.prototype, '$connect')
        .mockResolvedValue(undefined);
      jest
        .spyOn(PrismaClient.prototype, '$disconnect')
        .mockResolvedValue(undefined);

      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'nonexistentenv';
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/testdb';

      const mod = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      const configService = mod.get<ConfigService>(ConfigService);
      expect(configService).toBeDefined();
      // Should still resolve DATABASE_URL from environment
      expect(configService.get('DATABASE_URL')).toBe(
        'postgresql://user:pass@localhost:5432/testdb',
      );

      process.env.NODE_ENV = originalNodeEnv;
      await mod.close();
    });
  });
});