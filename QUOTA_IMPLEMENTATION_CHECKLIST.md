### Verify Routes are Accessible
- [ ] Test GET `/api/quota/dashboard` with auth token
- [ ] Test GET `/api/quota/check/email_messages`
- [ ] Test GET `/api/quota/usage/email_messages`

---

## Phase 4: Feature Integration (3-5 hours per feature)
For each major feature (email, campaign, leads, etc.):
### Email Feature Integration
#### Controllers
- [ ] Add quota check before sending email
  ```typescript
  import { checkQuota } from '../middleware/quotaMiddleware';
  router.post('/send', checkQuota(FEATURE_SLUGS.EMAIL_MESSAGES), emailController.send);
  ```
- [ ] Add usage deduction after successful send
  ```typescript
  await safeDeductUsage(userId, FEATURE_SLUGS.EMAIL_MESSAGES, 1, 'Email sent');
  ```
### Campaign Feature Integration

#### Controllers
- [ ] Add quota check before creating campaign
- [ ] Add usage deduction after creation
- [ ] Test with multiple campaigns
- [ ] Handle campaign updates (only deduct on creation)

### Lead Feature Integration

#### Controllers
- [ ] Add quota check for lead imports
- [ ] Deduct quota for each imported lead
- [ ] Handle bulk imports
- [ ] Test failure scenarios

### (Repeat for: WhatsApp, SMS, API, Storage, FAQ, etc.)

---


## Phase 6: Monitoring & Analytics (2-3 hours)

### Dashboard Endpoint
- [ ] Test `/api/quota/dashboard` returns all features
- [ ] Test filtering and pagination on `/api/quota/ledger/:feature`

### Quota Reporting
- [ ] Add quota usage charts
- [ ] Add alerts for low quota

---

## Phase 7: Testing (2-3 hours)

### Unit Tests
- [ ] Test `QuotaEngine.checkQuota()` returns correct values
- [ ] Test `QuotaEngine.deductUsage()` creates ledger entries
- [ ] Test `QuotaEngine.refundUsage()` correctly adds back quota
- [ ] Test balance calculations

### Integration Tests
- [ ] Test complete flow: check → deduct → verify
- [ ] Test addon quota addition
- [ ] Test subscription expiration
- [ ] Test no subscription scenario
- [ ] Test concurrent deductions

### End-to-End Tests
- [ ] Test email sending with quota deduction
- [ ] Test campaign creation with quota deduction
- [ ] Test lead import with quota deduction
- [ ] Test quota exhaustion blocks operations
- [ ] Test admin adjustment endpoint

### Load Testing
- [ ] Test high-volume deductions
- [ ] Test concurrent quota checks
- [ ] Verify database indexes are being used

---

### Code Cleanup
- [ ] Remove old quota-checking middleware files:
  - `checkEmailAddLimit.ts`
  - `checkCampaignCreationLimit.ts`
  - `checkLeadCreationLimit.tsx`
  - etc.

- [ ] Remove old authorization model functions:
  - `checkCampaignCount()`
  - `checkLeadCount()`
  - etc.

### Database Cleanup
- [ ] Archive old ledger tables if any
- [ ] Verify all indexes are working
- [ ] Run table optimization
  ```sql
  OPTIMIZE TABLE ledger;
  OPTIMIZE TABLE subscriptions;
  ```

## Files Created/Modified

### New Files Created
- ✅ `src/utils/quotaEngine.ts` - Core quota logic
- ✅ `src/middleware/quotaMiddleware.ts` - Route middleware
- ✅ `src/controllers/quotaController.ts` - API endpoints
- ✅ `src/routes/quotaRoutes.ts` - Route definitions
- ✅ `src/utils/quotaUtils.ts` - Helper utilities
- ✅ `src/config/quotaConfig.ts` - Configuration
- ✅ `src/services/quotaIntegration.ts` - Integration examples
- ✅ `src/scripts/quotaSetup.ts` - Setup scripts
- ✅ `QUOTA_ENGINE_GUIDE.md` - Implementation guide

### Files to Update
- [ ] `src/index.ts` - Add quota routes
- [ ] `src/controllers/emailController.ts` - Add quota checks
- [ ] `src/controllers/campaignController.ts` - Add quota checks
- [ ] `src/controllers/leadController.ts` - Add quota checks
- [ ] (And other feature controllers)

### Files to Remove (Old System)
- [ ] `src/middleware/checkEmailAddLimit.ts`
- [ ] `src/middleware/checkCampaignCreationLimit.ts`
- [ ] `src/middleware/checkCrawlLeadLimit.ts`
- [ ] `src/middleware/checkFaqAddLimit.ts`
- [ ] `src/middleware/checkWebMessageLimit.ts`
- [ ] (And similar old limit checking files)
