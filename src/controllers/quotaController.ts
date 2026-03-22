// Quota Service Controller Handles quota-related operations and provides APIs for checking usage
import { Request, Response } from 'express';
import QuotaEngine from '../utils/quotaEngine';
import db from '../models/conn';
import { QueryTypes } from 'sequelize';
import { getCampaignIdBySlug } from '../models/campaignModel';

class QuotaController {
  // GET /api/quota/check/:featureSlug Check current quota for a feature  
  static async checkFeatureQuota(req: Request, res: Response): Promise<any> {
    try {
      const userId = req.body.userId;
      const { featureSlug } = req.params;

      if (!userId || !featureSlug) {
        return res.status(400).json({ status: false, message: 'Missing userId or featureSlug' });
      }
      const quotaResult = await QuotaEngine.checkQuota(userId, featureSlug);
      return res.status(200).json({ status: quotaResult.allowed, data: quotaResult });
    } catch (error) {
      console.error('Error checking quota:', error);
      return res.status(500).json({
        status: false, message: 'Failed to check quota'
      });
    }
  }

  // GET /api/quota/usage/:featureSlug Get detailed usage statistics
  static async getUsageStats(req: Request, res: Response): Promise<any> {
    try {
      const userId = req.body.userId;
      const { featureSlug } = req.params;
      if (!userId || !featureSlug) {
        return res.status(400).json({ status: false, message: 'Missing userId or featureSlug' });
      }

      const stats = await QuotaEngine.getUsageStats(userId, featureSlug);
      if (!stats) {
        return res.status(404).json({ status: false, message: 'Feature not found or no data available' });
      }
      return res.status(200).json({ status: true, data: stats });
    } catch (error) {
      console.error('Error getting usage stats:', error);
      return res.status(500).json({ status: false, message: 'Failed to get usage stats' });
    }
  }

  // GET /api/quota/dashboard Get all features usage dashboard for user
  // static async getDashboard(req: Request, res: Response): Promise<any> {
  //   try {
  //     const userId = req.body.userId;
  //     if (!userId) {
  //       return res.status(400).json({ status: false, message: 'Missing userId' });
  //     }
  //     // const dashboard = await db.sequelize.query<any>(`SELECT f.id, f.name, f.slug, pf.limit_value as planLimit,
  //     //     COALESCE(SUM(CASE WHEN l.is_deposit = 0 THEN l.amount ELSE 0 END), 0) as used,
  //     //     (pf.limit_value - COALESCE(SUM(CASE WHEN l.is_deposit = 0 THEN l.amount ELSE 0 END), 0)) as remaining,
  //     //     COALESCE(SUM(CASE WHEN sa.addon_id IS NOT NULL THEN a.unit_amount * sa.quantity ELSE 0 END), 0) as addonQuota,
  //     //     s.status as subscriptionStatus, s.current_period_end
  //     //   FROM features f
  //     //   LEFT JOIN plan_features pf ON pf.feature_id = f.id
  //     //   LEFT JOIN subscriptions s ON s.plan_id = pf.plan_id AND s.user_id = :userId AND s.isDeleted = '0' AND s.status IN ('active', 'on_trial')
  //     //   LEFT JOIN ledger l ON l.feature_id = f.id AND l.user_id = :userId AND l.isDeleted = '0'
  //     //   LEFT JOIN subscription_addons sa ON sa.subscription_id = s.id
  //     //   LEFT JOIN addons a ON a.id = sa.addon_id
  //     //   WHERE f.status = 1 AND f.isDeleted = '0'
  //     //   GROUP BY f.id, f.name, f.slug, pf.limit_value
  //     //   ORDER BY f.name ASC`,
  //     //   {replacements: { userId }, type: QueryTypes.SELECT});

