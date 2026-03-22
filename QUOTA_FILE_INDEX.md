# Quota Management Engine - File Index

## 📂 Core Engine Files (Production Ready)

### Utilities & Services
- **[src/utils/quotaEngine.ts](src/utils/quotaEngine.ts)** (480+ lines)
  - Core quota management logic
  - `QuotaEngine` class with all methods
  - Transaction-safe operations
  - Fully typed with interfaces

- **[src/utils/quotaUtils.ts](src/utils/quotaUtils.ts)** (300+ lines)
  - Feature slug constants
  - Helper functions with error handling
  - Safe wrappers: `safeCheckQuota()`, `safeDeductUsage()`
  - Batch operations
  - Display formatting

- **[src/config/quotaConfig.ts](src/config/quotaConfig.ts)** (250+ lines)
  - Environment configurations
  - Feature configs
  - Rate limiting configs
  - Quota tier definitions

### Middleware & Routes
- **[src/middleware/quotaMiddleware.ts](src/middleware/quotaMiddleware.ts)** (160+ lines)
  - `checkQuota()` - Single feature checking
  - `checkMultipleQuotas()` - Multiple features
  - Express middleware factory
  - Flexible strict/warn modes

- **[src/routes/quotaRoutes.ts](src/routes/quotaRoutes.ts)** (50+ lines)
  - 8 RESTful endpoints
  - All routes require JWT auth
  - Proper HTTP status codes

### Controllers & Services
- **[src/controllers/quotaController.ts](src/controllers/quotaController.ts)** (300+ lines)
  - `QuotaController` class
  - Endpoints for quota management
  - Dashboard, stats, ledger queries
  - Admin adjustment endpoint

- **[src/services/quotaIntegration.ts](src/services/quotaIntegration.ts)** (400+ lines)
  - Real-world integration examples
  - `EmailQuotaService` - Email operations
  - `CampaignQuotaService` - Campaign operations
  - `LeadQuotaService` - Lead operations
  - `GenericQuotaService` - Custom features

### Setup & Scripts
- **[src/scripts/quotaSetup.ts](src/scripts/quotaSetup.ts)** (400+ lines)
  - `createQuotaTables()` - Create all DB tables
  - `seedInitialData()` - Populate features and plans
  - `migrateExistingSubscriptions()` - Migrate existing users
  - `verifyQuotaSystem()` - Health check
  - `setupQuotaSystem()` - One-command setup

---

## 📖 Documentation Files

### Getting Started
- **[QUOTA_QUICK_REFERENCE.md](QUOTA_QUICK_REFERENCE.md)** ⭐ START HERE
  - 5-minute setup guide
  - Common patterns
  - API endpoint reference
  - Response examples
  - Debugging tips
  - Common issues & solutions

### Implementation Guides
- **[QUOTA_ENGINE_GUIDE.md](QUOTA_ENGINE_GUIDE.md)** - Complete Reference
  - Architecture overview
  - Database schema integration
  - 7 detailed usage examples
  - Integration patterns (email, campaign, leads, etc.)
  - All API endpoints documented
  - Best practices
  - Troubleshooting guide
  - Migration instructions

- **[QUOTA_IMPLEMENTATION_CHECKLIST.md](QUOTA_IMPLEMENTATION_CHECKLIST.md)** - Step-by-Step Plan
  - 11 implementation phases
  - Database setup phase
  - User migration phase
  - API routes setup phase
  - Feature integration phase (per feature)
  - Testing phase
  - Deployment phase
  - Monitoring & cleanup
  - Rollback procedures
  - Quick start section

- **[QUOTA_DELIVERY_SUMMARY.md](QUOTA_DELIVERY_SUMMARY.md)** - Project Summary
  - Complete overview of what was built
  - Key features summary
  - Architecture diagram
  - Integration examples
  - Deployment readiness checklist
  - Support resources

---

## 📊 Database Schema

The engine works with these tables:

```
✅ features (id, slug, name, status)
✅ plans (id, name, lemon_variant_id, status)
✅ plan_features (id, plan_id, feature_id, limit_value)
✅ addons (id, name, feature_id, unit_amount, lemon_variant_id)
✅ subscriptions (id, user_id, plan_id, status, period_dates)
✅ subscription_addons (id, subscription_id, addon_id, quantity)
✅ ledger (id, user_id, feature_id, amount, is_deposit, balance_after)
```

All tables created by `setupQuotaSystem()` with proper indexes.

---

## 🔧 How to Use This Setup

### Step 1: Understand the System (30 minutes)
1. Read [QUOTA_QUICK_REFERENCE.md](QUOTA_QUICK_REFERENCE.md)
2. Skim [QUOTA_DELIVERY_SUMMARY.md](QUOTA_DELIVERY_SUMMARY.md)
3. Review architecture in [QUOTA_ENGINE_GUIDE.md](QUOTA_ENGINE_GUIDE.md)

### Step 2: Initialize Database (15 minutes)
```typescript
// In any script or startup function
import { setupQuotaSystem } from './scripts/quotaSetup';
await setupQuotaSystem();
```

### Step 3: Add Routes (5 minutes)
```typescript
// In src/index.ts
import quotaRouter from './routes/quotaRoutes';
app.use('/api/quota', quotaRouter);
```

### Step 4: Integrate Features (1-2 hours per feature)
Follow patterns in [QUOTA_ENGINE_GUIDE.md](QUOTA_ENGINE_GUIDE.md) or copy from [src/services/quotaIntegration.ts](src/services/quotaIntegration.ts)

### Step 5: Test & Deploy (2-3 hours)
Use checklist in [QUOTA_IMPLEMENTATION_CHECKLIST.md](QUOTA_IMPLEMENTATION_CHECKLIST.md)

---

## 📋 Feature Slugs Included

