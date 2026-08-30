import { Router } from 'express';
import {
  createTodo,
  deleteTodo,
  getTodos,
  updateTodo,
} from '../controller/todo.controller';
import { authMiddleware } from '../middleware/auth';
import { writeLimiter } from '../middleware/rate-limit';

const router = Router();
router.get('/', authMiddleware, getTodos);
router.post('/', authMiddleware, writeLimiter, createTodo);
router.patch('/:id', authMiddleware, writeLimiter, updateTodo);
router.delete('/:id', authMiddleware, writeLimiter, deleteTodo);

export default router;