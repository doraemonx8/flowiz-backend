/**
 * Quota Configuration
 * Central configuration for quota engine behavior
 */

// ============================================================================
// QUOTA BEHAVIOR CONFIGURATION
// ============================================================================

export interface QuotaConfig {
  // Enable/disable quota enforcement
  enabled: boolean;
  // How strict the enforcement is
  // 'strict': Block all over-limit operations
  // 'warn': Log warnings but allow operation
  // 'soft': Only track, don't enforce
  strictMode: 'strict' | 'warn' | 'soft';

  // Enable automatic refunds on failed operations
  autoRefundOnFailure: boolean;

  // Ledger retention (days) - set to 0 for unlimited
  ledgerRetentionDays: number;

  // Cache configuration
  cache: {
    enabled: boolean;
    ttlSeconds: number; // How long to cache quota checks
  };

  // Notifications
  notifications: {
    lowQuotaThreshold: number; // Percentage (e.g., 20%)
    enableLowQuotaNotification: boolean;
    enableExhaustedNotification: boolean;
  };

  // Logging
  logging: {
    logAllChecks: boolean;
    logAllDeductions: boolean;
    logFailures: boolean;
  };
}

// ============================================================================
// ENVIRONMENT-SPECIFIC CONFIGURATIONS
// ============================================================================

const configs: Record<string, QuotaConfig> = {
  development: {
    enabled: true,
    strictMode: 'warn',
    autoRefundOnFailure: true,
    ledgerRetentionDays: 360,
    cache: {
      enabled: false,
      ttlSeconds: 0,
    },
    notifications: {
      lowQuotaThreshold: 20,
      enableLowQuotaNotification: true,
      enableExhaustedNotification: true,
    },
    logging: {
      logAllChecks: true,
      logAllDeductions: true,
      logFailures: true,
    },
  },

  staging: {
    enabled: true,
    strictMode: 'strict',
    autoRefundOnFailure: true,
    ledgerRetentionDays: 180,
    cache: {
      enabled: true,
      ttlSeconds: 5,
    },
    notifications: {
      lowQuotaThreshold: 20,
      enableLowQuotaNotification: true,
      enableExhaustedNotification: true,
    },
    logging: {
      logAllChecks: false,
      logAllDeductions: true,
      logFailures: true,
    },
  },

  production: {
    enabled: true,
    strictMode: 'strict',
    autoRefundOnFailure: true,
    ledgerRetentionDays: 365,
    cache: {
      enabled: true,
      ttlSeconds: 10,
    },
    notifications: {
      lowQuotaThreshold: 20,
      enableLowQuotaNotification: true,
      enableExhaustedNotification: true,
    },
    logging: {
      logAllChecks: false,
      logAllDeductions: false,
      logFailures: true,
    },
  },
};

// ============================================================================
// FEATURE-SPECIFIC CONFIGURATIONS
// ============================================================================

export interface FeatureConfig {
  slug: string;
  name: string;
  softLimit?: number; // Optional soft limit before hard limit
  allowNegativeBalance?: boolean;
  requiresApproval?: boolean;
  trackingUnit?: string; // e.g., "emails", "messages", "GB"
}

export const FEATURE_CONFIGS: Record<string, FeatureConfig> = {
  email_messages: {
    slug: 'email_messages',
    name: 'Email Messages',
    softLimit: 80, // Warn at 80%
    allowNegativeBalance: false,
    requiresApproval: false,
    trackingUnit: 'emails',
  },

  whatsapp_messages: {
    slug: 'whatsapp_messages',
    name: 'WhatsApp Messages',
    softLimit: 80,
    allowNegativeBalance: false,
    requiresApproval: false,
    trackingUnit: 'messages',
  },

  chatbot_messages: {
    slug: 'chatbot_messages',
    name: 'Chatbot Messages',
    softLimit: 80,
    allowNegativeBalance: false,
    requiresApproval: false,
    trackingUnit: 'messages',
  },

  leads: {
    slug: 'leads',
    name: 'Leads',
    softLimit: 80,
    allowNegativeBalance: false,
    requiresApproval: false,
    trackingUnit: 'leads',
  },

  campaigns: {
    slug: 'campaigns',
    name: 'Campaigns',
    softLimit: 80,
    allowNegativeBalance: false,
    requiresApproval: false,
    trackingUnit: 'campaigns',
  },


  api_calls: {
    slug: 'api_calls',
    name: 'API Calls',
    softLimit: 85,
    allowNegativeBalance: false,
    requiresApproval: false,
    trackingUnit: 'calls',
  },
};

// ============================================================================
// RATE LIMITING CONFIGURATION
// ============================================================================

export interface RateLimitConfig {
  feature: string;
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests in window
  message: string;
}

export const RATE_LIMIT_CONFIGS: RateLimitConfig[] = [
  {
    feature: 'email_messages',
    windowMs: 60000, // 1 minute
    maxRequests: 100,
    message: 'Too many email operations in a short time',
  },
  {
    feature: 'api_calls',
    windowMs: 1000, // 1 second
    maxRequests: 10,
    message: 'API rate limit exceeded',
  },
];

// ============================================================================
// QUOTA TIERS (For upgrading)
// ============================================================================

export interface QuotaTier {
  name: string;
  basePrice: number; // in cents
  features: Record<string, number>; // feature_slug => limit
}

export const QUOTA_TIERS: QuotaTier[] = [
  {
    name: 'Starter',
    basePrice: 0,
    features: {
      email_messages: 1000,
      whatsapp_messages: 0,
      sms_messages: 0,
      leads: 100,
      campaigns: 5,
      storage_gb: 1,
      api_calls: 10000,
    },
  },
  {
    name: 'Pro',
    basePrice: 9900, // $99
    features: {
      email_messages: 50000,
      whatsapp_messages: 10000,
      sms_messages: 5000,
      leads: 5000,
      campaigns: 50,
      storage_gb: 10,
      api_calls: 1000000,
    },
  },
  {
    name: 'Enterprise',
    basePrice: 29900, // $299
    features: {
      email_messages: 500000,
      whatsapp_messages: 100000,
      sms_messages: 50000,
      leads: 50000,
      campaigns: 500,
      storage_gb: 100,
      api_calls: 10000000,
    },
  },
];

// ============================================================================
// GET CONFIGURATION
// ============================================================================

export function getConfig(env?: string): QuotaConfig {
  const environment = env || process.env.NODE_ENV || 'development';
  return configs[environment] || configs['development'];
}

export function getFeatureConfig(slug: string): FeatureConfig | null {
  return FEATURE_CONFIGS[slug] || null;
}

export function getTier(tierName: string): QuotaTier | null {
  return QUOTA_TIERS.find((t) => t.name === tierName) || null;
}

export default {
  configs,
  FEATURE_CONFIGS,
  RATE_LIMIT_CONFIGS,
  QUOTA_TIERS,
  getConfig,
  getFeatureConfig,
  getTier,
};
