import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { writeLimiter } from '../middleware/rate-limit';
import {
    createTodoCategory,
    deleteTodoCategory,
    getTodoCategories,
    updateTodoCategory,
  } from '../controller/todo-category.controller';
  
  const router = Router();

router.get('/', authMiddleware, getTodoCategories);
router.post('/', authMiddleware, writeLimiter, createTodoCategory);
router.patch('/:id', authMiddleware, writeLimiter, updateTodoCategory);
router.delete('/:id', authMiddleware, writeLimiter, deleteTodoCategory);

export default router;