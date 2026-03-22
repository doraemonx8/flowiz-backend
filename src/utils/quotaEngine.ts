// Unified Quota Management Engine Handles subscription-based feature limits, usage tracking, and addon management
import db from '../models/conn';
import { QueryTypes } from 'sequelize';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface QuotaCheckResult {
  allowed: boolean;
  remaining: number;
  used: number;
  limit: number;
  subscriptionId: number;
  status?: string;
  planLimit: number;
  addonLimit: number;
  currentPeriodEnd?: Date | null;
  reason: string;
  featureName: string;
  subscriptionStatus: string;
  isWarning: boolean;
}

export interface UsageDeductionResult {
  success: boolean;
  balance: number;
  ledgerId: number;
  message: string;
}

export interface QuotaUsageData {
  userId: number;
  featureSlug: string;
  amount: number;
  source: 'consumption' | 'refund' | 'adjustment';
  description?: string;
  automationId?: string | number;
}

export interface AddonUsageData {
  userId: number;
  featureSlug: string;
  amount: number;
}

// ============================================================================
// QUOTA ENGINE CLASS
// ============================================================================

export class QuotaEngine {
  // Check if user has remaining quota for a feature Considers both plan limits and addon purchases
  static async checkQuota(userId: number, featureSlug: string): Promise<QuotaCheckResult> {
    const transaction = await db.sequelize.transaction();
    try {
      // Get active subscription with plan details
      const subscriptionData = await db.sequelize.query<any>(
        `SELECT s.id as subscriptionId, s.plan_id, s.status, s.current_period_end, pf.limit_value as planLimit, f.id as featureId, f.name as featureName
        FROM subscriptions s
        INNER JOIN plans p ON p.id = s.plan_id
        INNER JOIN plan_features pf ON pf.plan_id = p.id
        INNER JOIN features f ON f.id = pf.feature_id
        WHERE s.user_id = :userId
        AND f.slug = :featureSlug AND s.status IN ('active', 'on_trial') AND s.isDeleted = '0'
        AND p.isDeleted = '0' AND pf.isDeleted = '0' AND f.status = 1 LIMIT 1`,
        { replacements: { userId, featureSlug }, type: QueryTypes.SELECT, transaction }
      );

      if (!subscriptionData || subscriptionData.length === 0) {
        await transaction.commit();
        return { 
          allowed: false, remaining: 0, used: 0, limit: 0, subscriptionId: 0, 
          status: 'no_subscription',
          planLimit: 0, addonLimit: 0, 
          featureName: featureSlug,
          subscriptionStatus: 'none',
          isWarning: false,
          reason: 'No active subscription found. Please subscribe to a plan.'
        };
      }
      const { subscriptionId, featureId, planLimit, current_period_end, status, featureName } = subscriptionData[0];

      const addonLimit = Number(await this.getAddonQuota(subscriptionId, featureId, transaction)) || 0;
      const totalLimit = Number(planLimit) + addonLimit;

      // Check subscription period validity
      if (current_period_end && new Date(current_period_end) < new Date()) {
        await transaction.commit();
        return { 
          allowed: false, remaining: 0, used: 0, limit: totalLimit, subscriptionId, 
          status: 'subscription_expired',
          planLimit: Number(planLimit), addonLimit, currentPeriodEnd: current_period_end,
          featureName,
          subscriptionStatus: status || 'expired',
          isWarning: false,
          reason: 'Your subscription has expired. Please renew your plan.'
        };
      }

      // // Get plan limit
      // let totalLimit = Number(planLimit);
      // // Get addon limits for this feature
      // // const addonLimit = await this.getAddonQuota(subscriptionId, featureId, transaction);
      // const addonLimit = Number(await this.getAddonQuota(subscriptionId, featureId, transaction)) || 0;
      // console.log("Plan Limit->",planLimit)
      // console.log("AddOn Limit->",addonLimit)
      // totalLimit += addonLimit;

      // Get current usage from ledger
      // const usageData = await db.sequelize.query<any>(
      //   `SELECT COALESCE(SUM(CASE WHEN is_deposit = 0 THEN amount ELSE 0 END), 0) as totalUsed,
      //     COALESCE(SUM(CASE WHEN is_deposit = 1 THEN amount ELSE 0 END), 0) as totalDeposited
      //   FROM ledger WHERE user_id = :userId AND feature_id = :featureId AND isDeleted = '0'`,
      //   { replacements: { userId, featureId }, type: QueryTypes.SELECT, transaction }
      // );
      // console.log("USAGE DATA - ",usageData)
      // const { totalUsed, totalDeposited } = usageData[0] || { totalUsed: 0, totalDeposited: 0 };
      // const currentBalance = totalDeposited - totalUsed;
      let currentBalance = await this.getCurrentBalance(userId, featureId, transaction);
      if (currentBalance === -1) {
        // No ledger entries yet — treat full plan limit as remaining balance
        currentBalance = totalLimit;
      }
      console.log("CURRENT BAL- ",currentBalance)
      // const remaining = Math.max(0, totalLimit - currentBalance);
      await transaction.commit();
      // return { allowed: currentBalance > 0, remaining: currentBalance, used: totalUsed, limit: totalLimit, subscriptionId, status: 'valid' };
      const totalUsed = Math.max(0, totalLimit - currentBalance);
      const allowed = currentBalance > 0;
      const usagePercentage = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 100;
      const isWarning = allowed && (usagePercentage >= 80);
      return { 
        allowed, 
        remaining: currentBalance, 
        used: totalUsed, 
        limit: totalLimit, 
        subscriptionId, 
        status: allowed ? 'valid' : 'quota_exhausted',
        planLimit: Number(planLimit),
        addonLimit,
        currentPeriodEnd: current_period_end,
        featureName,
        subscriptionStatus: status || 'none',
        isWarning,
        reason: allowed
          ? (isWarning ? `You are approaching your ${featureName} limit.` : 'Quota is available.')
          : `You have reached your limit of ${totalLimit} for ${featureName}. Please upgrade your plan or purchase add-ons.`
      };
    } catch (error) {
      await transaction.rollback();
      console.error('Error checking quota:', error);
      throw new Error('Failed to check quota');
    }
  }

