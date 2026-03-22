/**
 * Quota Integration Service
 * Demonstrates how to integrate quota management into your existing services
 * Use this as a template for your specific features
 */

import QuotaEngine from '../utils/quotaEngine';
import {FEATURE_SLUGS,safeDeductUsage,safeCheckQuota,formatQuotaDisplay,} from '../utils/quotaUtils';
import { getConfig, getFeatureConfig } from '../config/quotaConfig';

// ============================================================================
// SERVICE INTERFACE
// ============================================================================

export interface QuotaServiceOptions {
  userId: number;
  featureSlug: string;
  throwOnFailure?: boolean; // Throw error instead of returning false
}

export interface OperationResult {
  success: boolean;
  message: string;
  quotaInfo?: {
    remaining: number;
    used: number;
    limit: number;
  };
}

// ============================================================================
// EMAIL SERVICE WITH QUOTA INTEGRATION
// ============================================================================

export class EmailQuotaService {
  /**
   * Send email with quota deduction
   */
  static async sendEmail(
    userId: number,
    emailData: {
      to: string;
      subject: string;
      body: string;
    }
  ): Promise<OperationResult> {
    try {
      const config = getConfig();

      // 1. Check quota before operation
      const quota = await safeCheckQuota(userId, FEATURE_SLUGS.EMAIL_MESSAGES);

      if (!quota.allowed) {
        return {
          success: false,
          message: quota.message,
          quotaInfo: {
            remaining: 0,
            used: 0,
            limit: 0,
          },
        };
      }

      // 2. Perform actual email sending
      const emailResult = await this.sendEmailToProvider(emailData);

      if (!emailResult.success) {
        return {
          success: false,
          message: `Email failed: ${emailResult.error}`,
        };
      }

      // 3. Deduct quota after successful send
      const deduction = await safeDeductUsage(
        userId,
        FEATURE_SLUGS.EMAIL_MESSAGES,
        1,
        `Email to ${emailData.to}`
      );

      if (!deduction.success && config.logging.logFailures) {
        console.warn('Failed to deduct email quota:', deduction.message);
        // Don't fail the operation, just log it
      }

      return {
        success: true,
        message: 'Email sent successfully',
        quotaInfo: {
          remaining: quota.remaining - 1,
          used: quota.remaining,
          limit: quota.limit,
        },
      };
    } catch (error) {
      console.error('Email sending error:', error);
      return {
        success: false,
        message: 'An error occurred while sending email',
      };
    }
  }

  /**
   * Send batch emails
   */
  static async sendBatchEmails(
    userId: number,
    emails: Array<{ to: string; subject: string; body: string }>
  ): Promise<OperationResult> {
    try {
      // 1. Check if user has quota for all emails
      const quota = await QuotaEngine.checkQuota(
        userId,
        FEATURE_SLUGS.EMAIL_MESSAGES
      );

      if (quota.remaining < emails.length) {
        return {
          success: false,
          message: `Insufficient quota. Available: ${quota.remaining}, Required: ${emails.length}`,
          quotaInfo: {
            remaining: quota.remaining,
            used: quota.used,
            limit: quota.limit,
          },
        };
      }

      // 2. Send emails (with error handling per email)
      const results = await Promise.all(
        emails.map((email) => this.sendEmailToProvider(email))
      );

      const successCount = results.filter((r) => r.success).length;

      // 3. Deduct only for successfully sent emails
      if (successCount > 0) {
        await safeDeductUsage(
          userId,
          FEATURE_SLUGS.EMAIL_MESSAGES,
          successCount,
          `Batch sent: ${successCount}/${emails.length}`
        );
      }

      return {
        success: true,
        message: `${successCount}/${emails.length} emails sent`,
        quotaInfo: {
          remaining: quota.remaining - successCount,
          used: quota.used + successCount,
          limit: quota.limit,
        },
      };
    } catch (error) {
      console.error('Batch email error:', error);
      return {
        success: false,
        message: 'An error occurred while sending batch emails',
      };
    }
  }

  private static async sendEmailToProvider(emailData: any): Promise<any> {
    // Simulate email sending - replace with actual provider
    // (e.g., SendGrid, AWS SES, etc.)
    return { success: true, messageId: 'msg_' + Date.now() };
  }
}

// ============================================================================
// CAMPAIGN SERVICE WITH QUOTA INTEGRATION
// ============================================================================

export class CampaignQuotaService {
  /**
   * Create campaign with quota check
   */
  static async createCampaign(
    userId: number,
    campaignData: any
  ): Promise<OperationResult> {
    try {
      // 1. Check campaign quota
      const quota = await safeCheckQuota(userId, FEATURE_SLUGS.CAMPAIGNS);

      if (!quota.allowed) {
        return {
          success: false,
          message: quota.message,
        };
      }

      // 2. Create campaign in database
      const campaign = await this.createCampaignInDB(userId, campaignData);

      if (!campaign) {
        return {
          success: false,
          message: 'Failed to create campaign',
        };
      }

      // 3. Deduct quota
      await safeDeductUsage(
        userId,
        FEATURE_SLUGS.CAMPAIGNS,
        1,
        `Campaign created: ${campaign.id}`
      );

      return {
        success: true,
        message: 'Campaign created successfully',
        quotaInfo: {
          remaining: quota.remaining - 1,
          used: quota.remaining,
          limit: quota.limit,
        },
      };
    } catch (error) {
      console.error('Campaign creation error:', error);
      return {
        success: false,
        message: 'An error occurred while creating campaign',
      };
    }
  }

