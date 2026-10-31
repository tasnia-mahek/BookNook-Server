import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import morgan from 'morgan';
import { config } from './config.js';
import { connectDatabase } from './db.js';
import { bookRoutes } from './routes/books.js';
import { borrowRoutes } from './routes/borrows.js';

const app = express();
app.use(cors({ origin: config.clientOrigins, credentials: true, allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => { console.error(err); res.status(500).json({ message: 'Unexpected server error.' }); });

let databasePromise = connectDatabase();
databasePromise.then(database => {
  app.use('/books', bookRoutes(database));
  app.use('/borrows', borrowRoutes(database));
  app.listen(config.port, () => console.log(`BookNook API listening on ${config.port}`));
}).catch(error => { console.error('MongoDB connection failed:', error); process.exit(1); });
