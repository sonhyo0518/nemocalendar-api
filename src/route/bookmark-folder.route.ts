import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { writeLimiter } from '../middleware/rate-limit';
import {
  createBookmarkFolder,
  deleteBookmarkFolder,
  getBookmarkFolders,
  updateBookmarkFolder,
} from '../controller/bookmark-folder.controller';

const router = Router();

router.get('/', authMiddleware, getBookmarkFolders);
router.post('/', authMiddleware, writeLimiter, createBookmarkFolder);
router.patch('/:id', authMiddleware, writeLimiter, updateBookmarkFolder);
router.delete('/:id', authMiddleware, writeLimiter, deleteBookmarkFolder);

export default router;