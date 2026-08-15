import { SetMetadata } from '@nestjs/common/decorators/core/set-metadata.decorator';
import { UserRole } from 'src/common/enums/user-role.enum';

export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);
