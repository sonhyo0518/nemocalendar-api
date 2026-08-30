import { Router } from 'express';
import {
  createEvent,
  deleteEvent,
  getCalendars,
  getEvents,
  updateEvent,
} from '../controller/calendar.controller';
import { authMiddleware } from '../middleware/auth';
import { writeLimiter } from '../middleware/rate-limit';

const router = Router();
router.get('/events', authMiddleware, getEvents);
router.post('/events', authMiddleware, writeLimiter, createEvent);
router.patch('/events', authMiddleware, writeLimiter, updateEvent);
router.delete('/events', authMiddleware, writeLimiter, deleteEvent);
router.get('/calendars', authMiddleware, getCalendars);

export default router;