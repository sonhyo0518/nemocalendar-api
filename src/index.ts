if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv/config');
}

import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import cors, { CorsOptions } from 'cors';
import userRoutes from './route/user.route';
import pinRoutes from './route/pin.route';
import todoCategoryRoutes from './route/todo-category.route';
import todoRoutes from './route/todo.route';
import weatherRoutes from './route/weather.route';
import anniversaryRoutes from './route/anniversary.route';
import calendarRoutes from './route/calendar.route';
import bookmarkRoutes from './route/bookmark.route';
import bookmarkFolderRoutes from './route/bookmark-folder.route';
import cookieParser from 'cookie-parser';
import { prisma } from './lib/prisma';

const app = express();
const port = Number(process.env.PORT ?? 5000);

app.set('trust proxy', 1);
app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/', (req: Request, res: Response) => {
  res.send('Hello, TypeScript with Express!');
});

app.get('/health', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ ok: true, db: true });
  } catch (err) {
    console.error('[health]', err);
    res.status(503).json({ ok: false, db: false });
  }
});

app.use('/api/user', userRoutes);
app.use('/api/pins', pinRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/todo-categories', todoCategoryRoutes);
app.use('/api/todos', todoRoutes);
app.use('/api/anniversaries', anniversaryRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/bookmark-folders', bookmarkFolderRoutes);

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const isCorsError = err.message.startsWith('CORS blocked');
  const status = isCorsError ? 403 : 500;
  console.error(`[Error] ${err.message}`);
  res.status(status).json({
    error: isCorsError ? err.message : 'Internal Server Error',
  });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});