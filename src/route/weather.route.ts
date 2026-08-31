import { Router } from 'express';
import { getWeather, getGuestWeather, suggestLocations } from '../controller/weather.controller';
import { authMiddleware } from '../middleware/auth';
import { weatherLimiter } from '../middleware/rate-limit';

const router = Router();
router.get('/suggest', authMiddleware, weatherLimiter, suggestLocations);
router.get('/guest', weatherLimiter, getGuestWeather);
router.get('/', authMiddleware, weatherLimiter, getWeather);
export default router;