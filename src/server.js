import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import morgan from 'morgan';
import { connectDB } from './config/db.js';
import serviceRoutes from './routes/serviceRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import authRoutes from './routes/authRoutes.js';
import auditLogRoutes from './routes/auditLogRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import systemRoutes from './routes/systemSettingsRoutes.js';
import { getPublicSettings } from './controllers/systemSettingsController.js';

import { maintenanceMiddleware } from './middleware/maintenanceMiddleware.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy for IP extraction (e.g. behind nginx/load balancer)
app.set('trust proxy', 1);

// CORS configuration with credentials support
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const allowedOrigins = [
  frontendUrl,
  process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive in dev if origin matches
    }
  },
  credentials: true
}));

// Express Middleware
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health Check Route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Laundry Platform Backend API is running smoothly' });
});

// Public System Settings Endpoint
app.get('/api/public/settings', getPublicSettings);

import ticketRoutes from './routes/ticketRoutes.js';
import promotionRoutes from './routes/promotionRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';

// API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/admin/settings', systemRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/orders', maintenanceMiddleware, orderRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes);


// 404 & Global Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

import { startNotificationScheduler } from './services/notification/notificationScheduler.js';

// Start server after connecting to MongoDB
async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`🚀 Laundry Platform Server listening on port ${PORT}`);
    startNotificationScheduler();
  });
}

startServer();