  //     // const dashboard = await db.sequelize.query<any>(`
  //     //   SELECT p.name as planName, f.id, f.name, f.slug, pf.limit_value as planLimit,
  //     //     COALESCE(SUM(CASE WHEN l.is_deposit = 0 THEN l.amount ELSE 0 END), 0) as used,
  //     //     (pf.limit_value - COALESCE(SUM(CASE WHEN l.is_deposit = 0 THEN l.amount ELSE 0 END), 0)) as remaining,
  //     //     COALESCE(SUM(CASE WHEN sa.addon_id IS NOT NULL THEN a.unit_amount * sa.quantity ELSE 0 END), 0) as addonQuota,
  //     //     s.status as subscriptionStatus, 
  //     //     s.current_period_end
  //     //   FROM features f
  //     //   INNER JOIN plan_features pf ON pf.feature_id = f.id
  //     //   INNER JOIN subscriptions s ON s.plan_id = pf.plan_id 
  //     //       AND s.user_id = :userId 
  //     //       AND s.isDeleted = '0' 
  //     //       AND s.status IN ('active', 'on_trial')
  //     //   INNER JOIN plans p ON s.plan_id = p.id
  //     //   LEFT JOIN ledger l ON l.feature_id = f.id 
  //     //       AND l.user_id = :userId 
  //     //       AND l.isDeleted = '0'
  //     //   LEFT JOIN subscription_addons sa ON sa.subscription_id = s.id
  //     //   LEFT JOIN addons a ON a.id = sa.addon_id
  //     //   WHERE f.status = 1 AND f.isDeleted = '0'
  //     //   GROUP BY p.name, f.id, f.name, f.slug, pf.limit_value, s.status, s.current_period_end
  //     //   ORDER BY f.name ASC`,
  //     //   { replacements: { userId }, type: QueryTypes.SELECT }
  //     // );

  //     const dashboard = await db.sequelize.query<any>(`
  //       SELECT 
  //         p.name as planName,
  //         f.id, f.name, f.slug, pf.limit_value as planLimit,
  //         COALESCE(SUM(CASE WHEN l.is_deposit = 0 THEN l.amount ELSE 0 END), 0) as used,
  //         (pf.limit_value - COALESCE(SUM(CASE WHEN l.is_deposit = 0 THEN l.amount ELSE 0 END), 0)) as remaining,
  //         s.status as subscriptionStatus, 
  //         s.current_period_end
  //       FROM features f
  //       INNER JOIN plan_features pf ON pf.feature_id = f.id
  //       INNER JOIN subscriptions s ON s.plan_id = pf.plan_id 
  //           AND s.user_id = :userId 
  //           AND s.isDeleted = '0' 
  //           AND s.status IN ('active', 'on_trial')
  //       INNER JOIN plans p ON s.plan_id = p.id
  //       LEFT JOIN ledger l ON l.feature_id = f.id 
  //           AND l.user_id = :userId 
  //           AND l.isDeleted = '0'
  //       WHERE f.status = 1 AND f.isDeleted = '0'
  //       GROUP BY p.name, f.id, f.name, f.slug, pf.limit_value, s.status, s.current_period_end
  //       ORDER BY f.name ASC`,
  //       { replacements: { userId }, type: QueryTypes.SELECT }
  //     );

  //     return res.status(200).json({status: true, addon: [], data: dashboard});
  //   } catch (error) {
  //     console.error('Error getting dashboard:', error);
  //     return res.status(500).json({status: false,message: 'Failed to get dashboard'});
  //   }
  // }

