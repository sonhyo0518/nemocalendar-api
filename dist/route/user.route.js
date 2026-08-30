"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const user_controller_1 = require("../controller/user.controller");
const banner_controller_1 = require("../controller/banner.controller");
const auth_1 = require("../middleware/auth");
const rate_limit_1 = require("../middleware/rate-limit");
const router = (0, express_1.Router)();
router.post('/google-login', rate_limit_1.authLimiter, user_controller_1.googleLogin);
router.get('/me', auth_1.authMiddleware, user_controller_1.getMe);
router.post('/connect-calendar', auth_1.authMiddleware, rate_limit_1.writeLimiter, user_controller_1.connectGoogleCalendar);
router.post('/disconnect-calendar', auth_1.authMiddleware, rate_limit_1.writeLimiter, user_controller_1.disconnectGoogleCalendar);
router.post('/refresh', rate_limit_1.authLimiter, user_controller_1.refreshAccessToken);
router.patch('/location', auth_1.authMiddleware, rate_limit_1.writeLimiter, user_controller_1.updateUserLocation);
router.post('/logout', auth_1.authMiddleware, user_controller_1.logout);
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 1024 * 1024 },
});
router.patch('/theme-color', auth_1.authMiddleware, rate_limit_1.writeLimiter, banner_controller_1.updateBannerColor);
router.post('/banner', auth_1.authMiddleware, rate_limit_1.writeLimiter, upload.single('file'), banner_controller_1.uploadUserBanner);
router.delete('/banner', auth_1.authMiddleware, rate_limit_1.writeLimiter, banner_controller_1.deleteUserBanner);
exports.default = router;
