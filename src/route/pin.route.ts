import { Router } from 'express';
import {
  createPin,
  deletePin,
  getPins,
  updatePin,
} from '../controller/pin.controller';
import { authMiddleware } from '../middleware/auth';
import { writeLimiter } from '../middleware/rate-limit';

const router = Router();
router.get('/', authMiddleware, getPins);
router.post('/', authMiddleware, writeLimiter, createPin);
router.patch('/:id', authMiddleware, writeLimiter, updatePin);
router.delete('/:id', authMiddleware, writeLimiter, deletePin);

export default router;
