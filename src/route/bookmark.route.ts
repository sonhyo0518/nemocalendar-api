import { Router } from 'express';
import {
  createBookmark,
  deleteBookmark,
  getBookmarks,
  updateBookmark,
} from '../controller/bookmark.controller';
import { authMiddleware } from '../middleware/auth';
import { bookmarkWriteLimiter } from '../middleware/rate-limit';

const router = Router();
router.get('/', authMiddleware, getBookmarks);
router.post('/', authMiddleware, bookmarkWriteLimiter, createBookmark);
router.patch('/:id', authMiddleware, bookmarkWriteLimiter, updateBookmark);
router.delete('/:id', authMiddleware, bookmarkWriteLimiter, deleteBookmark);
export default router;