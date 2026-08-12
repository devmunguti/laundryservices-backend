# Laundry Services Platform - Backend API

A robust Node.js, Express, and MongoDB backend for the Laundry Services Platform. It manages user authentication, laundry services, orders, payment integration via PayHero (M-Pesa STK push & callbacks), ticket support, and system settings.

---

## 🛠️ Required Dependencies

### Production Dependencies (`dependencies`)
- **`express`** (`^4.22.2`): Core web framework for routing, middleware handling, and HTTP request processing.
- **`mongoose`** (`^9.9.1`): MongoDB object modeling tool for schema validation and database queries.
- **`mongodb`** (`^7.5.0`): Official MongoDB driver for Node.js.
- **`axios`** (`^1.19.0`): HTTP client used for outbound requests to third-party APIs like PayHero.
- **`bcryptjs`** (`^3.0.3`): Password hashing library for secure password storage.
- **`jsonwebtoken`** (`^9.0.3`): JWT library for signing and verifying authentication tokens.
- **`dotenv`** (`^16.6.1`): Loads environment variables from `.env` file into `process.env`.
- **`cors`** (`^2.8.6`): Enables Cross-Origin Resource Sharing for frontend-backend communication.
- **`cookie-parser`** (`^1.4.7`): Parses HTTP cookies for cookie-based session handling.
- **`express-rate-limit`** (`^8.6.2`): Rate-limiting middleware to prevent brute-force attacks and abuse.
- **`express-validator`** (`^7.3.2`): Validation and sanitization middleware for request body and parameters.
- **`morgan`** (`^1.11.0`): HTTP request logger middleware for development debugging.

---

## 🚀 Installation & Setup Guide

### 1. Prerequisites
- **Node.js** (v18 or higher recommended)
- **npm** (v9 or higher)
- **MongoDB** (Local instance or MongoDB Atlas connection string)

### 2. Installation Steps
```bash
# Navigate to backend directory
cd backend

# Install all required npm dependencies
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root of the `backend/` directory (refer to `.env.example`):

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/laundry-platform
JWT_SECRET=your_jwt_secret_key_here
PAYHERO_API_KEY=your_payhero_api_key
PAYHERO_API_SECRET=your_payhero_api_secret
PAYHERO_SERVICE_ID=your_payhero_service_id
PAYHERO_BASE_URL=https://backend.payhero.co.ke/api/v2
PAYHERO_CALLBACK_URL=http://your-domain.com/api/payments/payhero/callback
```

### 4. Running the Server

- **Development Mode** (auto-reloads on code changes):
  ```bash
  npm run dev
  ```

- **Production Mode**:
  ```bash
  npm start
  ```

- **Database Seeding**:
  ```bash
  # Seed default services and demo data
  npm run seed

  # Seed initial admin user
  npm run seed:admin
  ```

---

## 📂 Architecture & Code Structure

```
backend/
├── src/
│   ├── config/              # DB connection & environment configuration
│   ├── controllers/         # Request handlers and business logic
│   ├── middleware/          # Authentication & rate-limiting middleware
│   ├── models/              # Mongoose database schemas
│   ├── routes/              # Express API route endpoints
│   ├── seed/                # Database seed scripts
│   ├── services/            # Payment & external integration services
│   ├── utils/               # Helper utilities & custom loggers
│   └── server.js            # Express app entry point
├── .env.example             # Template for required environment variables
└── package.json             # Backend dependencies and scripts
```

### Key Modules & Logic Explanation

1. **Authentication (`src/controllers/authController.js`, `src/middleware/authMiddleware.js`)**
   - Handles registration, login, profile management, and password hashing (`bcryptjs`).
   - Uses JWT (`jsonwebtoken`) for stateless session authentication. Roles include `customer`, `provider`, and `admin`.

2. **Order Management (`src/controllers/orderController.js`, `src/models/Order.js`)**
   - Manages customer order creation, service itemization, delivery address, status tracking (`Pending`, `In-Progress`, `Completed`, `Cancelled`), and provider assignments.

3. **Payment & PayHero M-Pesa STK Push (`src/services/payheroService.js`, `src/controllers/paymentController.js`)**
   - `payheroService.js`: Integrates with PayHero API v2 for M-Pesa STK push payment processing.
   - `paymentStateService.js`: Provides polling and state tracking for payment transactions.
   - `paymentController.js`: Handles payment initiation, PayHero Webhook/Callback handling, payment status updates, and administrative record retrieval.

4. **Service Catalog (`src/controllers/serviceController.js`, `src/models/Service.js`)**
   - Providers and admins can create, update, list, and disable laundry services (e.g., Wash & Fold, Dry Cleaning, Ironing).

5. **Ticket Support & System Settings (`src/controllers/ticketController.js`, `src/controllers/systemSettingsController.js`)**
   - `ticketController.js`: Customer and admin support ticket creation, response history, and status updates.
   - `systemSettingsController.js`: Platform-wide configurations (service fees, payment channels, operating hours).
