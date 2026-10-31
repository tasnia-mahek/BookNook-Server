import 'dotenv/config';
import { MongoClient } from 'mongodb';

const [title, image] = process.argv.slice(2);
if (!title || !image) {
  throw new Error('Usage: npx tsx scripts/set-book-image.ts "<exact title>" "<direct image URL>"');
}

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required.');
const client = new MongoClient(uri);

try {
  await client.connect();
  const database = client.db(process.env.MONGODB_DB || 'booknook');
  const result = await database.collection('books').updateOne({ title }, { $set: { image } });
  console.log(`Matched ${result.matchedCount} document(s).`);
} finally {
  await client.close();
}
