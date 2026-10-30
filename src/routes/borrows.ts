import { Router } from 'express';
import { Database } from '../db.js';
import { AuthRequest, authMiddleware } from '../middleware/auth.js';
import { fail, objectId } from '../utils.js';

export function borrowRoutes(database: Database) {
  const router = Router(); const auth = authMiddleware(database.users);
  router.post('/', auth, async (req: AuthRequest, res, next) => {
    const session = database.client.startSession();
    try {
      const bookId = objectId(req.body.bookId); if (!bookId) return fail(res, 'Invalid book id.');
      let created;
      await session.withTransaction(async () => {
        const duplicate = await database.borrows.findOne({ bookId, userEmail: req.user!.email }, { session });
        if (duplicate) throw Object.assign(new Error('You already borrowed this book.'), { status: 409 });
        const book = await database.books.findOneAndUpdate({ _id: bookId, availableCopies: { $gt: 0 } }, { $inc: { availableCopies: -1 } }, { returnDocument: 'after', session });
        if (!book) throw Object.assign(new Error('This book is not available.'), { status: 409 });
        const borrow = { bookId, bookTitle: book.title, bookImage: book.image, userEmail: req.user!.email, userName: req.user!.name, borrowDate: new Date(), returnDate: new Date(Date.now() + 7 * 86400000) };
        const result = await database.borrows.insertOne(borrow, { session }); created = { ...borrow, _id: result.insertedId };
      });
      return res.status(201).json(created);
    } catch (error) { if (error instanceof Error && 'status' in error) return fail(res, error.message, Number((error as Error & { status: number }).status)); next(error); } finally { await session.endSession(); }
  });
  router.get('/', auth, async (req: AuthRequest, res, next) => { try { res.json(await database.borrows.find({ userEmail: req.user!.email }).sort({ borrowDate: -1 }).toArray()); } catch (error) { next(error); } });
  router.delete('/:id', auth, async (req: AuthRequest, res, next) => {
    const session = database.client.startSession();
    try {
      const id = objectId(req.params.id); if (!id) return fail(res, 'Invalid borrow id.');
      let returned = false;
      await session.withTransaction(async () => {
        const borrow = await database.borrows.findOne({ _id: id, userEmail: req.user!.email }, { session }); if (!borrow) throw Object.assign(new Error('Borrow not found or not owned by you.'), { status: 403 });
        const removed = await database.borrows.deleteOne({ _id: id, userEmail: req.user!.email }, { session }); if (!removed.deletedCount) throw Object.assign(new Error('Borrow was already returned.'), { status: 409 });
        await database.books.updateOne({ _id: borrow.bookId }, { $inc: { availableCopies: 1 } }, { session }); returned = true;
      });
      return returned ? res.json({ message: 'Book returned.' }) : fail(res, 'Return failed.', 409);
    } catch (error) { if (error instanceof Error && 'status' in error) return fail(res, error.message, Number((error as Error & { status: number }).status)); next(error); } finally { await session.endSession(); }
  });
  return router;
}
