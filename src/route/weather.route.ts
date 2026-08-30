import { Router } from 'express';
import { getWeather, suggestLocations } from '../controller/weather.controller';
import { authMiddleware } from '../middleware/auth';
import { weatherLimiter } from '../middleware/rate-limit';

const router = Router();
router.get('/suggest', authMiddleware, weatherLimiter, suggestLocations);
router.get('/', authMiddleware, weatherLimiter, getWeather);
export default router;