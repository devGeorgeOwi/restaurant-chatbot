import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MenuItem } from './schemas/menu-item.schema';

@Injectable()
export class MenuService {
  constructor(@InjectModel(MenuItem.name) private menuModel: Model<MenuItem>) {}

  async getAvailableMenu(): Promise<MenuItem[]> {
    return this.menuModel.find({ available: true }).exec();
  }
}