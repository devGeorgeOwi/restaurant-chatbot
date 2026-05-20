import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema()
export class Session extends Document {
  @Prop({ required: true, unique: true })
  deviceId: string;

  @Prop({ default: 'mainMenu' })
  currentStep: string;

  @Prop({ type: Types.ObjectId, ref: 'Order', default: null })
  currentOrder: Types.ObjectId | null;

  @Prop({ type: Object })
  temporaryData: Record<string, any>;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const SessionSchema = SchemaFactory.createForClass(Session);