  static formatQuotaError(quotaResult: QuotaCheckResult) {
    return {
      status: false,
      message: quotaResult.reason,
      exhausted: 'subscription',
      type: quotaResult.status === 'subscription_expired' ? 'expired' : 'limit_reached',
      remaining: quotaResult.remaining,
      limit: quotaResult.limit,
      used: quotaResult.used,
      planLimit: quotaResult.planLimit,
      addonLimit: quotaResult.addonLimit,
      currentPeriodEnd: quotaResult.currentPeriodEnd,
      featureName: quotaResult.featureName,
      subscriptionStatus: quotaResult.subscriptionStatus,
      isWarning: quotaResult.isWarning
    };
  }

  // Deduct usage from user's quota Creates ledger entry and updates balance
  static async deductUsage(data: QuotaUsageData): Promise<UsageDeductionResult> {
    const transaction = await db.sequelize.transaction();
    console.log("Deduct RAN")
    try {
      const { userId, featureSlug, amount, source, description, automationId } = data;
      // Verify feature exists and is active
      const feature = await db.sequelize.query<any>(`SELECT id FROM features WHERE slug = :slug AND status = 1 AND isDeleted = '0'`, { replacements: { slug: featureSlug }, type: QueryTypes.SELECT, transaction });
      if (!feature || feature.length === 0) {
        await transaction.rollback();
        throw new Error(`Feature not found: ${featureSlug}`);
      }
      const featureId = feature[0].id;
      // Check current balance
      const currentBalance = await this.getCurrentBalance(userId, featureId, transaction);
      const effectiveBalance = currentBalance === -1 ? 0 : currentBalance;
      if (effectiveBalance < amount && source === 'consumption') {
        await transaction.rollback();
        return {
          success: false,
          balance: effectiveBalance,
          ledgerId: 0,
          message: `Insufficient quota. Available: ${effectiveBalance}, Required: ${amount}`
        };
      }

      // Calculate new balance
      const balanceAfter = source === 'consumption'
        ? effectiveBalance - amount
        : effectiveBalance + amount;
      // Insert ledger entry
      const result = await db.sequelize.query(
        `INSERT INTO ledger (user_id, feature_id, automation_id, amount, is_deposit, source, balance_after, description, createdOn, modifiedOn, isDeleted)
         VALUES (:userId, :featureId, :automationId, :amount, :isDeposit, :source, :balanceAfter, :description, NOW(), NOW(), '0')`,
        {
          replacements: {
            userId,
            featureId,
            automationId: automationId || null,
            amount,
            isDeposit: source === 'consumption' ? 0 : 1,
            source,
            balanceAfter,
            description: description || null
          },
          type: QueryTypes.INSERT,
          transaction
        }
      );
      // In Sequelize, QueryTypes.INSERT returns [lastID, rowCount] or just the ID depending on dialect
      const ledgerId = Array.isArray(result) ? result[0] : result;
      await transaction.commit();
      return { success: true, balance: balanceAfter, ledgerId, message: 'Usage deducted successfully' };
    } catch (error) {
      await transaction.rollback();
      console.error('Error deducting usage:', error);
      throw error;
    }
  }

