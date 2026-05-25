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
 // ---- New dashboard methods ----

  async findAll(): Promise<MenuItem[]> {
    return this.menuModel.find().exec();
  }

  async findById(id: string): Promise<MenuItem | null> {
    return this.menuModel.findById(id).exec();
  }

  async create(item: Partial<MenuItem>): Promise<MenuItem> {
    const newItem = new this.menuModel(item);
    return newItem.save();
  }

  async update(id: string, update: Partial<MenuItem>): Promise<MenuItem | null> {
    return this.menuModel.findByIdAndUpdate(id, update, { returnDocument: 'after' }).exec();
  }

  async delete(id: string): Promise<MenuItem | null> {
    return this.menuModel.findByIdAndDelete(id).exec();
  }
}