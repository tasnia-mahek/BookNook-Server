import { ObjectId } from 'mongodb';
import { Response } from 'express';
export const objectId = (value: string | string[]) => Array.isArray(value) || !ObjectId.isValid(value) ? null : new ObjectId(value);
export const fail = (res: Response, message: string, status = 400) => res.status(status).json({ message });
export const categories = new Set(['Fiction', 'Science', 'History', 'Kids', 'Others']);