  /**
   * Get current balance for a feature
   */
  // No try/catch — let errors propagate so the caller's transaction can roll back.
  // Returns -1 as a sentinel when no ledger rows exist for the user+feature (not an error).
  static async getCurrentBalance(userId: number, featureId: number, transaction?: any): Promise<number> {
    const result = await db.sequelize.query<any>(
      `SELECT COALESCE(balance_after, 0) as balance
       FROM ledger
       WHERE user_id = :userId AND feature_id = :featureId AND isDeleted = '0'
       ORDER BY createdOn DESC LIMIT 1`,
      { replacements: { userId, featureId }, type: QueryTypes.SELECT, transaction }
    );
    return result && result.length > 0 ? Number(result[0].balance) : -1;
  }

  /**
   * Get addon quota for a subscription
   */
  private static async getAddonQuota(subscriptionId: number, featureId: number, transaction?: any): Promise<number> {
    const result = await db.sequelize.query<any>(
      `SELECT COALESCE(SUM(a.unit_amount * sa.quantity), 0) as totalAddonQuota
       FROM subscription_addons sa
       INNER JOIN addons a ON a.id = sa.addon_id
       WHERE sa.subscription_id = :subscriptionId
         AND a.feature_id = :featureId
         AND a.status = 1
         AND sa.isDeleted = '0'
         AND a.isDeleted = '0'`,
      { replacements: { subscriptionId, featureId }, type: QueryTypes.SELECT, transaction }
    );
    return result && result.length > 0 ? Number(result[0].totalAddonQuota) : 0;
  }

  /**
   * Get user's usage statistics for a feature
   */
  static async getUsageStats(userId: number, featureSlug: string): Promise<any> {
    try {
      const stats = await db.sequelize.query<any>(
        `SELECT f.name, f.slug,
           COALESCE(SUM(CASE WHEN l.is_deposit = 0 THEN l.amount ELSE 0 END), 0) as totalUsed,
           COALESCE(SUM(CASE WHEN l.is_deposit = 1 THEN l.amount ELSE 0 END), 0) as totalDeposited,
           pf.limit_value as planLimit,
           p.name as planName,
           s.status as subscriptionStatus,
           s.current_period_end
         FROM features f
         LEFT JOIN ledger l ON l.feature_id = f.id AND l.user_id = :userId AND l.isDeleted = '0'
         LEFT JOIN plan_features pf ON pf.feature_id = f.id
         LEFT JOIN plans p ON p.id = pf.plan_id
         LEFT JOIN subscriptions s ON s.plan_id = p.id AND s.user_id = :userId AND s.isDeleted = '0'
         WHERE f.slug = :featureSlug AND f.isDeleted = '0'
         GROUP BY f.id, f.name, f.slug, pf.limit_value, p.name, s.status, s.current_period_end`,
        { replacements: { userId, featureSlug }, type: QueryTypes.SELECT }
      );

      if (!stats || stats.length === 0) return null;
      const stat = stats[0];
      return {
        featureName: stat.name,
        featureSlug: stat.slug,
        used: stat.totalUsed,
        limit: stat.planLimit,
        remaining: Math.max(0, stat.planLimit - stat.totalUsed),
        subscriptionStatus: stat.subscriptionStatus,
        periodEnd: stat.current_period_end
      };
    } catch (error) {
      console.error('Error getting usage stats:', error);
      throw error;
    }
  }

