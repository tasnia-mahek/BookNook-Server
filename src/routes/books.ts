import { Router } from 'express';
import { Database, Book } from '../db.js';
import { AuthRequest, authMiddleware } from '../middleware/auth.js';
import { categories, fail, objectId } from '../utils.js';

export function bookRoutes(database: Database) {
  const router = Router();
  const auth = authMiddleware(database.users);
  router.get('/', async (req, res, next) => { try { const limit = Number(req.query.limit); const cursor = database.books.find().sort({ addedAt: -1 }); res.json(await (Number.isInteger(limit) && limit > 0 ? cursor.limit(Math.min(limit, 100)) : cursor).toArray()); } catch (error) { next(error); } });
  router.get('/:id', auth, async (req, res, next) => { try { const id = objectId(req.params.id); if (!id) return fail(res, 'Invalid book id.'); const book = await database.books.findOne({ _id: id }); return book ? res.json(book) : fail(res, 'Book not found.', 404); } catch (error) { next(error); } });
  router.post('/', auth, async (req: AuthRequest, res, next) => {
    try {
      const { title, author, category, image, description, totalCopies } = req.body;
      const copies = Number(totalCopies);
      if (typeof title !== 'string' || !title.trim() || typeof author !== 'string' || !author.trim() || typeof image !== 'string' || !image.trim() || typeof description !== 'string' || !description.trim() || !categories.has(category) || !Number.isInteger(copies) || copies < 1) return fail(res, 'Valid title, author, category, image, description, and copies are required.');
      const book: Book = { title: title.trim(), author: author.trim(), category, image: image.trim(), description: description.trim(), addedBy: { name: req.user!.name, email: req.user!.email, photoUrl: req.user!.image ?? undefined }, totalCopies: copies, availableCopies: copies, addedAt: new Date() };
      const result = await database.books.insertOne(book); res.status(201).json({ ...book, _id: result.insertedId });
    } catch (error) { next(error); }
  });
  router.patch('/:id', auth, async (req: AuthRequest, res, next) => {
    try {
      const id = objectId(req.params.id); if (!id) return fail(res, 'Invalid book id.');
      const existing = await database.books.findOne({ _id: id }); if (!existing) return fail(res, 'Book not found.', 404);
      if (existing.addedBy.email !== req.user!.email) return fail(res, 'You can only edit your own books.', 403);
      const copies = Number(req.body.totalCopies); const borrowed = existing.totalCopies - existing.availableCopies;
      if (typeof req.body.title !== 'string' || !req.body.title.trim() || typeof req.body.author !== 'string' || !req.body.author.trim() || typeof req.body.image !== 'string' || !req.body.image.trim() || typeof req.body.description !== 'string' || !req.body.description.trim() || !categories.has(req.body.category) || !Number.isInteger(copies) || copies < borrowed) return fail(res, 'Invalid book data or total copies.');
      const updated = await database.books.findOneAndUpdate({ _id: id, 'addedBy.email': req.user!.email }, { $set: { title: req.body.title.trim(), author: req.body.author.trim(), category: req.body.category, image: req.body.image.trim(), description: req.body.description.trim(), totalCopies: copies, availableCopies: copies - borrowed } }, { returnDocument: 'after' });
      return res.json(updated);
    } catch (error) { next(error); }
  });
  router.delete('/:id', auth, async (req: AuthRequest, res, next) => {
    try { const id = objectId(req.params.id); if (!id) return fail(res, 'Invalid book id.'); const result = await database.books.deleteOne({ _id: id, 'addedBy.email': req.user!.email }); return result.deletedCount ? res.json({ message: 'Book deleted.' }) : fail(res, 'Book not found or not owned by you.', 403); } catch (error) { next(error); }
  });
  return router;
}
