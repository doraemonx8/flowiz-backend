/**
 * Quota Utilities
 * Helper functions and constants for quota management
 */
import QuotaEngine from "./quotaEngine";

// ============================================================================
// ERROR MESSAGES
// ============================================================================

export const QUOTA_ERROR_MESSAGES = {
  NO_SUBSCRIPTION: "No active subscription found",
  SUBSCRIPTION_EXPIRED: "Subscription period has expired",
  QUOTA_EXHAUSTED: (feature: string) => `${feature} quota has been exhausted`,
  INSUFFICIENT_QUOTA: (feature: string, required: number, available: number) =>
    `Insufficient ${feature} quota. Required: ${required}, Available: ${available}`,
  FEATURE_NOT_FOUND: "Feature not found or is disabled",
  ERROR_CHECKING_QUOTA: "An error occurred while checking quota",
  ERROR_DEDUCTING_QUOTA: "An error occurred while deducting usage",
} as const;

// ============================================================================
// FEATURE SLUGS
// ============================================================================

// Matches the slugs defined in quotaConfig.ts
export const FEATURE_SLUGS = {
  EMAIL_MESSAGES: 'email_messages',
  WHATSAPP_MESSAGES: 'whatsapp_messages',
  CHATBOT_MESSAGES: 'chatbot_messages',
  LEADS: 'leads',
  CAMPAIGNS: 'campaigns',
  API_CALLS: 'api_calls',
} as const;

// ============================================================================
// SAFE WRAPPERS
// ============================================================================

/**
 * Safely check quota without throwing errors (returns allowed: false on error)
 */
export async function safeCheckQuota(userId: number, featureSlug: string) {
  try {
    const result = await QuotaEngine.checkQuota(userId, featureSlug);
    return {
      ...result,
      // message: result.allowed ? 'Quota available' : (result.status === 'subscription_expired' ? QUOTA_ERROR_MESSAGES.SUBSCRIPTION_EXPIRED : QUOTA_ERROR_MESSAGES.QUOTA_EXHAUSTED(featureSlug))
      message: result.reason
    };
  } catch (error) {
    console.error(`Safe check quota error for ${featureSlug}:`, error);
    return {
      allowed: false,
      remaining: 0,
      used: 0,
      limit: 0,
      subscriptionId: 0,
      status: 'error',
      message: QUOTA_ERROR_MESSAGES.ERROR_CHECKING_QUOTA
    };
  }
}

/**
 * Safely deduct usage without throwing errors
 */
export async function safeDeductUsage(userId: number, featureSlug: string, amount: number = 1, description?: string) {
  try {
    const result = await QuotaEngine.deductUsage({
      userId,
      featureSlug,
      amount,
      source: 'consumption',
      description
    });
    return result;
  } catch (error) {
    console.error(`Safe deduct usage error for ${featureSlug}:`, error);
    return {
      success: false,
      balance: 0,
      ledgerId: 0,
      message: QUOTA_ERROR_MESSAGES.ERROR_DEDUCTING_QUOTA
    };
  }
}

/**
 * Format quota for UI display (e.g., "50 / 100")
 */
export function formatQuotaDisplay(remaining: number, limit: number): string {
  if (limit <= 0) return '0 / 0';
  const used = Math.max(0, limit - remaining);
  return `${used} / ${limit}`;
}

export default {
  QUOTA_ERROR_MESSAGES,
  FEATURE_SLUGS,
  safeCheckQuota,
  safeDeductUsage,
  formatQuotaDisplay
};
