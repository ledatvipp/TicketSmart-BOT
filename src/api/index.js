import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { initDb, closeDb, prisma } from '../lib/db.js';
import { validateEnv } from '../lib/env.js';
import { attachSocket } from '../lib/realtime.js';
import { startWebhookWorker, stopWebhookWorker } from '../lib/webhooks.js';
import { APP_VERSION } from '../lib/version.js';
import { ensureDefaultClusters } from '../clusters/clusterBootstrap.js';
import { getLoginConfig } from './controllers/authController.js';
import { isValidBotRequest } from './middleware/botAuth.js';
import { requestContext, securityHeaders, createOriginGuard, configureTrustProxy, apiErrorHandler } from './middleware/security.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIST = join(__dirname, '../web/dist');

import authRouter from './routes/auth.js';
import optionsRouter from './routes/options.js';
import ticketsRouter from './routes/tickets.js';
import staffRouter from './routes/staff.js';
import statsRouter from './routes/stats.js';
import configRouter from './routes/config.js';
import auditRouter from './routes/audit.js';
import messagesRouter from './routes/messages.js';
import cannedRouter from './routes/canned.js';
import ratingsRouter from './routes/ratings.js';
import faqsRouter from './routes/faqs.js';
import webhooksRouter from './routes/webhooks.js';
import autoTagRouter from './routes/autoTag.js';
import autoActionsRouter from './routes/autoActions.js';
import bannersRouter from './routes/banners.js';
import intelligenceRouter from './routes/intelligence.js';
import knowledgeRouter from './routes/knowledge.js';
import clustersRouter from './routes/clusters.js';
import smartLearnRouter from './routes/smartLearn.js';
import chatLevelsRouter from './routes/chatLevels.js';

try {
  validateEnv('api');
} catch (error) {
  console.error('❌ ' + error.message);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;
app.disable('x-powered-by');
configureTrustProxy(app);
app.use(requestContext);
app.use(securityHeaders);

// CORS whitelist: WEB_ORIGIN là CSV. Không dùng wildcard cùng credential ở production.
const WEB_ORIGIN = (process.env.WEB_ORIGIN || 'http://localhost:5173,http://localhost:3001')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);
if (process.env.NODE_ENV === 'production' && WEB_ORIGIN.includes('*')) {
  throw new Error('WEB_ORIGIN không được chứa * trong production');
}
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (WEB_ORIGIN.includes('*') || WEB_ORIGIN.includes(origin.replace(/\/$/, ''))) return cb(null, true);
    return cb(Object.assign(new Error('Origin không được phép'), { statusCode: 403, code: 'CORS_FORBIDDEN' }));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Bot-Secret', 'X-Bot-Actor', 'X-Request-Id', 'X-Requested-With', 'X-LeDat-Server', 'X-LeDat-Timestamp', 'X-LeDat-Nonce', 'X-LeDat-Content-SHA256', 'X-LeDat-Signature'],
  maxAge: 600,
}));
app.use(createOriginGuard(WEB_ORIGIN));

// Upload base64 vẫn được hỗ trợ có giới hạn riêng để tương thích dashboard cũ.
// Mọi API thông thường chỉ được 1 MiB nhằm giảm nguy cơ memory/JSON DoS.
const uploadJson = express.json({ limit: process.env.UPLOAD_JSON_LIMIT || '8mb', strict: true });
app.use('/api/banners', uploadJson);
app.use('/api/config/setup-message', uploadJson);
app.use('/api/config/announcement', uploadJson);
app.use(express.json({
  limit: process.env.API_JSON_LIMIT || '1mb',
  strict: true,
  // The LobbySign signer hashes the exact UTF-8 payload, before JSON parsing.
  verify(req, _res, buffer) { if (req.path.startsWith('/api/chat-levels/minecraft/')) req.rawBody = buffer.toString('utf8'); },
}));
app.use(express.urlencoded({ limit: '128kb', extended: false, parameterLimit: 100 }));

app.use((req, res, next) => {
  res.setHeader('Cache-Control', req.path.startsWith('/api/auth') ? 'no-store' : 'no-cache');
  if (req.path.startsWith('/api')) {
    console.log(`[${new Date().toISOString()}] [${req.requestId}] ${req.method} ${req.path}`);
  }
  next();
});

const limiterMessage = { success: false, message: 'Quá nhiều request, vui lòng thử lại sau', code: 'RATE_LIMITED' };
const generalApiLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.API_RATE_LIMIT || 300),
  standardHeaders: true,
  legacyHeaders: false,
  skip: isValidBotRequest,
  message: limiterMessage,
});
const authLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.AUTH_RATE_LIMIT || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: limiterMessage,
});
const expensiveLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.EXPENSIVE_RATE_LIMIT || 20),
  standardHeaders: true,
  legacyHeaders: false,
  skip: isValidBotRequest,
  message: limiterMessage,
});

