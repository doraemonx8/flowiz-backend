# Quota Management Engine - Implementation Guide

## Overview

The unified quota management engine is an industry-standard implementation for managing subscription-based feature limits. It handles:

- **Feature Limits**: Based on subscription plans
- **Addon Management**: Additional quota purchases
- **Usage Tracking**: Complete ledger of all transactions
- **Real-time Checks**: Instant quota validation
- **Error Handling**: Graceful degradation and recovery

## Architecture

### Core Components

1. **QuotaEngine** (`quotaEngine.ts`): Core business logic
   - `checkQuota()`: Verify available quota
   - `deductUsage()`: Record consumption
   - `refundUsage()`: Handle cancellations
   - `adjustQuota()`: Admin adjustments

2. **Middleware** (`quotaMiddleware.ts`): Route-level enforcement
   - `checkQuota()`: Generic quota checker
   - `checkMultipleQuotas()`: Multi-feature validation
   - `deductUsageMiddleware()`: Post-operation deduction

3. **Controller** (`quotaController.ts`): API endpoints
   - Dashboard and analytics
   - Ledger queries
   - Addon management

4. **Utilities** (`quotaUtils.ts`): Helper functions
   - Constants for feature slugs
   - Safe wrappers with error handling
   - Formatting and display utilities

## Database Schema Integration

The engine works with your schema:

```
features (slug, name, status)
  ↓
plan_features (plan_id, feature_id, limit_value)
  ↓
subscriptions (user_id, plan_id, status, period_end)
  ↓
subscription_addons (subscription_id, addon_id, quantity)
  ↓
ledger (user_id, feature_id, amount, is_deposit, source, balance_after)
```

## Usage Examples

### 1. Basic Quota Check

```typescript
import QuotaEngine from './utils/quotaEngine';
import { FEATURE_SLUGS } from './utils/quotaUtils';

// Check if user can send email
const quota = await QuotaEngine.checkQuota(userId, FEATURE_SLUGS.EMAIL_MESSAGES);

if (quota.allowed) {
  console.log(`Can send ${quota.remaining} more emails`);
} else {
  console.log('Email quota exhausted');
}
```

### 2. Using Middleware

```typescript
import { checkQuota } from './middleware/quotaMiddleware';
import { FEATURE_SLUGS } from './utils/quotaUtils';

// Protect a route
router.post(
  '/send-email',
  checkQuota(FEATURE_SLUGS.EMAIL_MESSAGES),
  emailController.sendEmail
);
```

### 3. Deduct Usage After Operation

```typescript
import { safeDeductUsage } from './utils/quotaUtils';
import { FEATURE_SLUGS } from './utils/quotaUtils';

// In your controller after successful operation
const result = await emailController.sendEmail(emailData);

if (result.success) {
  await safeDeductUsage(
    userId,
    FEATURE_SLUGS.EMAIL_MESSAGES,
    1,
    `Email to ${result.recipient}`
  );
}
```

### 4. Batch Operations

```typescript
import { batchDeductUsage } from './utils/quotaUtils';
import { FEATURE_SLUGS } from './utils/quotaUtils';

// Deduct multiple features for a complex operation
const result = await batchDeductUsage(userId, [
  { featureSlug: FEATURE_SLUGS.EMAIL_MESSAGES, amount: 1 },
  { featureSlug: FEATURE_SLUGS.API_CALLS, amount: 5 },
  { featureSlug: FEATURE_SLUGS.STORAGE_GB, amount: 0.5 }
]);

if (result.success) {
  console.log('All quotas deducted successfully');
}
```

### 5. Refund Usage

```typescript
import { safeDeductUsage } from './utils/quotaUtils';
import { FEATURE_SLUGS } from './utils/quotaUtils';

// Refund if operation fails or is cancelled
await QuotaEngine.refundUsage(
  userId,
  FEATURE_SLUGS.EMAIL_MESSAGES,
  1,
  'Email send failed - network error'
);
```

### 6. Check Quota Status

