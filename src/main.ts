import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger();
  const port = process.env.PORT || 3000;

  await app.listen(port, '0.0.0.0', () => {
    logger.log(`Application running on port ${port}`);
  });
}
bootstrap();
