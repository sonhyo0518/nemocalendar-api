import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { writeLimiter } from '../middleware/rate-limit';
import { 
  createAnniversary, 
  deleteAnniversary, 
  getAnniversaries, 
  updateAnniversary 
} from '../controller/anniversary.controller';

const router = Router();
router.get('/', authMiddleware, getAnniversaries);
router.post('/', authMiddleware, writeLimiter, createAnniversary);
router.delete('/:id', authMiddleware, writeLimiter, deleteAnniversary);
router.patch('/:id', authMiddleware, writeLimiter, updateAnniversary);
export default router;