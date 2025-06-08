import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { initializeDatabase } from './database/init';
import authRoutes from './routes/auth';
import accountRoutes from './routes/accounts';
import transactionRoutes from './routes/transactions';
import reportRoutes from './routes/reports';
import voucherRoutes from './routes/vouchers';
import inventoryRoutes from './routes/inventory';
import migrationRoutes from './routes/migration';

const app = express();
const PORT = process.env.PORT || 12000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000', 'https://work-1-dhakpmgyrvovyfnz.prod-runtime.all-hands.dev', 'https://work-2-dhakpmgyrvovyfnz.prod-runtime.all-hands.dev'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/migration', migrationRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Initialize database and start server
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Modern Accounting System API ready!`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();