```typescript
import { getQuotaStatus, formatQuotaDisplay } from './utils/quotaUtils';

const quota = await QuotaEngine.checkQuota(userId, FEATURE_SLUGS.EMAIL_MESSAGES);
const status = getQuotaStatus(quota.remaining, quota.limit);
const display = formatQuotaDisplay(quota.remaining, quota.limit);

// status: 'exhausted' | 'critical' | 'warning' | 'caution' | 'good'
console.log(`Status: ${status}, Display: ${display}`); // e.g., "Status: caution, Display: 250/1000 (25%)"
```

### 7. Admin Quota Adjustment

```typescript
import QuotaEngine from './utils/quotaEngine';
import { FEATURE_SLUGS } from './utils/quotaUtils';

// Admin grants extra quota
await QuotaEngine.adjustQuota(
  userId,
  FEATURE_SLUGS.EMAIL_MESSAGES,
  1000,
  'Manual adjustment - customer support request #12345'
);
```

## Integration Patterns

### Pattern 1: Email Sending

```typescript
// emailController.ts
import { checkQuota } from '../middleware/quotaMiddleware';
import { safeDeductUsage } from '../utils/quotaUtils';
import { FEATURE_SLUGS } from '../utils/quotaUtils';

router.post(
  '/send',
  checkQuota(FEATURE_SLUGS.EMAIL_MESSAGES),
  async (req, res) => {
    try {
      const result = await sendEmail(req.body);

      // Deduct after successful send
      await safeDeductUsage(
        req.body.userId,
        FEATURE_SLUGS.EMAIL_MESSAGES,
        1,
        `Email sent to ${req.body.recipient}`
      );

      res.json({ status: true, data: result });
    } catch (error) {
      res.status(500).json({ status: false, message: error.message });
    }
  }
);
```

### Pattern 2: Campaign Creation

```typescript
// campaignController.ts
import QuotaEngine from '../utils/quotaEngine';
import { FEATURE_SLUGS } from '../utils/quotaUtils';

async function createCampaign(req: Request, res: Response) {
  try {
    const userId = req.body.userId;

    // Check quota before creating
    const quota = await QuotaEngine.checkQuota(userId, FEATURE_SLUGS.CAMPAIGNS);
    if (!quota.allowed) {
      return res.status(429).json({
        status: false,
        message: 'Campaign quota exhausted',
        remaining: quota.remaining,
        limit: quota.limit
      });
    }

    // Create campaign
    const campaign = await Campaign.create(req.body);

    // Deduct quota
    await QuotaEngine.deductUsage({
      userId,
      featureSlug: FEATURE_SLUGS.CAMPAIGNS,
      amount: 1,
      source: 'consumption',
      description: `Campaign created: ${campaign.id}`
    });

    res.json({ status: true, data: campaign });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
}
```

### Pattern 3: Multiple Feature Check

```typescript
import { checkMultipleQuotas } from '../middleware/quotaMiddleware';
import { FEATURE_SLUGS } from '../utils/quotaUtils';

// Complex operation requiring multiple quotas
router.post(
  '/complex-action',
  checkMultipleQuotas([
    FEATURE_SLUGS.EMAIL_MESSAGES,
    FEATURE_SLUGS.STORAGE_GB,
    FEATURE_SLUGS.API_CALLS
  ]),
  complexController.handle
);
```

## API Endpoints

```
GET  /api/quota/check/:featureSlug           - Check quota availability
GET  /api/quota/usage/:featureSlug           - Get usage statistics
GET  /api/quota/dashboard                    - Get all features usage
GET  /api/quota/ledger/:featureSlug          - Get transaction history
GET  /api/quota/addons                       - List available addons
POST /api/quota/deduct                       - Deduct usage (internal)
POST /api/quota/refund                       - Refund usage
POST /api/quota/adjust                       - Admin: Adjust quota
```

## Migration from Old System

### Step 1: Initialize Existing Users

```typescript
// Run once: Initialize quota for existing subscriptions
const subscriptions = await Subscription.findAll();

for (const sub of subscriptions) {
  await QuotaEngine.initializePlanQuota(
    sub.id,
    sub.user_id,
    sub.plan_id
  );
}
```

### Step 2: Replace Old Middleware

Replace old limit checks:

