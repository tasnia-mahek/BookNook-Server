import 'dotenv/config';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import express, { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import morgan from 'morgan';
import { Collection, Db, MongoClient, ObjectId } from 'mongodb';

type User = { name: string; email: string; photoUrl?: string };
type Book = {
  _id?: ObjectId; title: string; author: string; category: string; image: string;
  description: string; addedBy: User; totalCopies: number; availableCopies: number;
  addedAt: Date;
};
type Borrow = {
  _id?: ObjectId; bookId: ObjectId; bookTitle: string; bookImage: string;
  userEmail: string; userName: string; borrowDate: Date; returnDate: Date;
};
type AuthRequest = Request & { user?: User };

const app = express();
const port = Number(process.env.PORT ?? 5000);
const secret = process.env.JWT_SECRET ?? '';
if (!secret) throw new Error('JWT_SECRET is required');

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:3000' }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

let db: Db;
let books: Collection<Book>;
let borrows: Collection<Borrow>;
let users: Collection<User & { passwordHash: string }>;
let mongoClient: MongoClient;

function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: 'Authentication required.' });
  try {
    const payload = jwt.verify(header.slice(7), secret) as JwtPayload;
    if (!payload.email || !payload.name) return res.status(401).json({ message: 'Invalid token.' });
    req.user = { email: String(payload.email), name: String(payload.name), photoUrl: payload.photoUrl ? String(payload.photoUrl) : undefined };
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}
const idOf = (value: string | string[]) => Array.isArray(value) || !ObjectId.isValid(value) ? null : new ObjectId(value);
const fail = (res: Response, message: string, status = 400) => res.status(status).json({ message });

