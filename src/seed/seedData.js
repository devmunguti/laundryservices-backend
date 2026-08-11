import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';

try {
  dns.setDefaultResultOrder?.('ipv4first');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) { }
import User from '../models/User.js';
import Service from '../models/Service.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Ticket from '../models/Ticket.js';
import AuditLog from '../models/AuditLog.js';

dotenv.config();

const dbUrl = process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/laundry_db';

export async function seedDatabase() {
  try {
    console.log('🌱 Connecting to MongoDB for seeding...');
    await mongoose.connect(dbUrl);

    console.log('🧹 Clearing existing collections...');
    await User.deleteMany({});
    await Service.deleteMany({});
    await Order.deleteMany({});
    await Payment.deleteMany({});
    await Ticket.deleteMany({});
    await AuditLog.deleteMany({});

    console.log('👥 Seeding Users (Customer, Driver, Provider, Admin)...');
    const users = await User.create([
      {
        fullName: 'Jane Doe',
        email: 'customer@laundry.com',
        phone: '+254712345678',
        passwordHash: 'password123', // Will be hashed by pre-save hook
        role: 'customer',
        addresses: [
          {
            street: '123 Kilimani Road',
            city: 'Nairobi',
            location: { type: 'Point', coordinates: [36.782, -1.291] },
            instructions: 'Ring bell at Gate 4',
            isDefault: true
          }
        ]
      },
      {
        fullName: 'John Driver',
        email: 'driver@laundry.com',
        phone: '+254722998877',
        passwordHash: 'password123',
        role: 'driver',
        addresses: [
          {
            street: 'Westlands Hub',
            city: 'Nairobi',
            location: { type: 'Point', coordinates: [36.805, -1.267] }
          }
        ]
      },
      {
        fullName: 'Sparkle Clean Laundromat',
        email: 'provider@laundry.com',
        phone: '+254733112233',
        passwordHash: 'password123',
        role: 'provider',
        addresses: [
          {
            street: 'Commercial Street, Industrial Area',
            city: 'Nairobi',
            location: { type: 'Point', coordinates: [36.845, -1.305] }
          }
        ]
      },
      {
        fullName: 'Admin User',
        email: 'admin@laundry.com',
        phone: '+254700000000',
        passwordHash: 'admin123',
        role: 'admin'
      }
    ]);

    const customerUser = users.find((u) => u.role === 'customer');
    const driverUser = users.find((u) => u.role === 'driver');
    const providerUser = users.find((u) => u.role === 'provider');
    const adminUser = users.find((u) => u.role === 'admin');

    console.log('🧺 Seeding Laundry Services Catalog...');
    const services = await Service.create([
      {
        name: 'Everyday Wash & Fold',
        category: 'Wash & Fold',
        description: 'Standard washing, tumble drying, and neat folding for casual wear.',
        pricingType: 'per_kg',
        basePrice: 150,
        addOns: [
          { name: 'Hypoallergenic Detergent', price: 50, description: 'Gentle on sensitive skin' },
          { name: 'Fabric Softener', price: 30, description: 'Fresh lavender scent' }
        ]
      },
      {
        name: 'Executive Suit Dry Cleaning',
        category: 'Dry Cleaning',
        description: 'Professional eco-friendly dry cleaning for 2-piece suits.',
        pricingType: 'per_item',
        basePrice: 800,
        addOns: [
          { name: 'Stain Removal Treatment', price: 200, description: 'Deep spot cleaning' }
        ]
      },
      {
        name: 'Shirt Steam Pressing & Ironing',
        category: 'Ironing & Pressing',
        description: 'Crisp steam press on hangers or folded.',
        pricingType: 'per_item',
        basePrice: 100,
        addOns: []
      },
      {
        name: 'Duvet & Heavy Bedding Clean',
        category: 'Bedding & Linens',
        description: 'Deep sanitizing wash for king & queen size duvets.',
        pricingType: 'flat',
        basePrice: 1200,
        addOns: []
      }
    ]);

    console.log('📦 Seeding Sample Order...');
    const washService = services[0];
    const order = await Order.create({
      customer: customerUser._id,
      provider: providerUser._id,
      driver: driverUser._id,
      status: 'In_Wash',
      items: [
        {
          service: washService._id,
          name: washService.name,
          pricingType: washService.pricingType,
          unitPrice: washService.basePrice,
          quantity: 5, // 5 kg
          addOns: [{ name: 'Fabric Softener', price: 30 }],
          notes: 'Separate whites from colors please'
        }
      ],
      pickupSlot: {
        date: new Date(),
        windowStart: '09:00',
        windowEnd: '11:00'
      },
      deliverySlot: {
        date: new Date(Date.now() + 86400000 * 2), // 2 days later
        windowStart: '14:00',
        windowEnd: '16:00'
      },
      pickupAddress: {
        street: customerUser.addresses[0].street,
        city: customerUser.addresses[0].city,
        instructions: customerUser.addresses[0].instructions
      },
      deliveryAddress: {
        street: customerUser.addresses[0].street,
        city: customerUser.addresses[0].city,
        instructions: customerUser.addresses[0].instructions
      },
      pricing: {
        deliveryFee: 200,
        discount: 50,
        tax: 0
      }
    });

    console.log('💳 Seeding Payment Transactions...');
    const payments = [
      {
        order: order._id,
        orderId: '#ORD-9921',
        customer: customerUser._id,
        provider: providerUser._id,
        customerName: 'Jane Wanjiku',
        providerName: 'Sparkle Dry Cleaners',
        method: 'mpesa',
        status: 'Paid',
        payoutStatus: 'Pending',
        amount: 2500,
        commissionRate: 15,
        commissionAmount: 375,
        providerPayoutAmount: 2125,
        currency: 'KES',
        transactionId: 'MPX987654321',
        gatewayMeta: { mpesaReceipt: 'MPX987654321', phoneNumber: customerUser.phone },
        paidAt: new Date()
      },
      {
        order: order._id,
        orderId: '#ORD-9920',
        customer: customerUser._id,
        provider: providerUser._id,
        customerName: 'David Omondi',
        providerName: 'Nairobi Fresh Wash',
        method: 'mpesa',
        status: 'Paid',
        payoutStatus: 'Completed',
        amount: 1800,
        commissionRate: 15,
        commissionAmount: 270,
        providerPayoutAmount: 1530,
        currency: 'KES',
        transactionId: 'MPX987654322',
        payoutReference: 'B2C-PAY-9920',
        paidAt: new Date(Date.now() - 3600000 * 5)
      },
      {
        order: order._id,
        orderId: '#ORD-9919',
        customer: customerUser._id,
        provider: providerUser._id,
        customerName: 'Mary Kamau',
        providerName: 'Sparkle Dry Cleaners',
        method: 'mpesa',
        status: 'Paid',
        payoutStatus: 'Pending',
        amount: 4200,
        commissionRate: 15,
        commissionAmount: 630,
        providerPayoutAmount: 3570,
        currency: 'KES',
        transactionId: 'MPX987654323',
        paidAt: new Date(Date.now() - 86400000)
      },
      {
        order: order._id,
        orderId: '#ORD-9918',
        customer: customerUser._id,
        provider: providerUser._id,
        customerName: 'Peter Njoroge',
        providerName: 'Westlands Laundry Hub',
        method: 'card',
        status: 'Paid',
        payoutStatus: 'Completed',
        amount: 950,
        commissionRate: 15,
        commissionAmount: 142.5,
        providerPayoutAmount: 807.5,
        currency: 'KES',
        transactionId: 'MPX987654324',
        payoutReference: 'B2C-PAY-9918',
        paidAt: new Date(Date.now() - 86400000 * 2)
      }
    ];

    for (const p of payments) {
      await Payment.create(p);
    }

    console.log('🎫 Seeding Support Ticket...');
    await Ticket.create({
      order: order._id,
      user: customerUser._id,
      subject: 'Inquiry regarding pickup window',
      priority: 'Medium',
      status: 'In_Progress',
      assignedAdmin: adminUser._id,
      messages: [
        {
          sender: customerUser._id,
          text: 'Hello, can the driver call me 10 mins before arrival?'
        },
        {
          sender: adminUser._id,
          text: 'Hi Jane, we have notified driver John to give you a call ahead of time.'
        }
      ]
    });

    console.log('📜 Seeding System Audit Logs...');
    await AuditLog.create([
      {
        user: adminUser._id,
        userName: adminUser.fullName,
        role: 'Admin',
        action: 'Cleaner Approved',
        details: "Approved 'Sparkle Cleaners' onboarding request.",
        ipAddress: '192.168.1.104',
        status: 'Success',
        category: 'Provider',
        createdAt: new Date()
      },
      {
        user: null,
        userName: 'System Auto',
        role: 'Bot',
        action: 'Daily Backup',
        details: 'Completed database snapshot to S3.',
        ipAddress: '10.0.0.52',
        status: 'Success',
        category: 'Backup',
        createdAt: new Date(Date.now() - 3600000 * 2)
      },
      {
        user: null,
        userName: 'Unknown User',
        role: 'Unauthenticated',
        action: 'Failed Login',
        details: 'Invalid password for admin@auralaundry.co.ke',
        ipAddress: '41.80.12.221',
        status: 'Failed',
        category: 'Authentication',
        createdAt: new Date(Date.now() - 3600000 * 5)
      },
      {
        user: adminUser._id,
        userName: 'Mike Waweru',
        role: 'Support',
        action: 'Refund Processed',
        details: 'Order #ORD-8821 full refund (KSH 1,500).',
        ipAddress: '192.168.1.112',
        status: 'Success',
        category: 'Payment',
        createdAt: new Date(Date.now() - 86400000)
      }
    ]);

    console.log('✅ Database seeding complete!');
    if (process.argv[1].includes('seedData.js')) {
      await mongoose.connection.close();
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Seeding error:', error);
    if (process.argv[1].includes('seedData.js')) {
      process.exit(1);
    }
  }
}

// Run directly if invoked from command line
if (process.argv[1].includes('seedData.js')) {
  seedDatabase();
}