app.use('/api', generalApiLimiter);
app.get('/api/config/public', authLimiter, getLoginConfig);
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/options', optionsRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/staff', staffRouter);
app.use('/api/stats/export.csv', expensiveLimiter);
app.use('/api/stats', statsRouter);
app.use('/api/config/ai-provider/test', expensiveLimiter);
app.use('/api/config/ai-provider/playground', expensiveLimiter);
app.use('/api/config', configRouter);
app.use('/api/audit', auditRouter);
app.use('/api/canned', cannedRouter);
app.use('/api/ratings', ratingsRouter);
app.use('/api/faqs', faqsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/autotag', autoTagRouter);
app.use('/api/auto-actions', autoActionsRouter);
app.use('/api/banners', expensiveLimiter, bannersRouter);
app.use('/api/intelligence', intelligenceRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/clusters', clustersRouter);
app.use('/api/smartlearn', smartLearnRouter);
app.use('/api/chat-levels', chatLevelsRouter);

const UPLOAD_ROOT = join(__dirname, '../../uploads');
const PUBLIC_IMAGE_PATH = /\.(?:png|jpe?g|gif|webp)$/i;
app.use('/uploads', (req, res, next) => {
  let pathname;
  try { pathname = decodeURIComponent(req.path); } catch { return res.status(400).send('Bad request'); }
  if (!PUBLIC_IMAGE_PATH.test(pathname) || pathname.includes('..') || pathname.includes('\\')) {
    return res.status(404).send('Not found');
  }
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'");
  res.setHeader('Content-Disposition', 'inline');
  next();
}, express.static(UPLOAD_ROOT, {
  dotfiles: 'deny',
  fallthrough: false,
  immutable: true,
  maxAge: '365d',
  index: false,
  redirect: false,
  setHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Chỉ ảnh đã kiểm tra magic bytes được public; cho phép dashboard/CDN nhúng ảnh.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  },
}));

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    res.json({ success: true, db: 'ok', version: APP_VERSION });
  } catch {
    res.status(503).json({ success: false, db: 'down' });
  }
});

// Chỉ phục vụ Vue build đã được tạo từ source hiện tại. Không fallback sang bundle cũ.
const WEB_ROOT = existsSync(WEB_DIST) ? WEB_DIST : null;
if (WEB_ROOT) {
  app.use(express.static(WEB_ROOT, {
    setHeaders(res, filePath) {
      // Some embedded WebViews reject module scripts served as application/javascript.
      if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'text/javascript; charset=UTF-8');
    },
  }));

  // OAuth callback redirect (giữ query params)
  app.get('/auth/callback', (req, res) => {
    const q = new URLSearchParams(req.query).toString();
    res.redirect('/auth-callback' + (q ? '?' + q : ''));
  });

  // SPA fallback — mọi route không match /api thì trả index.html
  app.get(/^\/(?!api|socket\.io|health).*/, (_req, res) => {
    const index = join(WEB_ROOT, 'index.html');
    if (existsSync(index)) return res.sendFile(index);
    res.status(503).send('Web build not found');
  });

  console.log(`🌐 Web Dashboard served from: ${WEB_ROOT}`);
} else {
  app.get('/', (_req, res) => res.status(503).send('<h3 style="font-family:sans-serif;padding:20px">Web build chưa có. Chạy <code>npm run build</code> trước khi triển khai.</h3>'));
}

app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ success: false, message: 'Không tìm thấy endpoint' });
  res.status(404).send('Not found');
});
app.use(apiErrorHandler);

const httpServer = http.createServer(app);
attachSocket(httpServer, { corsOrigins: WEB_ORIGIN });

let shuttingDown = false;
let conversationCleanupTimer = null;

async function cleanupExpiredSmartConversations() {
  try {
    const result = await prisma.smartConversation.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    if (result.count > 0) console.log(`[SMART CLEANUP] Đã xóa ${result.count} hội thoại hết hạn`);
  } catch (error) {
    // Database cũ chưa migrate vẫn phải cho API tiếp tục khởi động.
    if (!String(error?.message || '').includes('SmartConversation')) {
      console.error('[SMART CLEANUP]', error);
    }
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n🛑 Nhận ${signal}, đang đóng API...`);

  if (conversationCleanupTimer) clearInterval(conversationCleanupTimer);
  await stopWebhookWorker().catch((error) => console.error('[WEBHOOK WORKER STOP]', error));

  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  httpServer.close(async () => {
    await closeDb().catch((error) => console.error('[DB CLOSE]', error));
    clearTimeout(forceExit);
    process.exit(0);
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

initDb().then(async () => {
  const clusterBootstrap = await ensureDefaultClusters(prisma);
  console.log(`🗺️ Multi‑Cluster ready: ${clusterBootstrap.total} cụm • tạo mới ${clusterBootstrap.created}`);
  await cleanupExpiredSmartConversations();
  startWebhookWorker();
  conversationCleanupTimer = setInterval(cleanupExpiredSmartConversations, 30 * 60_000);
  conversationCleanupTimer.unref();
  httpServer.listen(PORT, () => console.log(`✅ API + Web + Socket.IO chạy tại http://localhost:${PORT}`));
}).catch((err) => {
  console.error('❌ Lỗi khởi động DB:', err);
  process.exit(1);
});
