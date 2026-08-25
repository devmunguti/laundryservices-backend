import dns from 'dns';
try {
  dns.setDefaultResultOrder?.('ipv4first');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';

dotenv.config();
const dbUrl = process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/laundry_db';

async function checkAdmin() {
  await mongoose.connect(dbUrl);
  const admin = await User.findOne({ email: 'admin@laundry.com' }).select('+passwordHash');
  if (!admin) {
    console.log('Admin not found!');
  } else {
    const test1 = await admin.comparePassword('admin123');
    const test2 = await admin.comparePassword('Admin@12345');
    console.log('Password "admin123" match:', test1);
    console.log('Password "Admin@12345" match:', test2);
  }
  await mongoose.disconnect();
}

checkAdmin().catch(console.error);
