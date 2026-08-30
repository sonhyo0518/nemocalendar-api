import { Router } from 'express';
import multer from 'multer';
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  getMe,
  googleLogin,
  logout,
  refreshAccessToken,
  updateUserLocation,
} from '../controller/user.controller';
import {
  deleteUserBanner,
  updateBannerColor,
  uploadUserBanner,
} from '../controller/banner.controller';
import { authMiddleware } from '../middleware/auth';
import { authLimiter, writeLimiter } from '../middleware/rate-limit';

const router = Router();

router.post('/google-login', authLimiter, googleLogin);

router.get('/me', authMiddleware, getMe);
router.post('/connect-calendar', authMiddleware, writeLimiter, connectGoogleCalendar);
router.post('/disconnect-calendar', authMiddleware, writeLimiter, disconnectGoogleCalendar);
router.post('/refresh', authLimiter, refreshAccessToken);
router.patch('/location', authMiddleware, writeLimiter, updateUserLocation);
router.post('/logout', authMiddleware, logout);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
});

router.patch('/theme-color', authMiddleware, writeLimiter, updateBannerColor);
router.post('/banner', authMiddleware, writeLimiter, upload.single('file'), uploadUserBanner);
router.delete('/banner', authMiddleware, writeLimiter, deleteUserBanner);

export default router;