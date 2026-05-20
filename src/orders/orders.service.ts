import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order } from './schemas/order.schema';

@Injectable()
export class OrdersService {
  constructor(@InjectModel(Order.name) private orderModel: Model<Order>) {}

  async findCurrentOrder(sessionId: string, status = 'pending'): Promise<Order | null> {
    return this.orderModel.findOne({ sessionId, status }).populate('items.menuItem').exec();
  }

  async getOrderHistory(sessionId: string): Promise<Order[]> {
    return this.orderModel.find({ sessionId, status: { $ne: 'cancelled' } })
      .sort({ createdAt: -1 }).populate('items.menuItem').exec();
  }

  async createOrUpdateOrder(sessionId: string, item: any): Promise<Order> {
    let order = await this.orderModel.findOne({ sessionId, status: 'pending' }).exec();
    if (!order) {
      order = new this.orderModel({ sessionId, items: [], total: 0, status: 'pending' });
    }
    order.items.push(item);
    order.total = order.items.reduce((sum, i) => sum + i.priceAtOrder * i.quantity, 0);
    return order.save();
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.orderModel.findByIdAndUpdate(orderId, { status: 'cancelled' }).exec();
  }

 async updateOrderStatus(orderId: string, status: string, reference?: string): Promise<Order> {
  const update: any = { status };
  if (reference) update.paymentReference = reference;
  const order = await this.orderModel.findByIdAndUpdate(orderId, update, { new: true }).exec();
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }
  return order;
}
}