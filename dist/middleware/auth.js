"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const authMiddleware = (req, res, next) => {
    const header = req.headers.authorization;
    const cookieToken = typeof req.cookies?.accessToken === 'string'
        ? req.cookies.accessToken
        : null;
    const raw = header?.startsWith('Bearer ') ? header.slice(7) : cookieToken;
    if (!raw) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    try {
        const token = raw;
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            res.status(500).json({ error: 'JWT_SECRET is not configured' });
            return;
        }
        const payload = jsonwebtoken_1.default.verify(token, jwtSecret, {
            algorithms: ['HS256'],
        });
        if (payload.type === 'refresh') {
            res.status(401).json({ error: 'Invalid token' });
            return;
        }
        req.userIdx = payload.userIdx;
        req.email = payload.email;
        next();
    }
    catch {
        res.status(401).json({ error: 'Invalid token' });
    }
};
exports.authMiddleware = authMiddleware;
