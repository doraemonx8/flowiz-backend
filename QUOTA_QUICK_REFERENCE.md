# Quota Engine - Quick Reference

## Installation (Get Started in 5 Minutes)

### 1. Initialize Database
```typescript
import { setupQuotaSystem } from './scripts/quotaSetup';
await setupQuotaSystem();
```

### 2. Add Routes to Express
```typescript
import quotaRouter from './routes/quotaRoutes';
app.use('/api/quota', quotaRouter);
```

### 3. Protect a Route
```typescript
import { checkQuota } from './middleware/quotaMiddleware';
import { FEATURE_SLUGS } from './utils/quotaUtils';

router.post(
  '/send-email',
  checkQuota(FEATURE_SLUGS.EMAIL_MESSAGES),
  controller.sendEmail
);
```

### 4. Deduct Usage (In Controller)
```typescript
import { safeDeductUsage } from './utils/quotaUtils';
import { FEATURE_SLUGS } from './utils/quotaUtils';

// After operation succeeds:
await safeDeductUsage(
  userId,
  FEATURE_SLUGS.EMAIL_MESSAGES,
  1,
  'Email sent to user@example.com'
);
```

---

## API Endpoints

```bash
# Check quota
GET /api/quota/check/email_messages

# Get usage stats
GET /api/quota/usage/email_messages

# Get all features dashboard
GET /api/quota/dashboard

# Get transaction history
GET /api/quota/ledger/email_messages?limit=50&offset=0

# Get available addons
GET /api/quota/addons

# Deduct usage (internal)
POST /api/quota/deduct
Body: { userId, featureSlug, amount, description }

# Refund usage
POST /api/quota/refund
Body: { userId, featureSlug, amount, description }

# Admin: Adjust quota
POST /api/quota/adjust
Body: { userId, featureSlug, amount, description }
```

---

## Feature Slugs

```typescript
import { FEATURE_SLUGS } from './utils/quotaUtils';

FEATURE_SLUGS.EMAIL_MESSAGES        // 'email_messages'
FEATURE_SLUGS.WHATSAPP_MESSAGES     // 'whatsapp_messages'
FEATURE_SLUGS.SMS_MESSAGES          // 'sms_messages'
FEATURE_SLUGS.LEADS                 // 'leads'
FEATURE_SLUGS.CRAWLED_LEADS         // 'crawled_leads'
FEATURE_SLUGS.CAMPAIGNS             // 'campaigns'
FEATURE_SLUGS.FAQ_ARTICLES          // 'faq_articles'
FEATURE_SLUGS.CHAT_CONVERSATIONS    // 'chat_conversations'
FEATURE_SLUGS.API_CALLS             // 'api_calls'
FEATURE_SLUGS.STORAGE_GB            // 'storage_gb'
FEATURE_SLUGS.CUSTOM_DOMAINS        // 'custom_domains'
FEATURE_SLUGS.EMAIL_ACCOUNTS        // 'email_accounts'
```

---

## Common Patterns

### Pattern 1: Check Then Execute
```typescript
import QuotaEngine from './utils/quotaEngine';
import { FEATURE_SLUGS } from './utils/quotaUtils';

const quota = await QuotaEngine.checkQuota(userId, FEATURE_SLUGS.CAMPAIGNS);

if (!quota.allowed) {
  return res.status(429).json({
    message: 'Quota exhausted',
    remaining: quota.remaining,
    limit: quota.limit
  });
}

// Execute operation...
```

### Pattern 2: Safe Wrapper with Error Handling
```typescript
import { safeDeductUsage } from './utils/quotaUtils';

const result = await safeDeductUsage(userId, FEATURE_SLUGS.EMAIL_MESSAGES, 1);

if (!result.success) {
  logger.warn('Failed to deduct:', result.message);
  // Don't fail the operation, just log
}
```

### Pattern 3: Batch Operations
```typescript
import { batchDeductUsage } from './utils/quotaUtils';

const result = await batchDeductUsage(userId, [
  { featureSlug: FEATURE_SLUGS.EMAIL_MESSAGES, amount: 1 },
  { featureSlug: FEATURE_SLUGS.STORAGE_GB, amount: 0.5 }
]);

if (result.success) {
  // All succeeded
}
```

### Pattern 4: Automatic Quota Management
```typescript
import { GenericQuotaService } from './services/quotaIntegration';

const result = await GenericQuotaService.executeWithQuotaCheck(
  userId,
  FEATURE_SLUGS.CAMPAIGNS,
  async () => {
    // Your operation
    return await Campaign.create(data);
  },
  {
    deductAmount: 1,
    description: 'Campaign created',
    refundOnFailure: true
  }
);
```

### Pattern 5: Check Multiple Features
```typescript
import { checkMultipleQuotas } from './middleware/quotaMiddleware';
import { FEATURE_SLUGS } from './utils/quotaUtils';

router.post(
  '/complex-action',
  checkMultipleQuotas([
    FEATURE_SLUGS.EMAIL_MESSAGES,
    FEATURE_SLUGS.STORAGE_GB
  ]),
  controller.handle
);
```

---

## Response Examples

### Quota Check Success
```json
{
  "status": true,
  "data": {
    "allowed": true,
    "remaining": 450,
    "used": 550,
    "limit": 1000,
    "subscriptionId": 123,
    "status": "valid"
  }
}
```