Pre-configured feature constants in `FEATURE_SLUGS`:

```typescript
EMAIL_MESSAGES          // 'email_messages'
WHATSAPP_MESSAGES       // 'whatsapp_messages'
SMS_MESSAGES            // 'sms_messages'
LEADS                   // 'leads'
CRAWLED_LEADS           // 'crawled_leads'
CAMPAIGNS               // 'campaigns'
FAQ_ARTICLES            // 'faq_articles'
CHAT_CONVERSATIONS      // 'chat_conversations'
API_CALLS               // 'api_calls'
STORAGE_GB              // 'storage_gb'
CUSTOM_DOMAINS          // 'custom_domains'
EMAIL_ACCOUNTS          // 'email_accounts'
```

Add more in `src/utils/quotaUtils.ts`

---

## 🎯 API Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/quota/check/:featureSlug` | Check if quota available |
| GET | `/api/quota/usage/:featureSlug` | Get usage statistics |
| GET | `/api/quota/dashboard` | Get all features status |
| GET | `/api/quota/ledger/:featureSlug` | Get transaction history |
| GET | `/api/quota/addons` | List available addons |
| POST | `/api/quota/deduct` | Deduct usage (internal) |
| POST | `/api/quota/refund` | Refund usage |
| POST | `/api/quota/adjust` | Admin: Adjust quota |

All endpoints require JWT authentication.

---

## 💡 Key Methods

### QuotaEngine Class

```typescript
// Check quota
QuotaEngine.checkQuota(userId, featureSlug)
  → { allowed, remaining, used, limit, subscriptionId }

// Deduct usage
QuotaEngine.deductUsage({ userId, featureSlug, amount, source, description })
  → { success, balance, ledgerId, message }

// Refund usage
QuotaEngine.refundUsage(userId, featureSlug, amount, description)
  → { success, balance, ledgerId, message }

// Admin adjustment
QuotaEngine.adjustQuota(userId, featureSlug, amount, description)
  → { success, balance, ledgerId, message }

// Get statistics
QuotaEngine.getUsageStats(userId, featureSlug)
  → { featureName, used, limit, remaining, subscriptionStatus, periodEnd }

// Initialize quota for new subscription
QuotaEngine.initializePlanQuota(subscriptionId, userId, planId)

// Add addon quota
QuotaEngine.addAddonQuota(subscriptionId, userId, addonId, quantity)
```

### Helper Functions

```typescript
// Safe wrappers
safeCheckQuota(userId, featureSlug)
safeDeductUsage(userId, featureSlug, amount, description)
batchDeductUsage(userId, usages[])

// Display helpers
getQuotaPercentage(userId, featureSlug)
isQuotaLow(userId, featureSlug, threshold)
formatQuotaDisplay(remaining, limit)
getQuotaStatus(remaining, limit)

// Integration services
EmailQuotaService.sendEmail(userId, emailData)
CampaignQuotaService.createCampaign(userId, data)
LeadQuotaService.importLeads(userId, leads, source)
GenericQuotaService.executeWithQuotaCheck(userId, featureSlug, operation, options)
```

---

## 🚀 Quick Start Command

```typescript
// One-line setup
import { setupQuotaSystem } from './scripts/quotaSetup';
await setupQuotaSystem(); // Creates tables, seeds data, verifies
```

---

## 📞 Documentation Quick Links

| Need | Read |
|------|------|
| 5-min intro | [QUOTA_QUICK_REFERENCE.md](QUOTA_QUICK_REFERENCE.md) |
| Full guide | [QUOTA_ENGINE_GUIDE.md](QUOTA_ENGINE_GUIDE.md) |
| Step-by-step | [QUOTA_IMPLEMENTATION_CHECKLIST.md](QUOTA_IMPLEMENTATION_CHECKLIST.md) |
| Project overview | [QUOTA_DELIVERY_SUMMARY.md](QUOTA_DELIVERY_SUMMARY.md) |
| Code examples | [src/services/quotaIntegration.ts](src/services/quotaIntegration.ts) |
| Setup details | [src/scripts/quotaSetup.ts](src/scripts/quotaSetup.ts) |

---

## ✅ Pre-Deployment Checklist

- [ ] All files created in correct locations
- [ ] Database tables created with `setupQuotaSystem()`
- [ ] Initial data seeded (features, plans, limits)
- [ ] Quota routes added to Express app
- [ ] First feature integrated (e.g., email)
- [ ] Quota deductions working correctly
- [ ] API endpoints tested and working
- [ ] Existing subscriptions migrated
- [ ] Monitoring & logging in place
- [ ] Documentation reviewed by team
- [ ] Testing completed successfully
- [ ] Deployment plan confirmed

---

## 🎓 Learning Path

1. **New to this?** → Start with [QUOTA_QUICK_REFERENCE.md](QUOTA_QUICK_REFERENCE.md)
2. **Ready to build?** → Follow [QUOTA_IMPLEMENTATION_CHECKLIST.md](QUOTA_IMPLEMENTATION_CHECKLIST.md)
3. **Need details?** → Reference [QUOTA_ENGINE_GUIDE.md](QUOTA_ENGINE_GUIDE.md)
4. **Want examples?** → Review [src/services/quotaIntegration.ts](src/services/quotaIntegration.ts)
5. **Setting up?** → Use [src/scripts/quotaSetup.ts](src/scripts/quotaSetup.ts)

---

## 🎉 You're Ready!

All files are created, documented, and ready to use. Start with [QUOTA_QUICK_REFERENCE.md](QUOTA_QUICK_REFERENCE.md) and follow the guides.

Questions? Check the troubleshooting section in [QUOTA_ENGINE_GUIDE.md](QUOTA_ENGINE_GUIDE.md).

**Happy coding! 🚀**
