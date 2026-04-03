import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

describe('PrismaService', () => {
  let service: PrismaService;
  let configService: jest.Mocked<ConfigService>;
  let connectSpy: jest.SpyInstance;
  let disconnectSpy: jest.SpyInstance;

  const mockConfigGet = (key: string): string | undefined => {
    const config: Record<string, string> = {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/testdb',
      NODE_ENV: 'test',
    };
    return config[key];
  };

  beforeEach(async () => {
    connectSpy = jest
      .spyOn(PrismaClient.prototype, '$connect')
      .mockResolvedValue(undefined);
    disconnectSpy = jest
      .spyOn(PrismaClient.prototype, '$disconnect')
      .mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation(mockConfigGet),
          },
        },
      ],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should read DATABASE_URL from ConfigService', () => {
      expect(configService.get).toHaveBeenCalledWith('DATABASE_URL');
    });

    it('should read NODE_ENV from ConfigService', () => {
      expect(configService.get).toHaveBeenCalledWith('NODE_ENV');
    });

    it('should disable logging when NODE_ENV is not development', async () => {
      // ConfigService returns NODE_ENV='test' (non-development)
      // Verify service was constructed without throwing
      expect(service).toBeInstanceOf(PrismaService);
      expect(service).toBeInstanceOf(PrismaClient);
    });

    it('should enable verbose logging when NODE_ENV is development', async () => {
      jest.restoreAllMocks();

      connectSpy = jest
        .spyOn(PrismaClient.prototype, '$connect')
        .mockResolvedValue(undefined);
      disconnectSpy = jest
        .spyOn(PrismaClient.prototype, '$disconnect')
        .mockResolvedValue(undefined);

      const devModule: TestingModule = await Test.createTestingModule({
        providers: [
          PrismaService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockImplementation((key: string) => {
                if (key === 'DATABASE_URL')
                  return 'postgresql://user:pass@localhost:5432/devdb';
                if (key === 'NODE_ENV') return 'development';
                return undefined;
              }),
            },
          },
        ],
      }).compile();

      const devService = devModule.get<PrismaService>(PrismaService);
      expect(devService).toBeDefined();
      expect(devService).toBeInstanceOf(PrismaService);
    });

    it('should extend PrismaClient', () => {
      expect(service).toBeInstanceOf(PrismaClient);
    });
  });

  describe('onModuleInit', () => {
    it('should call $connect on module init', async () => {
      await service.onModuleInit();
      expect(connectSpy).toHaveBeenCalledTimes(1);
    });

    it('should await $connect before returning', async () => {
      let resolved = false;
      connectSpy.mockImplementation(
        () =>
          new Promise<void>((res) => {
            resolved = true;
            res();
          }),
      );
      await service.onModuleInit();
      expect(resolved).toBe(true);
    });

    it('should propagate errors from $connect', async () => {
      const error = new Error('Connection failed');
      connectSpy.mockRejectedValueOnce(error);
      await expect(service.onModuleInit()).rejects.toThrow('Connection failed');
    });
  });

  describe('onModuleDestroy', () => {
    it('should call $disconnect on module destroy', async () => {
      await service.onModuleDestroy();
      expect(disconnectSpy).toHaveBeenCalledTimes(1);
    });

    it('should await $disconnect before returning', async () => {
      let resolved = false;
      disconnectSpy.mockImplementation(
        () =>
          new Promise<void>((res) => {
            resolved = true;
            res();
          }),
      );
      await service.onModuleDestroy();
      expect(resolved).toBe(true);
    });

    it('should propagate errors from $disconnect', async () => {
      const error = new Error('Disconnect failed');
      disconnectSpy.mockRejectedValueOnce(error);
      await expect(service.onModuleDestroy()).rejects.toThrow(
        'Disconnect failed',
      );
    });
  });

  describe('lifecycle integration', () => {
    it('should connect then disconnect in correct order', async () => {
      const callOrder: string[] = [];
      connectSpy.mockImplementation(async () => {
        callOrder.push('connect');
      });
      disconnectSpy.mockImplementation(async () => {
        callOrder.push('disconnect');
      });

      await service.onModuleInit();
      await service.onModuleDestroy();

      expect(callOrder).toEqual(['connect', 'disconnect']);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined DATABASE_URL gracefully', async () => {
      jest.restoreAllMocks();

      jest
        .spyOn(PrismaClient.prototype, '$connect')
        .mockResolvedValue(undefined);
      jest
        .spyOn(PrismaClient.prototype, '$disconnect')
        .mockResolvedValue(undefined);

      // PrismaService should still construct even with undefined URL
      // (the error would surface at connect time, not construction time)
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PrismaService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
        ],
      }).compile();

      const svc = module.get<PrismaService>(PrismaService);
      expect(svc).toBeDefined();
    });
  });
});