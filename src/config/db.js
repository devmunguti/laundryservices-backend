import mongoose from 'mongoose';
import dns from 'dns';

// Fix Node.js DNS SRV resolution for MongoDB Atlas cluster strings
try {
  dns.setDefaultResultOrder?.('ipv4first');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // Fallback if DNS server override is restricted
}

/**
 * Connect to MongoDB using Mongoose with retry/backoff logic and graceful shutdown handling.
 */
export async function connectDB() {
  const dbUrl = process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/laundry_db';
  const MAX_RETRIES = 5;
  let retries = 0;

  // Configure Mongoose options
  mongoose.set('strictQuery', true);

  // Connection event listeners
  mongoose.connection.on('connected', () => {
    console.log('✅ MongoDB connected successfully');
  });

  mongoose.connection.on('error', (err) => {
    console.error(`❌ MongoDB connection error: ${err.message}`);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  MongoDB disconnected');
  });

  // Handle graceful process termination
  const gracefulExit = async () => {
    try {
      await mongoose.connection.close();
      console.log('🔌 MongoDB connection closed gracefully through app termination');
      process.exit(0);
    } catch (err) {
      console.error('Error during database disconnect:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', gracefulExit);
  process.on('SIGTERM', gracefulExit);

  while (retries < MAX_RETRIES) {
    try {
      console.log(`Connecting to MongoDB database at ${dbUrl}... (Attempt ${retries + 1}/${MAX_RETRIES})`);
      await mongoose.connect(dbUrl, {
        serverSelectionTimeoutMS: 5000,
      });
      return;
    } catch (error) {
      retries += 1;
      console.error(`❌ Connection attempt ${retries} failed: ${error.message}`);
      if (retries >= MAX_RETRIES) {
        console.error('💥 Exceeded maximum database connection retries. Continuing with app initialization.');
        break;
      }
      // Wait 3 seconds before retrying
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}