  private static async createCampaignInDB(userId: number, data: any): Promise<any> {
    // Simulate campaign creation
    return { id: 'camp_' + Date.now(), ...data };
  }
}

// ============================================================================
// LEAD SERVICE WITH QUOTA INTEGRATION
// ============================================================================

export class LeadQuotaService {
  /**
   * Import leads with quota validation
   */
  static async importLeads(
    userId: number,
    leads: any[],
    source: string
  ): Promise<OperationResult> {
    try {
      const config = getConfig();

      // 1. Check quota for lead count
      const quota = await QuotaEngine.checkQuota(userId, FEATURE_SLUGS.LEADS);

      if (quota.remaining < leads.length) {
        return {
          success: false,
          message: `Cannot import ${leads.length} leads. Available quota: ${quota.remaining}`,
          quotaInfo: {
            remaining: quota.remaining,
            used: quota.used,
            limit: quota.limit,
          },
        };
      }

      // 2. Import leads
      const importResult = await this.importLeadsToStorage(userId, leads, source);

      if (importResult.importedCount === 0) {
        return {
          success: false,
          message: 'No leads were imported',
        };
      }

      // 3. Deduct quota for imported leads
      await safeDeductUsage(
        userId,
        FEATURE_SLUGS.LEADS,
        importResult.importedCount,
        `Imported ${importResult.importedCount} leads from ${source}`
      );

      return {
        success: true,
        message: `${importResult.importedCount} leads imported`,
        quotaInfo: {
          remaining: quota.remaining - importResult.importedCount,
          used: quota.used + importResult.importedCount,
          limit: quota.limit,
        },
      };
    } catch (error) {
      console.error('Lead import error:', error);
      return {
        success: false,
        message: 'An error occurred while importing leads',
      };
    }
  }

  private static async importLeadsToStorage(
    userId: number,
    leads: any[],
    source: string
  ): Promise<any> {
    // Simulate import
    return { importedCount: leads.length };
  }
}

// ============================================================================
// GENERIC QUOTA SERVICE
// ============================================================================

export class GenericQuotaService {
  /**
   * Execute operation with automatic quota management
   * Use this for custom features
   */
  static async executeWithQuotaCheck<T>(
    userId: number,
    featureSlug: string,
    operation: () => Promise<T>,
    options?: {
      deductAmount?: number;
      description?: string;
      refundOnFailure?: boolean;
    }
  ): Promise<{
    success: boolean;
    result?: T;
    message: string;
  }> {
    const deductAmount = options?.deductAmount || 1;
    const refundOnFailure = options?.refundOnFailure ?? true;

    try {
      // 1. Check quota
      const quota = await QuotaEngine.checkQuota(userId, featureSlug);

      if (!quota.allowed) {
        return {
          success: false,
          message: `${featureSlug} quota exhausted`,
        };
      }

      // 2. Execute operation
      const result = await operation();

      // 3. Deduct quota
      const deductResult = await safeDeductUsage(
        userId,
        featureSlug,
        deductAmount,
        options?.description
      );

      if (!deductResult.success) {
        console.warn('Failed to deduct quota:', deductResult.message);
      }

      return {
        success: true,
        result,
        message: 'Operation completed successfully',
      };
    } catch (error) {
      console.error(`Error in ${featureSlug} operation:`, error);

      // Optionally refund if operation failed
      if (refundOnFailure) {
        await safeDeductUsage(
          userId,
          featureSlug,
          deductAmount,
          `Refund: ${options?.description || 'Operation failed'}`
        );
      }

      return {
        success: false,
        message: 'Operation failed: ' + (error as Error).message,
      };
    }
  }

  /**
   * Get quota display information
   */
  static async getQuotaDisplay(userId: number, featureSlug: string): Promise<string> {
    try {
      const quota = await QuotaEngine.checkQuota(userId, featureSlug);
      return formatQuotaDisplay(quota.remaining, quota.limit);
    } catch (error) {
      console.error('Error getting quota display:', error);
      return 'N/A';
    }
  }

  /**
   * Check if quota is available before operation
   */
  static async canExecute(
    userId: number,
    featureSlug: string,
    requiredAmount: number = 1
  ): Promise<boolean> {
    try {
      const quota = await QuotaEngine.checkQuota(userId, featureSlug);
      return quota.remaining >= requiredAmount;
    } catch (error) {
      console.error('Error checking if can execute:', error);
      return false;
    }
  }
}

export default {
  EmailQuotaService,
  CampaignQuotaService,
  LeadQuotaService,
  GenericQuotaService,
};
