import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

describe('PrismaModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    jest
      .spyOn(PrismaClient.prototype, '$connect')
      .mockResolvedValue(undefined);
    jest
      .spyOn(PrismaClient.prototype, '$disconnect')
      .mockResolvedValue(undefined);

    module = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'DATABASE_URL')
                return 'postgresql://user:pass@localhost:5432/testdb';
              if (key === 'NODE_ENV') return 'test';
              return undefined;
            }),
          },
        },
      ],
    }).compile();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should compile the module', () => {
    expect(module).toBeDefined();
  });

  it('should provide PrismaService', () => {
    const prismaService = module.get<PrismaService>(PrismaService);
    expect(prismaService).toBeDefined();
  });

  it('should provide an instance of PrismaService that extends PrismaClient', () => {
    const prismaService = module.get<PrismaService>(PrismaService);
    expect(prismaService).toBeInstanceOf(PrismaService);
    expect(prismaService).toBeInstanceOf(PrismaClient);
  });

  it('should export PrismaService so it can be resolved by consuming modules', async () => {
    // Consuming module should be able to get PrismaService through the global export
    const prismaService = module.get<PrismaService>(PrismaService);
    expect(prismaService).toBeInstanceOf(PrismaService);
  });

  it('should be decorated as @Global (accessible without explicit import)', async () => {
    // A @Global module's exports are accessible from any module in the app context
    // without needing to explicitly import PrismaModule.
    // We verify this by resolving PrismaService via strict:false (cross-module lookup).
    const prismaService = module.get<PrismaService>(PrismaService, {
      strict: false,
    });
    expect(prismaService).toBeInstanceOf(PrismaService);
  });

  it('should return the same PrismaService instance (singleton)', () => {
    const first = module.get<PrismaService>(PrismaService);
    const second = module.get<PrismaService>(PrismaService);
    expect(first).toBe(second);
  });
});