app.get('/health', (_req, res) => res.json({ ok: true }));
app.post('/auth/register', async (req, res, next) => {
  try {
    const { name, email, photoUrl, password } = req.body;
    if (!name || !email || !password || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || password.length < 6) return fail(res, 'Password must be 6+ characters with uppercase and lowercase letters.');
    if (await users.findOne({ email })) return fail(res, 'An account with this email already exists.', 409);
    await users.insertOne({ name, email, photoUrl, passwordHash: await bcrypt.hash(password, 10) }); res.status(201).json({ message: 'Registration successful.' });
  } catch (e) { next(e); }
});
app.post('/auth/login', async (req, res, next) => {
  try {
    const account = await users.findOne({ email: req.body.email });
    if (!account || !(await bcrypt.compare(req.body.password ?? '', account.passwordHash))) return fail(res, 'Email or password is incorrect.', 401);
    const user = { name: account.name, email: account.email, photoUrl: account.photoUrl };
    return res.json({ user, token: jwt.sign(user, secret, { expiresIn: '7d' }) });
  } catch (e) { next(e); }
});
app.get('/books', async (_req, res, next) => {
  try { res.json(await books.find().sort({ addedAt: -1 }).toArray()); } catch (e) { next(e); }
});
app.get('/books/:id', async (req, res, next) => {
  try { const id = idOf(req.params.id); if (!id) return fail(res, 'Invalid book id.'); const book = await books.findOne({ _id: id }); return book ? res.json(book) : fail(res, 'Book not found.', 404); } catch (e) { next(e); }
});
app.post('/books', auth, async (req: AuthRequest, res, next) => {
  try {
    const { title, author, category, image, description, totalCopies } = req.body;
    const copies = Number(totalCopies);
    if (!title || !author || !category || !image || !description || !Number.isInteger(copies) || copies < 1) return fail(res, 'All fields and at least one copy are required.');
    const book: Book = { title, author, category, image, description, addedBy: req.user!, totalCopies: copies, availableCopies: copies, addedAt: new Date() };
    const result = await books.insertOne(book); res.status(201).json({ ...book, _id: result.insertedId });
  } catch (e) { next(e); }
});
app.patch('/books/:id', auth, async (req: AuthRequest, res, next) => {
  try {
    const id = idOf(req.params.id); if (!id) return fail(res, 'Invalid book id.');
    const existing = await books.findOne({ _id: id }); if (!existing) return fail(res, 'Book not found.', 404);
    if (existing.addedBy.email !== req.user!.email) return fail(res, 'You can only edit your own books.', 403);
    const changes = { title: req.body.title, author: req.body.author, category: req.body.category, image: req.body.image, description: req.body.description, totalCopies: Number(req.body.totalCopies) };
    if (!changes.title || !changes.author || !changes.category || !changes.image || !changes.description || !Number.isInteger(changes.totalCopies) || changes.totalCopies < existing.totalCopies - existing.availableCopies) return fail(res, 'Invalid book data or total copies.');
    const updated = await books.findOneAndUpdate({ _id: id, 'addedBy.email': req.user!.email }, { $set: { ...changes, availableCopies: changes.totalCopies - (existing.totalCopies - existing.availableCopies) } }, { returnDocument: 'after' });
    return res.json(updated);
  } catch (e) { next(e); }
});
app.delete('/books/:id', auth, async (req: AuthRequest, res, next) => {
  try { const id = idOf(req.params.id); if (!id) return fail(res, 'Invalid book id.'); const result = await books.deleteOne({ _id: id, 'addedBy.email': req.user!.email }); return result.deletedCount ? res.json({ message: 'Book deleted.' }) : fail(res, 'Book not found or not owned by you.', 403); } catch (e) { next(e); }
});
app.post('/borrows', auth, async (req: AuthRequest, res, next) => {
  const session = mongoClient.startSession();
  try {
    const bookId = idOf(req.body.bookId); if (!bookId) return fail(res, 'Invalid book id.');
    const result = await books.findOneAndUpdate({ _id: bookId, availableCopies: { $gt: 0 } }, { $inc: { availableCopies: -1 } }, { returnDocument: 'after', session });
    if (!result) return fail(res, 'This book is not available.', 409);
    const duplicate = await borrows.findOne({ bookId, userEmail: req.user!.email }, { session });
    if (duplicate) { await books.updateOne({ _id: bookId }, { $inc: { availableCopies: 1 } }, { session }); return fail(res, 'You already borrowed this book.', 409); }
    const borrow: Borrow = { bookId, bookTitle: result.title, bookImage: result.image, userEmail: req.user!.email, userName: req.user!.name, borrowDate: new Date(), returnDate: new Date(Date.now() + 7 * 86400000) };
    const inserted = await borrows.insertOne(borrow, { session }); res.status(201).json({ ...borrow, _id: inserted.insertedId });
  } catch (e) { next(e); } finally { await session?.endSession(); }
});
app.get('/borrows', auth, async (req: AuthRequest, res, next) => {
  try { res.json(await borrows.find({ userEmail: req.user!.email }).sort({ borrowDate: -1 }).toArray()); } catch (e) { next(e); }
});
app.delete('/borrows/:id', auth, async (req: AuthRequest, res, next) => {
  const session = mongoClient.startSession();
  try {
    const id = idOf(req.params.id); if (!id) return fail(res, 'Invalid borrow id.');
    const borrow = await borrows.findOne({ _id: id, userEmail: req.user!.email }, { session }); if (!borrow) return fail(res, 'Borrow not found or not owned by you.', 403);
    const removed = await borrows.deleteOne({ _id: id, userEmail: req.user!.email }, { session }); if (!removed.deletedCount) return fail(res, 'Borrow was already returned.', 409);
    await books.updateOne({ _id: borrow.bookId }, { $inc: { availableCopies: 1 } }, { session }); res.json({ message: 'Book returned.' });
  } catch (e) { next(e); } finally { await session?.endSession(); }
});
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => { console.error(err); res.status(500).json({ message: 'Unexpected server error.' }); });

const client = new MongoClient(process.env.MONGODB_URI ?? '');
mongoClient = client;
client.connect().then(async () => {
  db = client.db(process.env.MONGODB_DB ?? 'booknook'); books = db.collection<Book>('books'); borrows = db.collection<Borrow>('borrows');
  users = db.collection<User & { passwordHash: string }>('users');
  await borrows.createIndex({ bookId: 1, userEmail: 1 }, { unique: true });
  app.listen(port, () => console.log(`BookNook API listening on ${port}`));
}).catch((error) => { console.error('MongoDB connection failed', error); process.exit(1); });
