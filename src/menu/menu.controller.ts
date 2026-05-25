import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { MenuService } from './menu.service';
import { MenuItem } from './schemas/menu-item.schema';

@Controller('api/menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  async getAll(): Promise<MenuItem[]> {
    return this.menuService.findAll();
  }

  @Get(':id')
  async getOne(@Param('id') id: string): Promise<MenuItem | null> {
    return this.menuService.findById(id);
  }

  @Post()
  async create(@Body() item: Partial<MenuItem>): Promise<MenuItem> {
    // Validation can be added with class-validator later if needed
    return this.menuService.create(item);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() update: Partial<MenuItem>,
  ): Promise<MenuItem | null> {
    return this.menuService.update(id, update);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<MenuItem | null> {
    return this.menuService.delete(id);
  }
}