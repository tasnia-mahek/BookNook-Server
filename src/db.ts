import { Collection, Db, MongoClient } from 'mongodb';
import { config } from './config.js';

export type User = { _id?: import('mongodb').ObjectId; id?: string; name: string; email: string; image?: string | null };
export type Book = {
  _id?: import('mongodb').ObjectId;
  title: string; author: string; category: string; image: string; description: string;
  addedBy: { name: string; email: string; photoUrl?: string }; totalCopies: number;
  availableCopies: number; addedAt: Date;
};
export type Borrow = {
  _id?: import('mongodb').ObjectId; bookId: import('mongodb').ObjectId; bookTitle: string;
  bookImage: string; userEmail: string; userName: string; borrowDate: Date; returnDate: Date;
};

export type Database = {
  client: MongoClient; db: Db; users: Collection<User>; books: Collection<Book>; borrows: Collection<Borrow>;
};

export async function connectDatabase(): Promise<Database> {
  const client = new MongoClient(config.mongoUri);
  await client.connect();
  const db = client.db(config.mongoDb);
  const books = db.collection<Book>('books');
  const borrows = db.collection<Borrow>('borrows');
  await borrows.createIndex({ bookId: 1, userEmail: 1 }, { unique: true });
  await books.createIndex({ addedAt: -1 });
  return { client, db, users: db.collection<User>('user'), books, borrows };
}
