import { Request, Response } from 'express';
import { bulkUploadLeads } from '../services/commonService';
import QuotaEngine from '../utils/quotaEngine';

export const singleUpload = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(401).send({ status: 401, message: 'No File uploaded' });
    }
    return res.status(200).send({ status: 200, url: file.path, name: file.filename });
  } catch (error) {
    console.error('Error uploading file:', error);
    return res.status(500).send({ status: 500, message: 'Internal server error' });
  }
};

export const bulkUpload = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(401).send({ status: 401, message: 'No File uploaded' });
    }

    const user = (req as any).user;

    const result = await bulkUploadLeads(file);

    if (result.success) {
      const insertedCount = result.insertedCount || 0; 
      if (insertedCount > 0) {
        await QuotaEngine.deductUsage({userId: user.sub,featureSlug: 'leads',amount: insertedCount,source: 'consumption',description: `Bulk upload Leads: ${file.filename}`});
      }
    }

    if (result.success) {
      return res.status(200).send({
        status: 200,
        message: `${result.message} (Skipped ${result.count} rows due to missing data or duplicates)`,
        count: result.count
      });
    } else {
      return res.status(result.statusCode).send({
        status: result.statusCode,
        message: result.message,
        count: result.count
      });
    }
  } catch (error) {
    console.error('Error uploading and processing file:', error);
    return res.status(500).send({ status: 500, message: 'Internal server error' });
  }
};