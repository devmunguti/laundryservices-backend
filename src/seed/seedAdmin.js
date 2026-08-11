import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';
import User from '../models/User.js';

try {
  dns.setDefaultResultOrder?.('ipv4first');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

dotenv.config();

const dbUrl = process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/laundry_db';

export async function createAdminUser() {
  try {
    console.log('🌱 Connecting to MongoDB...');
    await mongoose.connect(dbUrl);

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@laundry.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@12345';
    const adminName = process.env.ADMIN_NAME || 'Super Admin';
    const adminPhone = process.env.ADMIN_PHONE || '+254700000000';

    let admin = await User.findOne({ email: adminEmail.toLowerCase() });

    if (admin) {
      console.log(`ℹ️ Admin user (${adminEmail}) already exists. Updating credentials and role...`);
      admin.role = 'admin';
      admin.fullName = adminName;
      admin.passwordHash = adminPassword; // Pre-save hook will hash if modified
      admin.isActive = true;
      await admin.save();
      console.log(`✅ Admin account updated successfully!`);
    } else {
      console.log(`✨ Creating new Admin user (${adminEmail})...`);
      const nameParts = adminName.split(' ');
      admin = await User.create({
        firstName: nameParts[0] || 'Admin',
        lastName: nameParts.slice(1).join(' ') || 'User',
        fullName: adminName,
        email: adminEmail.toLowerCase(),
        phone: adminPhone,
        passwordHash: adminPassword,
        role: 'admin',
        isActive: true,
        isEmailVerified: true
      });
      console.log(`✅ Admin user created successfully!`);
    }

    console.log('-----------------------------------');
    console.log(`Email:    ${admin.email}`);
    console.log(`Password: ${adminPassword}`);
    console.log(`Role:     ${admin.role}`);
    console.log('-----------------------------------');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating/seeding Admin user:', error);
    process.exit(1);
  }
}

createAdminUser();