  /**
   * Refund usage (for cancelled operations)
   */
  static async refundUsage(userId: number, featureSlug: string, amount: number, description?: string): Promise<UsageDeductionResult> {
    return this.deductUsage({ userId, featureSlug, amount, source: 'refund', description });
  }

  /**
   * Manual adjustment (admin only)
   */
  static async adjustQuota(userId: number, featureSlug: string, amount: number, description: string): Promise<UsageDeductionResult> {
    return this.deductUsage({ userId, featureSlug, amount, source: 'adjustment', description });
  }

  /**
   * Initialize plan quota when subscription is created
   */
  static async initializePlanQuota(subscriptionId: number, userId: number, planId: number): Promise<void> {
    const transaction = await db.sequelize.transaction();
    try {
      const planFeatures = await db.sequelize.query<any>(
        `SELECT feature_id, limit_value FROM plan_features WHERE plan_id = :planId AND isDeleted = '0'`,
        { replacements: { planId }, type: QueryTypes.SELECT, transaction }
      );
      for (const feature of planFeatures) {
        await db.sequelize.query(
          `INSERT INTO ledger (user_id, feature_id, amount, is_deposit, source, balance_after, description, createdOn, modifiedOn, isDeleted)
           VALUES (:userId, :featureId, :amount, 1, 'plan_allocation', :amount, 'Plan allocation for subscription', NOW(), NOW(), '0')`,
          { replacements: { userId, featureId: feature.feature_id, amount: feature.limit_value }, transaction }
        );
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error('Error initializing plan quota:', error);
      throw error;
    }
  }

  /**
   * Add addon quota
   */
  static async addAddonQuota(subscriptionId: number, userId: number, addonId: number, quantity: number = 1): Promise<void> {
    const transaction = await db.sequelize.transaction();
    try {
      const addon = await db.sequelize.query<any>(
        `SELECT feature_id, unit_amount FROM addons WHERE id = :addonId AND status = 1 AND isDeleted = '0'`,
        { replacements: { addonId }, type: QueryTypes.SELECT, transaction }
      );
      if (!addon || addon.length === 0) throw new Error('Addon not found');

      const { feature_id, unit_amount } = addon[0];
      const totalAmount = unit_amount * quantity;

      // Get current balance first, then add on top of it
      const currentBalance = await this.getCurrentBalance(userId, feature_id, transaction);
      const effectiveBalance = currentBalance === -1 ? 0 : currentBalance;

      await db.sequelize.query(
        `INSERT INTO ledger (user_id, feature_id, amount, is_deposit, source, balance_after, description, createdOn, modifiedOn, isDeleted)
         VALUES (:userId, :featureId, :amount, 1, 'addon_purchase', :balanceAfter, :description, NOW(), NOW(), '0')`,
        {
          replacements: {
            userId,
            featureId: feature_id,
            amount: totalAmount,
            balanceAfter: effectiveBalance + totalAmount,
            description: `Addon purchase: ${quantity}x unit`
          },
          transaction
        }
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error('Error adding addon quota:', error);
      throw error;
    }
  }
}

export default QuotaEngine;