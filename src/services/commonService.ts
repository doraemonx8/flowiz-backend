import * as XLSX from 'xlsx';
import * as fs from 'fs';
import db from "../models/conn";
import { QueryTypes } from "sequelize";
import * as bcrypt from 'bcrypt';

export interface Audience {
  id: number;
  name: string;
  description?: string;
}

export interface Lead {
  id: number;
  companyId: number;
  name: string;
  email: string;
  phone: string;
  status: string;
  isDeleted?: string;
  createdOn?: string;
  modifiedOn?: string;
  audienceData?: Audience[];
}

export interface LeadInsert {
  name: string;
  email: string;
  phone: string;
  status: string;
}

const saltRounds = 10;

// --- GENERIC CRUD OPERATIONS ---

export const create = async (data: any, tableName: string): Promise<any> => {
  try {
    const { edit, ...payload } = data;

    if (!edit || edit === 0 || edit === '0') {
      const columns = Object.keys(payload).join(', ');
      const placeholders = Object.keys(payload).map(k => `:${k}`).join(', ');
      
      const [insertId] = await db.sequelize.query(
        `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`,
        { replacements: payload, type: QueryTypes.INSERT }
      );

      return { success: true, statusCode: 201, message: "New data created", data: insertId };
    } else {
      const updates = Object.keys(payload).map(k => `${k} = :${k}`).join(', ');
      
      await db.sequelize.query(
        `UPDATE ${tableName} SET ${updates} WHERE id = :edit AND isDeleted = '0'`,
        { replacements: { ...payload, edit }, type: QueryTypes.UPDATE }
      );

      return { success: true, statusCode: 201, message: "Data updated", data: edit };
    }
  } catch (err: any) {
    console.error(`Error during adding: ${err.message}`);
    return { success: false, statusCode: err.code || 500, message: err.message || "Internal Server Error" };
  }
};

export const deleteRecord = async (id: number, tableName: string): Promise<any> => {
  try {
    const [result]: any = await db.sequelize.query(
      `UPDATE ${tableName} SET isDeleted = '1', status = '0' WHERE id = :id AND isDeleted = '0'`,
      { replacements: { id }, type: QueryTypes.UPDATE }
    );

    if (result.affectedRows === 0) {
      return { success: false, statusCode: 404, message: 'Data not found' };
    }
    return { success: true, statusCode: 200, message: 'Record deleted' };
  } catch (error: any) {
    return { success: false, statusCode: 500, message: error.message || 'Internal Server Error' };
  }
};

export const approveReject = async (id: number, status: string, tableName: string): Promise<any> => {
  try {
    const [result]: any = await db.sequelize.query(
      `UPDATE ${tableName} SET isDeleted = '1', status = :status WHERE id = :id AND isDeleted = '0'`,
      { replacements: { id, status }, type: QueryTypes.UPDATE }
    );

    if (result.affectedRows === 0) throw { statusCode: 404, message: 'Data not found' };
    return { success: true, statusCode: 200, message: 'Approve/Reject data' };
  } catch (error: any) {
    return { success: false, statusCode: error.statusCode || 500, message: error.message };
  }
};

export const listRecord = async (tableName: string, companyId: number = 0): Promise<any> => {
  try {
    let query = `SELECT * FROM ${tableName} WHERE isDeleted = '0' AND status = '1'`;
    const replacements: any = {};

    if (companyId !== 0) {
      query += ` AND internalCompanyId = :companyId`;
      replacements.companyId = companyId;
    }
    query += ` ORDER BY id DESC`;

    const entities = await db.sequelize.query(query, { replacements, type: QueryTypes.SELECT });
    return { success: true, statusCode: 200, message: 'Data Fetched', data: entities };
  } catch (error: any) {
    throw new Error('Internal Server Error');
  }
};

