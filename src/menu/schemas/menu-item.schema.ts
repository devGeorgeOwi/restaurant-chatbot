import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class MenuItem extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  price: number;    // in kobo

  @Prop()
  description: string;

  @Prop({ default: true })
  available: boolean;
}

export const MenuItemSchema = SchemaFactory.createForClass(MenuItem);