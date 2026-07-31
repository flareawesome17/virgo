import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { CollaboratorsService } from './collaborators.service';
import {
  CreateCollaboratorDto,
  ListCollaboratorsDto,
  UpdateCollaboratorDto,
} from './dto/collaborator.dto';

@Controller('collaborators')
export class CollaboratorsController {
  constructor(private readonly collaborators: CollaboratorsService) {}

  @Get()
  async list(
    @CurrentUser('id') userId: string,
    @Query() query: ListCollaboratorsDto,
  ) {
    const filters = { workspace_id: query.workspace_id, role: query.role };
    const [data, total] = await Promise.all([
      this.collaborators.list(userId, { ...query, filters }),
      this.collaborators.count(userId, filters),
    ]);
    return { data, total };
  }

  @Get(':id')
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.collaborators.get(userId, id);
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateCollaboratorDto) {
    return this.collaborators.create(userId, { ...dto });
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCollaboratorDto,
  ) {
    return this.collaborators.update(userId, id, { ...dto });
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.collaborators.remove(userId, id);
  }
}