  // GET /api/quota/dashboard Get all features usage dashboard for user
  static async getDashboard(req: Request, res: Response): Promise<any> {
    try {
      const userId = req.body.userId;
      const { slug } = req.query;
      if (slug !== undefined && (typeof slug !== "string" || slug.trim() === "")) {
        return res.status(400).json({
          status: false,
          message: "Query parameter 'slug' cannot be empty"
        });
      }
      if (!userId) {
        return res.status(400).json({ status: false, message: 'Missing userId' });
      }

      // Only look up campaign and include usedBySlug when slug is provided
      let automationId: string | null = null;
      if (slug) {
        const campaigns = await getCampaignIdBySlug(slug as string, userId);
        automationId = campaigns?.[0]?.id || null;
      }

      const plansQuery = `
        SELECT 
          p.id as planId,
          p.name as planName,
          p.price as amount, 
          p.status as planStatus,
          CASE 
            WHEN s.id IS NOT NULL THEN true 
            ELSE false 
          END as isSubscribed,
          s.status as subscriptionStatus,
          s.createdOn as current_start_date, 
          s.current_period_end
        FROM plans p
        LEFT JOIN subscriptions s ON p.id = s.plan_id 
            AND s.user_id = :userId 
            AND s.isDeleted = '0' 
            AND s.status IN ('active', 'on_trial')
        WHERE p.isDeleted = '0' AND p.status = 1
        ORDER BY p.price ASC
      `;

      const featuresQuery = slug
        ? `
        SELECT 
          f.id, f.name, f.slug, pf.limit_value as planLimit,
          COALESCE(SUM(CASE WHEN l.is_deposit = 0 THEN l.amount ELSE 0 END), 0) as used,
          (pf.limit_value - COALESCE(SUM(CASE WHEN l.is_deposit = 0 THEN l.amount ELSE 0 END), 0)) as remaining,
          COALESCE(SUM(CASE WHEN l.is_deposit = 0 AND l.automation_id = :automationId THEN l.amount ELSE 0 END), 0) as usedBySlug
        FROM features f
        INNER JOIN plan_features pf ON pf.feature_id = f.id
        INNER JOIN subscriptions s ON s.plan_id = pf.plan_id 
            AND s.user_id = :userId 
            AND s.isDeleted = '0' 
            AND s.status IN ('active', 'on_trial')
        LEFT JOIN ledger l ON l.feature_id = f.id 
            AND l.user_id = :userId 
            AND l.isDeleted = '0'
        WHERE f.status = 1 AND f.isDeleted = '0'
        GROUP BY f.id, f.name, f.slug, pf.limit_value
        ORDER BY f.name ASC
      `
        : `
        SELECT 
          f.id, f.name, f.slug, pf.limit_value as planLimit,
          COALESCE(SUM(CASE WHEN l.is_deposit = 0 THEN l.amount ELSE 0 END), 0) as used,
          (pf.limit_value - COALESCE(SUM(CASE WHEN l.is_deposit = 0 THEN l.amount ELSE 0 END), 0)) as remaining
        FROM features f
        INNER JOIN plan_features pf ON pf.feature_id = f.id
        INNER JOIN subscriptions s ON s.plan_id = pf.plan_id 
            AND s.user_id = :userId 
            AND s.isDeleted = '0' 
            AND s.status IN ('active', 'on_trial')
        LEFT JOIN ledger l ON l.feature_id = f.id 
            AND l.user_id = :userId 
            AND l.isDeleted = '0'
        WHERE f.status = 1 AND f.isDeleted = '0'
        GROUP BY f.id, f.name, f.slug, pf.limit_value
        ORDER BY f.name ASC
      `;

      const replacements: any = { userId };
      if (slug) {
        replacements.automationId = automationId;
      }

      const [userPlans, dashboardData] = await Promise.all([
        db.sequelize.query<any>(plansQuery, { replacements: { userId }, type: QueryTypes.SELECT }),
        db.sequelize.query<any>(featuresQuery, { replacements, type: QueryTypes.SELECT })
      ]);

      return res.status(200).json({
        status: true,
        plans: userPlans,
        addon: [],
        data: dashboardData
      });

    } catch (error) {
      console.error('Error getting dashboard:', error);
      return res.status(500).json({ status: false, message: 'Failed to get dashboard' });
    }
  }

  // POST /api/quota/deduct Manually deduct usage (controller calls this after operation)
  static async deductUsage(req: Request, res: Response): Promise<any> {
    try {
      const { userId, featureSlug, amount, description } = req.body;
      if (!userId || !featureSlug || !amount) {
        return res.status(400).json({
          status: false, message: 'Missing required fields: userId, featureSlug, amount'
        });
      }

      const result = await QuotaEngine.deductUsage({ userId, featureSlug, amount, source: 'consumption', description });
      if (!result.success) {
        return res.status(402).json({ status: false, message: result.message, balance: result.balance });
      }
      return res.status(200).json({ status: true, data: result });
    } catch (error) {
      console.error('Error deducting usage:', error);
      return res.status(500).json({
        status: false, message: 'Failed to deduct usage'
      });
    }
  }

