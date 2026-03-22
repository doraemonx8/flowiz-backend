// Provides flexible quota validation for any feature Can be configured per route based on feature slug
import { Request, Response, NextFunction } from 'express';
import QuotaEngine from '../utils/quotaEngine';

// Extend Express Request to include quota info
declare global {
  namespace Express {
    interface Request {
      quotaInfo?: {
        allowed: boolean;
        remaining: number;
        used: number;
        limit: number;
        subscriptionId: number;
      };

      quotaInfos?: Record<string, {
        allowed: boolean;
        remaining: number;
        used: number;
        limit: number;
        subscriptionId: number;
        status?: string;
      }>;
    }
  }
}
/**
 * Generic quota checking middleware factory
 * Usage: app.use(checkQuota('email_accounts')) or: app.post('/endpoint', checkQuota('whatsapp_messages'), controller)
 */
export const checkQuota = (featureSlug: string, strictMode: boolean = true) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
      const userId = req.body?.userId;
      if (!userId) {
        return res.status(401).json({ status: false, message: 'User ID not found' });
      }
      // Check quota
      const quotaResult = await QuotaEngine.checkQuota(userId, featureSlug);
      // Attach quota info to request
      req.quotaInfo = quotaResult;
      // If strict mode, block if not allowed
      if (strictMode && !quotaResult.allowed) {
        return res.status(429).send(QuotaEngine.formatQuotaError(quotaResult));
      }
      // In non-strict mode, just pass quota info for logging
      return next();
    } catch (error) {
      console.error(`Error checking quota for ${featureSlug}:`, error);
      return res.status(500).json({ status: false, message: 'Could not check quota. Try again later' });
    }
  };
};

/**
 * Check multiple features (e.g., email + attachment)
 */
export const checkMultipleQuotas = (featureSlugs: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
      const userId = req.body?.userId;
      if (!userId) {
        return res.status(401).json({
          status: false,
          message: 'User ID not found'
        });
      }
      const quotaResults = await Promise.all(featureSlugs.map(slug => QuotaEngine.checkQuota(userId, slug)));
      // Check if any quota is exhausted
      const exhaustedFeatures = quotaResults.map((result, idx) => ({ feature: featureSlugs[idx], ...result })).filter(r => !r.allowed);
      if (exhaustedFeatures.length > 0) {
        return res.status(429).json({ status: false, message: 'One or more quotas exhausted', exhaustedFeatures });
      }
      // Safely map all results so the controller can read them by slug
      req.quotaInfos = featureSlugs.reduce((acc, slug, idx) => {
        acc[slug] = quotaResults[idx];
        return acc;
      }, {} as Record<string, any>);
      // Attach all quota info
      req.quotaInfo = quotaResults[0]; // Store primary feature info
      return next();
    } catch (error) {
      console.error('Error checking multiple quotas:', error);
      return res.status(500).json({
        status: false,
        message: 'Could not check quotas. Try again later'
      });
    }
  };
};

export default checkQuota;