### Quota Exhausted
```json
{
  "status": false,
  "message": "email_messages quota exhausted",
  "exhausted": "subscription",
  "type": "limit_reached",
  "remaining": 0,
  "limit": 1000,
  "used": 1000
}
```

### Deduction Success
```json
{
  "status": true,
  "data": {
    "success": true,
    "balance": 449,
    "ledgerId": 5678,
    "message": "Usage deducted successfully"
  }
}
```

### Insufficient Quota for Deduction
```json
{
  "status": false,
  "message": "Insufficient quota. Available: 0, Required: 1",
  "balance": 0,
  "ledgerId": 0
}
```

---

## Debugging

### Check User's Current Quota
```sql
SELECT 
  f.slug,
  COALESCE(SUM(CASE WHEN l.is_deposit = 0 THEN l.amount ELSE 0 END), 0) as used,
  COALESCE(SUM(CASE WHEN l.is_deposit = 1 THEN l.amount ELSE 0 END), 0) as allocated
FROM ledger l
INNER JOIN features f ON f.id = l.feature_id
WHERE l.user_id = 123 AND l.is_deleted = '0'
GROUP BY f.slug;
```

### View Last 10 Transactions for a User
```sql
SELECT * FROM ledger 
WHERE user_id = 123 AND is_deleted = '0'
ORDER BY created_on DESC
LIMIT 10;
```

### Check User's Subscription
```sql
SELECT s.*, p.name as plan_name
FROM subscriptions s
LEFT JOIN plans p ON p.id = s.plan_id
WHERE s.user_id = 123 AND s.is_deleted = '0';
```

### Check Plan Limits
```sql
SELECT f.name, pf.limit_value
FROM plan_features pf
INNER JOIN features f ON f.id = pf.feature_id
WHERE pf.plan_id = 1; -- Pro plan
```

---

## Configuration

### Change Mode (Development vs Production)
```typescript
import { getConfig } from './config/quotaConfig';

const config = getConfig('production'); // or 'staging', 'development'
```

### Customize Feature Config
```typescript
import { FEATURE_CONFIGS } from './config/quotaConfig';

const emailConfig = FEATURE_CONFIGS.email_messages;
// { slug, name, softLimit, allowNegativeBalance, trackingUnit }
```

### Customize Quota Tiers
Edit `src/config/quotaConfig.ts::QUOTA_TIERS` to change plan limits.

---

## Error Codes

| Code | Meaning | Solution |
|------|---------|----------|
| 400 | Missing userId/featureSlug | Check request parameters |
| 401 | Not authenticated | Add auth token to request |
| 402 | Insufficient quota | Upgrade plan or use addon |
| 404 | Feature/subscription not found | Verify feature slug and user subscription |
| 429 | Quota exhausted | Upgrade plan or wait for renewal |
| 500 | Server error | Check logs, may be database issue |

---

## Performance Tips

1. **Cache quota checks** for 5-10 seconds per user
2. **Batch deductions** for bulk operations
3. **Use indexes**: Ensure `user_feature_idx` exists on ledger table
4. **Monitor slow queries** in database logs
5. **Archive old ledger entries** after 1 year

---

## Common Issues & Solutions

### Issue: "No subscription found"
**Solution:**
```sql
-- Verify user has subscription
SELECT * FROM subscriptions 
WHERE user_id = 123 AND status IN ('active', 'on_trial');

-- If empty, create subscription or check if status is correct
```

### Issue: "Balance calculation incorrect"
**Solution:**
```sql
-- Verify ledger entries
SELECT * FROM ledger 
WHERE user_id = 123 
ORDER BY created_on DESC 
LIMIT 5;

-- Check if balance_after values are incrementing correctly
```

### Issue: "Quota check is slow"
**Solution:**
1. Verify index exists: `SHOW INDEX FROM ledger;`
2. Check query execution: `EXPLAIN SELECT...`
3. Consider caching quota checks

### Issue: "Deduction fails silently"
**Solution:**
- Enable logging: `config.logging.logAllDeductions = true`
- Check error logs for details
- Verify feature exists and is active

---

## Testing

### Test Quota Check
```typescript
const quota = await QuotaEngine.checkQuota(userId, 'email_messages');
expect(quota.allowed).toBe(true);
```

### Test Deduction
```typescript
const before = await QuotaEngine.checkQuota(userId, 'email_messages');
await QuotaEngine.deductUsage({
  userId,
  featureSlug: 'email_messages',
  amount: 10,
  source: 'consumption'
});
const after = await QuotaEngine.checkQuota(userId, 'email_messages');
expect(after.used).toBe(before.used + 10);
```

### Test API Endpoint
```bash
curl -X GET http://localhost:3000/api/quota/check/email_messages \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": 123}'
```

---

## Next Steps

1. **Setup**: Run `setupQuotaSystem()` to initialize database
2. **Migrate**: Run `migrateExistingSubscriptions()` for existing users
3. **Integrate**: Add quota checks to your controllers
4. **Test**: Verify quota deductions work correctly
5. **Monitor**: Watch for errors and optimize
6. **Scale**: Add features like quota alerts and analytics

---

## Need Help?

- 📖 Full Guide: See `QUOTA_ENGINE_GUIDE.md`
- ✅ Checklist: See `QUOTA_IMPLEMENTATION_CHECKLIST.md`
- 💻 Examples: See `src/services/quotaIntegration.ts`
- ⚙️ Config: Edit `src/config/quotaConfig.ts`
- 🐛 Debug: Check SQL queries above

Good luck! 🚀