export const getRecordById = async (id: number, tableName: string): Promise<any> => {
  try {
    const [entity] = await db.sequelize.query(
      `SELECT * FROM ${tableName} WHERE id = :id AND isDeleted = '0' AND status = '1' LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    return { success: true, statusCode: 200, message: 'Data Fetched', data: entity || null };
  } catch (error: any) {
    throw new Error('Internal Server Error');
  }
};

export const updateCommon = async (table: string, key: string, value: any, id: number): Promise<any> => {
  try {
    const query = `UPDATE ${table} SET ${key} = :value WHERE id = :id`;
    await db.sequelize.query(query, {
      replacements: { value, id },
      type: QueryTypes.UPDATE,
    });
    return { success: true, statusCode: 200, message: "Updated successfully" };
  } catch (error: any) {
    throw new Error('Internal Server Error');
  }
};

// --- AUTH & SECURITY ---

export const generateOtp = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, saltRounds);
};

export const comparePassword = async (password: string, hashedPassword: string): Promise<boolean> => {
  return await bcrypt.compare(password, hashedPassword);
};

// --- SPECIFIC BUSINESS LOGIC ---

export const clockIn = async (email: string, clockInTime: string, teamTable: string, attendanceTable: string): Promise<any> => {
  try {
    const [record]: any = await db.sequelize.query(
      `SELECT id FROM ${teamTable} WHERE email = :email AND isDeleted = '0' AND status = '1' LIMIT 1`,
      { replacements: { email }, type: QueryTypes.SELECT }
    );
    if (!record) throw { statusCode: 404, message: 'Data not found' };

    const [existing]: any = await db.sequelize.query(
      `SELECT id FROM ${attendanceTable} WHERE email = :email AND isDeleted = '0' AND status = '1' LIMIT 1`,
      { replacements: { email }, type: QueryTypes.SELECT }
    );

    if (!existing) {
      await db.sequelize.query(
        `INSERT INTO ${attendanceTable} (teamMemberId, email, status, clockIn) VALUES (:id, :email, '1', :clockInTime)`,
        { replacements: { id: record.id, email, clockInTime }, type: QueryTypes.INSERT }
      );
      return { success: true, statusCode: 200, message: 'User ClockIn Successfully' };
    } else {
      return { success: true, statusCode: 400, message: 'User already clocked-In!!' };
    }
  } catch (error: any) {
    return { success: false, statusCode: error.statusCode || 500, message: error.message };
  }
};

export const getLeadsWithAudience = async (userId: number): Promise<Lead[]> => {
  const query = `
    SELECT a.id AS audienceId, a.name AS audienceName, a.description as audienceDescription, l.*
    FROM audience AS a
    LEFT JOIN leads AS l ON FIND_IN_SET(a.id, l.audienceIds) AND l.isDeleted = '0'
    WHERE a.userId = :userId AND a.isDeleted = '0' ORDER BY a.id DESC
  `;
  const results: any[] = await db.sequelize.query(query, {
    replacements: { userId },
    type: QueryTypes.SELECT,
  });

  const groupedResults: { [key: number]: Lead } = {};
  const formattedResults: Lead[] = [];

  for (const row of results) {
    if (row.id) { // Ensure a lead actually exists
        if (!groupedResults[row.id]) {
        groupedResults[row.id] = { ...row, audienceData: [] };
        formattedResults.push(groupedResults[row.id]);
        }
        groupedResults[row.id].audienceData!.push({
        id: row.audienceId,
        name: row.audienceName,
        description: row.audienceDescription,
        });
    }
  }
  return formattedResults;
};

export const dashboardRecord = async (userId: number): Promise<any> => {
  try {
    const [[{ totalCampaignCount }]] = await db.sequelize.query(`SELECT COUNT(*) as totalCampaignCount FROM campaigns WHERE userId = :userId AND isDeleted = '0'`, { replacements: { userId }, type: QueryTypes.SELECT }) as any;
    const [[{ pendingCampaignCount }]] = await db.sequelize.query(`SELECT COUNT(*) as pendingCampaignCount FROM campaigns WHERE userId = :userId AND isDeleted = '0' AND status = '2'`, { replacements: { userId }, type: QueryTypes.SELECT }) as any;
    const [[{ completeCampaignCount }]] = await db.sequelize.query(`SELECT COUNT(*) as completeCampaignCount FROM campaigns WHERE userId = :userId AND isDeleted = '0' AND status = '3'`, { replacements: { userId }, type: QueryTypes.SELECT }) as any;
    const [[{ audienceCount }]] = await db.sequelize.query(`SELECT COUNT(*) as audienceCount FROM audience WHERE userId = :userId AND isDeleted = '0' AND status = '3'`, { replacements: { userId }, type: QueryTypes.SELECT }) as any;

    return {
      success: true,
      data: { totalCampaignCount, pendingCampaignCount, completeCampaignCount, audienceCount },
    };
  } catch (error: any) {
    return { success: false, statusCode: 500, message: error.message };
  }
};

export const getActivePlans = async (userId: number): Promise<any[]> => {
  const query = `
    SELECT plans.id as planId 
    FROM subscriptions
    INNER JOIN plans ON subscriptions.planId = plans.id
    WHERE subscriptions.userId = :userId 
      AND subscriptions.isDeleted = '0' 
      AND subscriptions.isCancelled = '0'
      AND DATE_ADD(subscriptions.createdOn, INTERVAL plans.duration MONTH) >= CURDATE()
    ORDER BY subscriptions.createdOn DESC
  `;
  return await db.sequelize.query(query, {
    replacements: { userId },
    type: QueryTypes.SELECT,
  });
};

export const removeAudienceInLead = async (leadId: number, audienceId: string): Promise<any> => {
  try {
    const [record]: any = await db.sequelize.query(
      `SELECT audienceIds FROM leads WHERE id = :leadId AND isDeleted = '0' LIMIT 1`,
      { replacements: { leadId }, type: QueryTypes.SELECT }
    );

    if (!record) return { success: false, statusCode: 404, message: 'Record not found' };

    let audienceArray = record.audienceIds ? record.audienceIds.split(',') : [];
    const filteredAudience = audienceArray.filter((id: string) => id !== audienceId);

    if (filteredAudience.length !== audienceArray.length) {
      await db.sequelize.query(
        `UPDATE leads SET audienceIds = :newIds WHERE id = :leadId`,
        { replacements: { newIds: filteredAudience.join(','), leadId }, type: QueryTypes.UPDATE }
      );
      return { success: true, statusCode: 200, message: 'Audience Removed Successfully' };
    } else {
      return { success: false, statusCode: 400, message: 'AudienceId not found in the record' };
    }
  } catch (error: any) {
    return { success: false, statusCode: 500, message: error.message };
  }
};

export const getAudienceByLeads = async (userId: number): Promise<any> => {
  const query = `
    SELECT 
      a.id AS audienceId, a.name AS audienceName, a.description AS audienceDescription,
      l.id, l.name, l.email, l.countryCode, l.phone, l.website, l.createdOn, l.modifiedOn, l.audienceIds
    FROM audience AS a
    LEFT JOIN leads AS l ON FIND_IN_SET(a.id, l.audienceIds) AND l.isDeleted = '0'
    WHERE a.userId = :userId AND a.isDeleted = '0'
    ORDER BY a.id DESC
  `;
  const results: any[] = await db.sequelize.query(query, { replacements: { userId }, type: QueryTypes.SELECT });

  const audienceMap: Record<number, any> = {};

  results.forEach((row: any) => {
    if (!audienceMap[row.audienceId]) {
      audienceMap[row.audienceId] = {
        audienceId: row.audienceId,
        audienceName: row.audienceName,
        audienceDescription: row.audienceDescription,
        totalCountOfLead: 0,
        leads: []
      };
    }

    if (row.id) {
      audienceMap[row.audienceId].totalCountOfLead++;
      if (audienceMap[row.audienceId].leads.length < 4) {
        audienceMap[row.audienceId].leads.push({
          id: row.id, name: row.name, countryCode: row.countryCode,
          phone: row.phone, email: row.email, website: row.website,
          createdOn: row.createdOn, modifiedOn: row.modifiedOn
        });
      }
    }
  });

  return Object.values(audienceMap).sort((a: any, b: any) => b.audienceId - a.audienceId);
};

export const bulkUploadLeads = async (file: Express.Multer.File): Promise<any> => {
  let skippedCount = 0;
  
  try {
    const filePath = file.path;
    const fileBuffer = fs.readFileSync(filePath);
    console.log(`File buffer size: ${fileBuffer.length}`);

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return { success: false, statusCode: 400, message: 'No sheets found in the Excel file' };
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      return { success: false, statusCode: 400, message: 'Invalid sheet data' };
    }

    const leadsData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    if (leadsData.length === 0) {
      return { success: false, statusCode: 400, message: 'No data found in the Excel file' };
    }

    const leadsToInsert: any[] = [];
    const leadPlaceholders: string[] = [];

    for (let i = 1; i < leadsData.length; i++) {
      const row = leadsData[i];

      const name = row[1];
      const phone = row[2];
      const email = row[3];

      if (!name || !phone || !email) {
        console.log(`Skipping row ${i + 1} due to missing fields`);
        skippedCount++;
        continue;
      }

      // Check if email already exists
      const existingLead = await db.sequelize.query(
        "SELECT id FROM leads WHERE email = :email LIMIT 1",
        {
          replacements: { email },
          type: QueryTypes.SELECT,
        }
      );

      if (existingLead && existingLead.length > 0) {
        console.log(`Skipping row ${i + 1} as email ${email} already exists`);
        skippedCount++;
        continue;
      }

      leadPlaceholders.push(`(?, ?, ?, ?)`);
      leadsToInsert.push(name, phone, email, '1'); // name, phone, email, status
    }

    if (leadsToInsert.length > 0) {
      // Perform a bulk insert query
      await db.sequelize.query(
        `INSERT INTO leads (name, phone, email, status) VALUES ${leadPlaceholders.join(', ')}`,
        {
          replacements: leadsToInsert,
          type: QueryTypes.INSERT,
        }
      );

      return {
        success: true,
        statusCode: 200,
        count: skippedCount,
        message: 'Bulk Leads Uploaded Successfully',
      };
    } else {
      return {
        success: false,
        statusCode: 400,
        count: skippedCount,
        message: 'No new leads to upload (all emails were duplicates)',
      };
    }
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';
    console.error(`Error during Record: ${message}`);
    return { success: false, statusCode, count: skippedCount, message };
  }
};

export const getLeadsData = async (userId: number, audienceId?: any): Promise<any> => {
  let query = `
    SELECT 
      a.id AS audienceId, 
      a.name AS audienceName,
      a.description AS audienceDescription,
      l.*
    FROM audience AS a
    LEFT JOIN leads AS l 
      ON FIND_IN_SET(a.id, l.audienceIds) > 0
      AND l.isDeleted = '0'
    WHERE a.userId = :userId
      AND a.isDeleted = '0'
  `;

  const replacements: any = { userId };

  // Check if audienceId exists and is not an empty string
  if (audienceId !== undefined && audienceId !== null && audienceId !== '') {
    query += ' AND a.id = :audienceId'; 
    replacements.audienceId = audienceId;
  }

  // console.log(query, "QUERY");

  const results = await db.sequelize.query(query, {
    replacements,
    type: QueryTypes.SELECT,
  });

  return results;
};

function getFeatureSlugFromTable(tableName: string) {
  throw new Error('Function not implemented.');
}
