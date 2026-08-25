import dns from 'dns';
try {
  dns.setDefaultResultOrder?.('ipv4first');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Service from '../models/Service.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Review from '../models/Review.js';
import Ticket from '../models/Ticket.js';
import AuditLog from '../models/AuditLog.js';

dotenv.config();

const dbUrl = process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/laundry_db';

export async function restoreDatabase() {
  console.log('🔄 Connecting to MongoDB to restore complete initial dataset...');
  await mongoose.connect(dbUrl);

  console.log('🧹 Resetting database collections...');
  await User.deleteMany({});
  await Service.deleteMany({});
  await Order.deleteMany({});
  await Payment.deleteMany({});
  await Review.deleteMany({});
  await Ticket.deleteMany({});
  await AuditLog.deleteMany({});

  console.log('👥 Creating complete user accounts...');
  // 1. Users
  const users = await User.create([
    // Admin 1
    {
      firstName: 'Super',
      lastName: 'Admin',
      fullName: 'Super Admin',
      email: 'admin@laundry.com',
      phone: '+254700000000',
      passwordHash: 'admin123', // Also accepts Admin@12345
      role: 'admin',
      status: 'Active',
      isActive: true,
      isEmailVerified: true
    },
    // Admin 2 (Owner email from .env)
    {
      firstName: 'Admin',
      lastName: 'Munguti',
      fullName: 'Developer Admin',
      email: 'devmunguti@gmail.com',
      phone: '+254700000001',
      passwordHash: 'admin123',
      role: 'admin',
      status: 'Active',
      isActive: true,
      isEmailVerified: true
    },
    // Cleaner 1 (Sparkle Clean)
    {
      firstName: 'Sparkle',
      lastName: 'Laundromat',
      fullName: 'Sparkle Clean Laundromat',
      email: 'provider@laundry.com',
      phone: '+254733112233',
      passwordHash: 'password123',
      role: 'provider',
      status: 'Active',
      isActive: true,
      providerDetails: {
        businessName: 'Sparkle Clean Laundromat',
        isApproved: true,
        rating: 4.9,
        reviewsCount: 28,
        tillNumber: '8995354',
        isPromoted: true,
        promotedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        promotionTagline: 'Fast same-day turnaround for executive suits and shoes.',
        paymentChannels: [
          {
            type: 'mpesa',
            title: 'M-Pesa Buy Goods',
            subtitle: 'Till Number',
            accountName: 'Sparkle Clean',
            businessNo: '8995354',
            accountNo: '',
            isDefault: true,
            isVerified: true
          }
        ]
      },
      addresses: [
        {
          street: 'Commercial Street, Industrial Area',
          city: 'Nairobi',
          location: { type: 'Point', coordinates: [36.845, -1.305] },
          isDefault: true
        }
      ]
    },
    // Cleaner 2 (Nairobi Fresh Wash)
    {
      firstName: 'Nairobi',
      lastName: 'Fresh Wash',
      fullName: 'Nairobi Fresh Wash & Dry Cleaners',
      email: 'nairobi.cleaners@laundry.com',
      phone: '+254722556677',
      passwordHash: 'password123',
      role: 'provider',
      status: 'Active',
      isActive: true,
      providerDetails: {
        businessName: 'Nairobi Fresh Wash & Dry Cleaners',
        isApproved: true,
        rating: 4.8,
        reviewsCount: 19,
        tillNumber: '5221234',
        isPromoted: false,
        promotionTagline: 'Specialized duvet and delicate curtain steam care.',
        paymentChannels: [
          {
            type: 'mpesa',
            title: 'M-Pesa Till',
            subtitle: 'Till Number',
            accountName: 'Nairobi Fresh Wash',
            businessNo: '5221234',
            isDefault: true,
            isVerified: true
          }
        ]
      },
      addresses: [
        {
          street: 'Ring Road, Kilimani',
          city: 'Nairobi',
          location: { type: 'Point', coordinates: [36.782, -1.291] },
          isDefault: true
        }
      ]
    },
    // Cleaner 3 (Westlands Hub)
    {
      firstName: 'Westlands',
      lastName: 'Cleaners',
      fullName: 'Westlands Premium Cleaners',
      email: 'westlands.cleaners@laundry.com',
      phone: '+254711889900',
      passwordHash: 'password123',
      role: 'provider',
      status: 'Active',
      isActive: true,
      providerDetails: {
        businessName: 'Westlands Premium Cleaners',
        isApproved: true,
        rating: 5.0,
        reviewsCount: 42,
        tillNumber: '9988112',
        isPromoted: true,
        promotedUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        promotionTagline: 'Top-rated leather conditioning & sneaker restoration.',
        paymentChannels: [
          {
            type: 'mpesa',
            title: 'M-Pesa Till',
            accountName: 'Westlands Cleaners',
            businessNo: '9988112',
            isDefault: true,
            isVerified: true
          }
        ]
      },
      addresses: [
        {
          street: 'Waiyaki Way, Westlands',
          city: 'Nairobi',
          location: { type: 'Point', coordinates: [36.805, -1.267] },
          isDefault: true
        }
      ]
    },
    // Customer 1
    {
      firstName: 'Jane',
      lastName: 'Doe',
      fullName: 'Jane Doe',
      email: 'customer@laundry.com',
      phone: '+254712345678',
      passwordHash: 'password123',
      role: 'customer',
      status: 'Active',
      isActive: true,
      addresses: [
        {
          street: '123 Kilimani Road, Gate 4, Apt 3B',
          city: 'Nairobi',
          location: { type: 'Point', coordinates: [36.782, -1.291] },
          instructions: 'Ring bell at Gate 4',
          isDefault: true
        }
      ]
    },
    // Driver 1
    {
      firstName: 'John',
      lastName: 'Driver',
      fullName: 'John Driver',
      email: 'driver@laundry.com',
      phone: '+254722998877',
      passwordHash: 'password123',
      role: 'driver',
      status: 'Active',
      isActive: true,
      addresses: [
        {
          street: 'Westlands Hub',
          city: 'Nairobi',
          location: { type: 'Point', coordinates: [36.805, -1.267] }
        }
      ]
    }
  ]);

  const p1 = users.find(u => u.email === 'provider@laundry.com');
  const p2 = users.find(u => u.email === 'nairobi.cleaners@laundry.com');
  const p3 = users.find(u => u.email === 'westlands.cleaners@laundry.com');
  const customer = users.find(u => u.email === 'customer@laundry.com');
  const driver = users.find(u => u.email === 'driver@laundry.com');

  console.log('🧺 Creating full service catalogs for each cleaner...');
  // 2. Services for Cleaners using the exact 6 categories and 4 pricing models
  const services = await Service.create([
    // Sparkle Clean Services
    {
      name: 'Sneaker Deep Clean & Midsole Restoration',
      category: 'Shoe Cleaning',
      description: 'Deep stain extraction, rubber midsole whitening, and anti-bacterial deodorizing.',
      pricingType: 'pair_of_shoes',
      basePrice: 500,
      deliveryFee: 200,
      turnaroundTime: '24 hours',
      provider: p1._id,
      isActive: true
    },
    {
      name: 'Executive 2-Piece Suit Dry Cleaning',
      category: 'Dry Cleaning',
      description: 'Solvent dry cleaning, steam pressing, and wrinkle-free protective hanger.',
      pricingType: 'per_item',
      basePrice: 600,
      deliveryFee: 200,
      turnaroundTime: '24-48 hours',
      provider: p1._id,
      isActive: true
    },
    {
      name: 'King / Queen Size Duvet Thermal Wash',
      category: 'Duvets',
      description: 'Heavy thermal sanitize wash and hypoallergenic tumble dry for large duvets.',
      pricingType: 'flat_rate',
      basePrice: 1500,
      deliveryFee: 0,
      turnaroundTime: '24 hours',
      provider: p1._id,
      isActive: true
    },
    {
      name: 'Wool & Shag Carpet Extraction Wash',
      category: 'Carpets',
      description: 'Deep fiber shampoo extraction and dust mite extermination priced per kg.',
      pricingType: 'per_kg',
      basePrice: 150,
      deliveryFee: 200,
      turnaroundTime: '48 hours',
      provider: p1._id,
      isActive: true
    },

    // Nairobi Fresh Wash Services
    {
      name: 'Full Length Window Curtains Steam Clean',
      category: 'Curtains',
      description: 'Dust removal, sanitizing steam press, and anti-static drapery treatment.',
      pricingType: 'per_item',
      basePrice: 350,
      deliveryFee: 200,
      turnaroundTime: '24 hours',
      provider: p2._id,
      isActive: true
    },
    {
      name: 'Genuine Leather Jacket Conditioner & Buff',
      category: 'Leather Cleaning',
      description: 'Gentle pH-balanced leather wash, suppleness restore oil, and protective buffing.',
      pricingType: 'per_item',
      basePrice: 1200,
      deliveryFee: 0,
      turnaroundTime: '48 hours',
      provider: p2._id,
      isActive: true
    },
    {
      name: 'Designer Suede & Leather Shoe Clean',
      category: 'Shoe Cleaning',
      description: 'Specialty suede brushing, nap reset, and stain repellent finish.',
      pricingType: 'pair_of_shoes',
      basePrice: 600,
      deliveryFee: 200,
      turnaroundTime: '24 hours',
      provider: p2._id,
      isActive: true
    },

    // Westlands Cleaners Services
    {
      name: 'Silk & Wool Blanket / Duvet Care',
      category: 'Duvets',
      description: 'Gentle hand-finish wash for delicate fiber blankets and luxury bedding.',
      pricingType: 'flat_rate',
      basePrice: 1600,
      deliveryFee: 0,
      turnaroundTime: '24-48 hours',
      provider: p3._id,
      isActive: true
    },
    {
      name: 'Area Rug & Persian Carpet Clean',
      category: 'Carpets',
      description: 'Gentle color-lock wash and rapid moisture extraction per kg.',
      pricingType: 'per_kg',
      basePrice: 180,
      deliveryFee: 200,
      turnaroundTime: '48 hours',
      provider: p3._id,
      isActive: true
    },
    {
      name: 'Leather Handbag & Jacket Restoration',
      category: 'Leather Cleaning',
      description: 'Luxury handbag and jacket leather deep clean, color refresh, and wax buff.',
      pricingType: 'per_item',
      basePrice: 1400,
      deliveryFee: 0,
      turnaroundTime: '48 hours',
      provider: p3._id,
      isActive: true
    }
  ]);

  console.log('📦 Creating sample active and past orders...');
  // 3. Orders
  const order1 = await Order.create({
    orderRef: 'ORD-992144',
    customer: customer._id,
    provider: p1._id,
    driver: driver._id,
    status: 'In_Wash',
    paymentStatus: 'Paid',
    items: [
      {
        service: services[0]._id,
        name: services[0].name,
        category: services[0].category,
        pricingType: services[0].pricingType,
        unitPrice: services[0].basePrice,
        quantity: 2,
        subtotal: 1000
      },
      {
        service: services[1]._id,
        name: services[1].name,
        category: services[1].category,
        pricingType: services[1].pricingType,
        unitPrice: services[1].basePrice,
        quantity: 1,
        subtotal: 600
      }
    ],
    pickupAddress: {
      street: '123 Kilimani Road, Apt 3B',
      city: 'Nairobi',
      instructions: 'Gate 4'
    },
    deliveryAddress: {
      street: '123 Kilimani Road, Apt 3B',
      city: 'Nairobi'
    },
    pricing: {
      subtotal: 1600,
      deliveryFee: 200,
      grandTotal: 1800
    },
    notes: 'Please separate whites'
  });

  const order2 = await Order.create({
    orderRef: 'ORD-881230',
    customer: customer._id,
    provider: p2._id,
    driver: driver._id,
    status: 'Delivered',
    paymentStatus: 'Paid',
    items: [
      {
        service: services[4]._id,
        name: services[4].name,
        category: services[4].category,
        pricingType: services[4].pricingType,
        unitPrice: services[4].basePrice,
        quantity: 2,
        subtotal: 700
      },
      {
        service: services[5]._id,
        name: services[5].name,
        category: services[5].category,
        pricingType: services[5].pricingType,
        unitPrice: services[5].basePrice,
        quantity: 1,
        subtotal: 1200
      }
    ],
    pickupAddress: {
      street: '45 Riverside Drive',
      city: 'Nairobi'
    },
    deliveryAddress: {
      street: '45 Riverside Drive',
      city: 'Nairobi'
    },
    pricing: {
      subtotal: 1900,
      deliveryFee: 200,
      grandTotal: 2100
    }
  });

  console.log('💳 Creating payment ledger entries...');
  // 4. Payments
  await Payment.create([
    {
      order: order1._id,
      orderId: order1.orderRef,
      customer: customer._id,
      provider: p1._id,
      customerName: 'Jane Doe',
      providerName: p1.providerDetails.businessName,
      phoneNumber: '+254712345678',
      amount: 1800,
      commissionRate: 15,
      commissionAmount: 270,
      providerPayoutAmount: 1530,
      status: 'Paid',
      payoutStatus: 'Pending',
      method: 'mpesa',
      transactionId: 'MPX889977665',
      paidAt: new Date()
    },
    {
      order: order2._id,
      orderId: order2.orderRef,
      customer: customer._id,
      provider: p2._id,
      customerName: 'David Omondi',
      providerName: p2.providerDetails.businessName,
      phoneNumber: '+254722556677',
      amount: 2100,
      commissionRate: 15,
      commissionAmount: 315,
      providerPayoutAmount: 1785,
      status: 'Paid',
      payoutStatus: 'Completed',
      method: 'mpesa',
      transactionId: 'MPX776655443',
      payoutReference: 'B2C-PAY-881230',
      paidAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
    }
  ]);

  console.log('⭐ Creating customer review records...');
  // 5. Reviews
  await Review.create([
    {
      order: order1._id,
      orderRef: order1.orderRef,
      provider: p1._id,
      customer: customer._id,
      customerName: 'Jane Doe',
      rating: 5,
      comment: 'Superb sneaker restoration! My white sneakers look brand new.',
      tags: ['Fast Service', 'High Quality', 'Polite Cleaner'],
      isPublished: true
    },
    {
      order: order2._id,
      orderRef: order2.orderRef,
      provider: p2._id,
      customer: customer._id,
      customerName: 'David Omondi',
      rating: 5,
      comment: 'Excellent curtain and leather cleaning. Timely delivery.',
      tags: ['On-time Delivery', 'Fresh Scent'],
      isPublished: true
    }
  ]);

  console.log('🎫 Creating sample support ticket...');
  await Ticket.create({
    ticketId: 'TCK-1001',
    user: customer._id,
    subject: 'Question regarding duvet pickup schedule',
    description: 'Can the cleaner collect my heavy blanket between 10am and 12pm?',
    status: 'Open',
    priority: 'Medium'
  });

  console.log('📜 Creating system audit logs...');
  await AuditLog.create({
    user: users[0]._id,
    action: 'Database Restored',
    details: 'Complete system database restored with vetted cleaners, active services, and verified logins.',
    status: 'Success',
    category: 'System'
  });

  console.log('\n======================================================');
  console.log('✅ DATABASE RESTORATION COMPLETED SUCCESSFULLY!');
  console.log('======================================================');
  console.log('Available Login Credentials:');
  console.log('------------------------------------------------------');
  console.log('1. Admin:    admin@laundry.com           | Password: admin123 (or Admin@12345)');
  console.log('2. Admin:    devmunguti@gmail.com        | Password: admin123');
  console.log('3. Cleaner:  provider@laundry.com        | Password: password123 (Sparkle Clean)');
  console.log('4. Cleaner:  nairobi.cleaners@laundry.com| Password: password123 (Nairobi Fresh)');
  console.log('5. Cleaner:  westlands.cleaners@laundry.com| Password: password123 (Westlands)');
  console.log('6. Customer: customer@laundry.com        | Password: password123 (Jane Doe)');
  console.log('7. Driver:   driver@laundry.com          | Password: password123 (John Driver)');
  console.log('======================================================\n');

  await mongoose.disconnect();
}

restoreDatabase().catch((err) => {
  console.error('❌ Database restoration failed:', err);
  process.exit(1);
});
