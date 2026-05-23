import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Session } from './schemas/session.schema';

@Injectable()
export class SessionsService {
  constructor(@InjectModel(Session.name) private sessionModel: Model<Session>) {}

  async findOrCreate(deviceId: string): Promise<Session> {
    let session = await this.sessionModel.findOne({ deviceId }).exec();
    if (!session) {
      session = new this.sessionModel({ deviceId });
      await session.save();
    }
    return session;
  }

  async updateSession(deviceId: string, update: Partial<Session>): Promise<Session> {
    const session = await this.sessionModel.findOneAndUpdate({ deviceId }, update, { returnDocument: 'after' }).exec();
    if (!session) {
       throw new Error(`Session for device ${deviceId} not found`);
    }
    return session;
    }
}