  // POST /api/quota/refund Refund usage (e.g., for cancelled operations)
  static async refundUsage(req: Request, res: Response): Promise<any> {
    try {
      const { userId, featureSlug, amount, description } = req.body;
      if (!userId || !featureSlug || !amount) {
        return res.status(400).json({ status: false, message: 'Missing required fields: userId, featureSlug, amount' });
      }
      const result = await QuotaEngine.refundUsage(userId, featureSlug, amount, description);
      if (!result.success) {
        return res.status(400).json({ status: false, message: result.message });
      }
      return res.status(200).json({ status: true, data: result });
    } catch (error) {
      console.error('Error refunding usage:', error);
      return res.status(500).json({ status: false, message: 'Failed to refund usage' });
    }
  }

  // POST /api/quota/adjust (Admin only) Manually adjust quota
  static async adjustQuota(req: Request, res: Response): Promise<any> {
    try {
      const { userId, featureSlug, amount, description } = req.body;
      if (!userId || !featureSlug || !amount) {
        return res.status(400).json({
          status: false,
          message: 'Missing required fields: userId, featureSlug, amount'
        });
      }
      const result = await QuotaEngine.adjustQuota(userId, featureSlug, amount, description || 'Admin adjustment');
      if (!result.success) {
        return res.status(400).json({ status: false, message: result.message });
      }
      return res.status(200).json({ status: true, data: result });
    } catch (error) {
      console.error('Error adjusting quota:', error);
      return res.status(500).json({ status: false, message: 'Failed to adjust quota' });
    }
  }

  // GET /api/quota/ledger/:featureSlug Get usage ledger for a feature
  static async getLedger(req: Request, res: Response): Promise<any> {
    try {
      const userId = req.body.userId;
      const { featureSlug } = req.params;
      const { limit = 50, offset = 0 } = req.query;
      if (!userId || !featureSlug) {
        return res.status(400).json({ status: false, message: 'Missing userId or featureSlug' });
      }
      const ledger = await db.sequelize.query<any>(`
        SELECT l.id, l.amount, l.is_deposit, l.source, l.balance_after, l.description, l.created_on,f.slug as featureSlug, f.name as featureName
        FROM ledger l
        INNER JOIN features f ON f.id = l.feature_id
        WHERE l.user_id = :userId AND f.slug = :featureSlug AND l.isDeleted = '0' ORDER BY l.createdOn DESC LIMIT :limit OFFSET :offset`,
        { replacements: { userId, featureSlug, limit: parseInt(limit as string), offset: parseInt(offset as string) }, type: QueryTypes.SELECT });
      return res.status(200).json({ status: true, data: ledger });
    } catch (error) {
      console.error('Error getting ledger:', error);
      return res.status(500).json({ status: false, message: 'Failed to get ledger' });
    }
  }

  // GET /api/quota/addon Get available addons for user's subscription
  static async getAvailableAddons(req: Request, res: Response): Promise<any> {
    try {
      const userId = req.body.userId;
      if (!userId) { return res.status(400).json({ status: false, message: 'Missing userId' }); }
      const addons = await db.sequelize.query<any>(`
        SELECT a.id, a.name, a.feature_id, f.name as featureName, f.slug as featureSlug,
          a.unit_amount, a.lemon_variant_id, COUNT(sa.id) as purchasedQuantity
        FROM addons a
        INNER JOIN features f ON f.id = a.feature_id
        LEFT JOIN subscription_addons sa ON sa.addon_id = a.id
        WHERE a.status = 1 AND a.isDeleted = '0' AND f.status = 1
        GROUP BY a.id, a.name, a.feature_id, f.name, f.slug, a.unit_amount, a.lemon_variant_id ORDER BY f.name ASC, a.name ASC`,
        { type: QueryTypes.SELECT });
      return res.status(200).json({ status: true, data: addons });
    } catch (error) {
      console.error('Error getting addons:', error);
      return res.status(500).json({ status: false, message: 'Failed to get addons' });
    }
  }
}

export default QuotaController;