```typescript
// OLD
import checkEmailAddLimit from './middleware/checkEmailAddLimit';

// NEW
import { checkQuota } from './middleware/quotaMiddleware';
import { FEATURE_SLUGS } from './utils/quotaUtils';

router.post('/add-email', checkQuota(FEATURE_SLUGS.EMAIL_ACCOUNTS), controller);
```

### Step 3: Update Controllers

Add deduction calls after successful operations:

```typescript
// In controller after operation succeeds
await safeDeductUsage(userId, featureSlug, amount, description);
```

## Best Practices

### 1. Always Use Feature Slugs Constants

```typescript
// ✅ Good
import { FEATURE_SLUGS } from './utils/quotaUtils';
await QuotaEngine.checkQuota(userId, FEATURE_SLUGS.EMAIL_MESSAGES);

// ❌ Avoid
await QuotaEngine.checkQuota(userId, 'email_messages');
```

### 2. Deduct After Confirmation

```typescript
// ✅ Good: Deduct after operation succeeds
const result = await sendEmail(data);
if (result.success) {
  await safeDeductUsage(userId, featureSlug, 1);
}

// ❌ Avoid: Deducting before operation
await safeDeductUsage(userId, featureSlug, 1);
const result = await sendEmail(data); // May fail!
```

### 3. Handle Errors Gracefully

```typescript
// ✅ Good: Errors don't block
const deduction = await safeDeductUsage(userId, featureSlug, 1);
if (!deduction.success) {
  logger.warn('Failed to deduct quota:', deduction.message);
  // Don't fail the entire operation
}

// ❌ Avoid: Blocking on quota errors
try {
  await QuotaEngine.deductUsage(...); // May throw
} catch (error) {
  // Now the user-facing operation fails
}
```

### 4. Log Everything

```typescript
// Include quota info in logs
const quota = await QuotaEngine.checkQuota(userId, featureSlug);
logger.info('Quota check', {
  userId,
  featureSlug,
  remaining: quota.remaining,
  used: quota.used,
  limit: quota.limit
});
```

### 5. Monitor Quota Depletion

```typescript
// Alert when quota is low
if (await isQuotaLow(userId, FEATURE_SLUGS.EMAIL_MESSAGES, 20)) {
  await sendWarningEmail(userId, 'Email quota is running low');
}
```

## Testing

### Test Quota Check

```typescript
const result = await QuotaEngine.checkQuota(testUserId, FEATURE_SLUGS.EMAIL_MESSAGES);
expect(result.allowed).toBe(true);
expect(result.remaining).toBeGreaterThan(0);
```

### Test Deduction

```typescript
const before = await QuotaEngine.checkQuota(testUserId, FEATURE_SLUGS.EMAIL_MESSAGES);
await QuotaEngine.deductUsage({
  userId: testUserId,
  featureSlug: FEATURE_SLUGS.EMAIL_MESSAGES,
  amount: 10,
  source: 'consumption'
});
const after = await QuotaEngine.checkQuota(testUserId, FEATURE_SLUGS.EMAIL_MESSAGES);
expect(after.used).toBe(before.used + 10);
```

## Performance Optimization

- **Indexes**: The schema includes `user_feature_idx` on ledger for fast lookups
- **Caching**: Consider caching quota checks for 5-10 seconds per user
- **Batch Operations**: Use `batchDeductUsage()` for multiple features

## Troubleshooting

### Issue: "No subscription found"
- Check: User has active subscription in correct status
- Fix: `select * from subscriptions where user_id = X AND status = 'active'`

### Issue: "Balance calculation incorrect"
- Check: Ledger entries are accurate
- Fix: Rebuild balance: `UPDATE ledger SET balance_after = X WHERE...`

### Issue: Slow quota checks
- Check: Database indexes exist
- Fix: `CREATE INDEX user_feature_idx ON ledger(user_id, feature_id)`

## Support

For issues or questions:
1. Check ledger entries: `SELECT * FROM ledger WHERE user_id = X`
2. Verify subscription: `SELECT * FROM subscriptions WHERE user_id = X`
3. Check features: `SELECT * FROM features WHERE slug = 'X'`
