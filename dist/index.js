"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('dotenv/config');
}
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const user_route_1 = __importDefault(require("./route/user.route"));
const pin_route_1 = __importDefault(require("./route/pin.route"));
const todo_category_route_1 = __importDefault(require("./route/todo-category.route"));
const todo_route_1 = __importDefault(require("./route/todo.route"));
const weather_route_1 = __importDefault(require("./route/weather.route"));
const anniversary_route_1 = __importDefault(require("./route/anniversary.route"));
const calendar_route_1 = __importDefault(require("./route/calendar.route"));
const bookmark_route_1 = __importDefault(require("./route/bookmark.route"));
const bookmark_folder_route_1 = __importDefault(require("./route/bookmark-folder.route"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const prisma_1 = require("./lib/prisma");
const csrf_1 = require("./middleware/csrf");
const app = (0, express_1.default)();
const port = Number(process.env.PORT ?? 5000);
app.set('trust proxy', 1);
app.use((0, helmet_1.default)());
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
const corsOptions = {
    origin(origin, callback) {
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.includes(origin))
            return callback(null, true);
        return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
};
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json({ limit: '100kb' }));
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
app.use((0, csrf_1.createCsrfMiddleware)(allowedOrigins));
app.get('/', (req, res) => {
    res.send('Hello, TypeScript with Express!');
});
app.get('/health', async (_req, res) => {
    try {
        await prisma_1.prisma.$queryRaw `SELECT 1`;
        res.status(200).json({ ok: true, db: true });
    }
    catch (err) {
        console.error('[health]', err);
        res.status(503).json({ ok: false, db: false });
    }
});
app.use('/api/user', user_route_1.default);
app.use('/api/pins', pin_route_1.default);
app.use('/api/bookmarks', bookmark_route_1.default);
app.use('/api/weather', weather_route_1.default);
app.use('/api/todo-categories', todo_category_route_1.default);
app.use('/api/todos', todo_route_1.default);
app.use('/api/anniversaries', anniversary_route_1.default);
app.use('/api/calendar', calendar_route_1.default);
app.use('/api/bookmark-folders', bookmark_folder_route_1.default);
app.use((err, req, res, next) => {
    const isCorsError = err.message.startsWith('CORS blocked');
    const status = isCorsError ? 403 : 500;
    console.error(`[Error] ${err.message}`);
    res.status(status).json({
        error: isCorsError ? err.message : 'Internal Server Error',
    });
});
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
