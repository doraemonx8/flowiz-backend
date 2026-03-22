import db from "../models/conn";
import { QueryTypes } from "sequelize";
import bcrypt from "bcrypt";
import * as XLSX from "xlsx";
import * as fs from "fs";

/* -------------------------------------------------- */
/* CREATE / UPDATE 
/* -------------------------------------------------- */
const setRecords = async (table: any, data: any): Promise<any> => {
  const { edit, ...payload } = data;

  try {
    if (edit === 0) {
      const keys = Object.keys(payload);
      const values = Object.values(payload);

      const query = `
        INSERT INTO ${table} (${keys.join(",")})
        VALUES (${keys.map(() => "?").join(",")})
      `;

      const [result]: any = await db.sequelize.query(query, {
        replacements: values,
        type: QueryTypes.INSERT,
      });

      return result;
    } else {
      const updateQuery = `
        UPDATE ${table}
        SET ${Object.keys(payload)
          .map((k) => `${k}=?`)
          .join(",")}
        WHERE id=?
      `;

      await db.sequelize.query(updateQuery, {
        replacements: [...Object.values(payload), edit],
        type: QueryTypes.UPDATE,
      });

      return true;
    }
  } catch (err: any) {
    console.error("setRecords error:", err.message);
    return false;
  }
};

/* -------------------------------------------------- */
/* GET RECORD BY ID 
/* -------------------------------------------------- */
const getRecordById = async (table: string, id: number): Promise<any> => {
  try {
    const result = await db.sequelize.query(
      `SELECT * FROM ${table} 
       WHERE id=:id AND isDeleted='0' LIMIT 1`,
      {
        replacements: { id },
        type: QueryTypes.SELECT,
      }
    );

    return result[0] || null;
  } catch (err: any) {
    console.error("getRecordById error:", err.message);
    return null;
  }
};

/* -------------------------------------------------- */
/* DELETE RECORD (Soft Delete) */
/* -------------------------------------------------- */
const deleteRecord = async (table: string, id: number): Promise<boolean> => {
  try {
    await db.sequelize.query(
      `UPDATE ${table} 
       SET isDeleted='1', status='0'
       WHERE id=:id`,
      {
        replacements: { id },
        type: QueryTypes.UPDATE,
      }
    );
    return true;
  } catch (err) {
    console.error("deleteRecord error:", err);
    return false;
  }
};

/* -------------------------------------------------- */
/* LIST RECORDS */
/* -------------------------------------------------- */
const listRecords = async (
  table: string,
  companyId?: number
): Promise<any[]> => {
  try {
    let query = `
      SELECT * FROM ${table}
      WHERE isDeleted='0' AND status='1'
    `;

    if (companyId && companyId !== 0) {
      query += ` AND internalCompanyId=${companyId}`;
    }

    query += " ORDER BY id DESC";

    return await db.sequelize.query(query, {
      type: QueryTypes.SELECT,
    });
  } catch (err) {
    console.error("listRecords error:", err);
    return [];
  }
};

const getPlanFeatures = async (planId: number): Promise<any[]> => {
  try {
    const query = `
      SELECT feature_id, limit_value
      FROM plan_features
      WHERE plan_id = :planId
        AND isDeleted = '0'
    `;

    return await db.sequelize.query(query, {
      replacements: { planId },
      type: QueryTypes.SELECT,
    });
  } catch (error: any) {
    console.error("Error in getPlanFeatures:", error.message);
    return [];
  }
};

/* -------------------------------------------------- */
/* LIKE SEARCH */
/* -------------------------------------------------- */
const likeRecord = async (
  table: string,
  field: string,
  value: string
): Promise<any[]> => {
  try {
    return await db.sequelize.query(
      `SELECT * FROM ${table}
       WHERE isDeleted='0' AND status='1'
       AND ${field} LIKE :value
       LIMIT 20`,
      {
        replacements: { value: `${value}%` },
        type: QueryTypes.SELECT,
      }
    );
  } catch (err) {
    console.error("likeRecord error:", err);
    return [];
  }
};

/* -------------------------------------------------- */
/* PASSWORD HELPERS */
/* -------------------------------------------------- */
const SALT_ROUNDS = 10;

const hashPassword = async (password: string): Promise<string> =>
  bcrypt.hash(password, SALT_ROUNDS);
const comparePassword = async (
  password: string,
  hash: string
): Promise<boolean> => bcrypt.compare(password, hash);

/* -------------------------------------------------- */
/* OTP 
/* -------------------------------------------------- */
const generateOtp = (): string =>
  Math.floor(100000 + Math.random() * 900000).toString();

/* -------------------------------------------------- */
/* BULK LEAD UPLOAD (Excel) 
/* -------------------------------------------------- */
const bulkUploadLeads = async (file: any): Promise<any> => {
  let skipped = 0;

  try {
    const workbook = XLSX.readFile(file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const leads: any[] = [];

    for (let i = 1; i < rows.length; i++) {
      const [, name, phone, email] = rows[i];

      if (!name || !phone || !email) {
        skipped++;
        continue;
      }

      const exists = await db.sequelize.query(
        `SELECT id FROM leads WHERE email=:email`,
        {
          replacements: { email },
          type: QueryTypes.SELECT,
        }
      );

      if (exists.length) {
        skipped++;
        continue;
      }

      leads.push({ name, phone, email, status: "1" });
    }

    if (leads.length) {
      const placeholders = leads.map(() => "(?,?,?,?)").join(",");

      const values = leads.flatMap((l) => [l.name, l.phone, l.email, l.status]);

      await db.sequelize.query(
        `INSERT INTO leads(name,phone,email,status)
         VALUES ${placeholders}`,
        {
          replacements: values,
          type: QueryTypes.INSERT,
        }
      );
    }

    fs.unlinkSync(file.path);

    return { success: true, skipped };
  } catch (err: any) {
    console.error("bulkUploadLeads error:", err.message);
    return { success: false, skipped };
  }
};


const getCommonRecordsWhere = async (
  table: string,
  search: any,
  field: string
): Promise<any[]> => {
  try {
    const query = `
      SELECT *
      FROM ${table}
      WHERE isDeleted = '0'
        AND status = '1'
        AND ${field} = :search
    `;

    const data = await db.sequelize.query(query, {
      replacements: { search },
      type: QueryTypes.SELECT,
    });

    return data;
  } catch (error: any) {
    console.error("Error during getCommonRecordsWhere:", error.message);
    return [];
  }
};


const getCommonRecord = async (
  table: string,
  search: any,
  field: string
): Promise<any[]> => {
  try {
    console.log(search, field);

    const query = `
      SELECT *
      FROM ${table}
      WHERE isDeleted = '0'
        AND ${field} = :search
    `;

    const data = await db.sequelize.query(query, {
      replacements: { search },
      type: QueryTypes.SELECT,
    });

    return data;
  } catch (error: any) {
    console.error("Error during getCommonRecord:", error.message);
    return [];
  }
};


const commonRecord = async (
  table: string
): Promise<any[]> => {
  try {
    const query = `
      SELECT *
      FROM ${table}
      WHERE isDeleted = '0'
      ORDER BY id DESC
    `;

    const data = await db.sequelize.query(query, {
      type: QueryTypes.SELECT,
    });

    return data;
  } catch (error: any) {
    console.error("Error during commonRecord:", error.message);
    return [];
  }
};

const getAudienceByLeads = async (
  userId: number
): Promise<any[]> => {
  try {
    const query = `
      SELECT 
        a.id AS audienceId, 
        a.name AS audienceName,
        a.description AS audienceDescription,
        l.id,
        l.name,
        l.email,
        l.countryCode,
        l.phone,
        l.website,
        l.createdOn,
        l.modifiedOn,
        l.audienceIds
      FROM audience AS a
      LEFT JOIN leads AS l 
        ON FIND_IN_SET(a.id, l.audienceIds)
        AND l.isDeleted = '0'
      WHERE a.userId = :userId
        AND a.isDeleted = '0'
      ORDER BY a.id DESC
    `;

    console.log("query", query);

    const results: any[] = await db.sequelize.query(query, {
      replacements: { userId },
      type: QueryTypes.SELECT,
    });

    const audienceMap: Record<number, any> = {};

    results.forEach((row: any) => {
      if (!audienceMap[row.audienceId]) {
        audienceMap[row.audienceId] = {
          audienceId: row.audienceId,
          audienceName: row.audienceName,
          audienceDescription: row.audienceDescription,
          totalCountOfLead: 0,
          leads: [],
        };
      }

      if (row.id) {
        audienceMap[row.audienceId].totalCountOfLead++;

        if (audienceMap[row.audienceId].leads.length < 4) {
          audienceMap[row.audienceId].leads.push({
            id: row.id,
            name: row.name,
            countryCode: row.countryCode,
            phone: row.phone,
            email: row.email,
            website: row.website,
            createdOn: row.createdOn,
            modifiedOn: row.modifiedOn,
          });
        }
      }
    });

    return Object.values(audienceMap).sort(
      (a: any, b: any) => b.audienceId - a.audienceId
    );
  } catch (error: any) {
    console.error("Error in getAudienceByLeads:", error.message);
    return [];
  }
};

interface Audience {
  id: number;
  name: string;
  description?: string;
}

interface Lead {
  id: number;
  name: string;
  email: string;
  phone: string;
  audienceData: Audience[];
  [key: string]: any;
}


 const getLeadsWithAudience = async (
  userId: number
): Promise<Lead[]> => {
  try {
    const query = `
      SELECT 
        a.id AS audienceId,
        a.name AS audienceName,
        a.description AS audienceDescription,
        l.*
      FROM audience AS a
      LEFT JOIN leads AS l 
        ON FIND_IN_SET(a.id, l.audienceIds)
        AND l.isDeleted = '0'
      WHERE a.userId = :userId
        AND a.isDeleted = '0'
      ORDER BY a.id DESC
    `;

    const results: any[] = await db.sequelize.query(query, {
      replacements: { userId },
      type: QueryTypes.SELECT,
    });

    const groupedResults: Record<number, Lead> = {};
    const formattedResults: Lead[] = [];

    for (const row of results) {
      if (!row.id) continue;

      if (!groupedResults[row.id]) {
        groupedResults[row.id] = {
          ...row,
          audienceData: [],
        };
        formattedResults.push(groupedResults[row.id]);
      }

      groupedResults[row.id].audienceData.push({
        id: row.audienceId,
        name: row.audienceName,
        description: row.audienceDescription,
      });
    }

    return formattedResults;
  } catch (error: any) {
    console.error("Error in getLeadsWithAudience:", error.message);
    return [];
  }
};

const removeAudienceInLead = async (
  leadId: number,
  audienceId: string
): Promise<any> => {
  try {
    const [record]: any[] = await db.sequelize.query(
      `
      SELECT id, audienceIds
      FROM leads
      WHERE id = :leadId AND isDeleted = '0'
      LIMIT 1
      `,
      {
        replacements: { leadId },
        type: QueryTypes.SELECT,
      }
    );

    if (!record) {
      return {
        success: false,
        statusCode: 404,
        message: "Record not found",
      };
    }

    let audiences = record.audienceIds
      ? record.audienceIds.split(",")
      : [];

    const updatedAudiences = audiences.filter(
      (id: string) => id !== audienceId
    );

    if (updatedAudiences.length === audiences.length) {
      return {
        success: false,
        statusCode: 400,
        message: "AudienceId not found in the record",
      };
    }

    await db.sequelize.query(
      `
      UPDATE leads
      SET audienceIds = :audienceIds
      WHERE id = :leadId
      `,
      {
        replacements: {
          leadId,
          audienceIds: updatedAudiences.join(","),
        },
        type: QueryTypes.UPDATE,
      }
    );

    return {
      success: true,
      statusCode: 200,
      message: "Audience Removed Successfully",
    };
  } catch (error: any) {
    console.error("Error removing audience from lead:", error.message);
    return {
      success: false,
      statusCode: 500,
      message: "Internal Server Error",
    };
  }
};

const getLeadsData = async (
  userId: number,
  audienceId?: number
): Promise<any[]> => {
  try {
    let query = `
      SELECT 
        a.id AS audienceId,
        a.name AS audienceName,
        a.description AS audienceDescription,
        l.*
      FROM audience AS a
      LEFT JOIN leads AS l
        ON FIND_IN_SET(a.id, l.audienceIds)
        AND l.isDeleted = '0'
      WHERE a.userId = :userId
        AND a.isDeleted = '0'
    `;

    const replacements: any = { userId };

    if (audienceId !== undefined) {
      query += " AND a.id = :audienceId";
      replacements.audienceId = audienceId;
    }

    console.log("QUERY:", query);

    return await db.sequelize.query(query, {
      replacements,
      type: QueryTypes.SELECT,
    });
  } catch (error: any) {
    console.error("Error in getLeadsData:", error.message);
    return [];
  }
};

// const getOtpMailContent = async (otp: string): Promise<string> => {
//   return `
//   <!DOCTYPE html>
//   <html lang="en">
//   <head>
//     <meta charset="UTF-8" />
//     <meta name="viewport" content="width=device-width, initial-scale=1.0" />
//     <title>Your OTP Code</title>
//   </head>

//   <body style="margin:0; padding:0; font-family:Arial, sans-serif; background-color:#f4f4f4;">
//     <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
//       <tr>
//         <td align="center" style="padding:40px 10px;">
//           <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
//             style="max-width:600px;background:#ffffff;border-radius:8px;
//                    box-shadow:0 0 10px rgba(0,0,0,0.05);">

//             <tr>
//               <td style="padding:30px;">
//                 <h2 style="margin-bottom:20px;color:#333;">
//                   Your One-Time Password (OTP)
//                 </h2>

//                 <p style="font-size:16px;color:#333;">Hello,</p>

//                 <p style="font-size:16px;color:#333;">
//                   Use the OTP below to complete your verification process.
//                   This code is valid for <strong>10 minutes</strong>.
//                 </p>

//                 <div style="text-align:center;margin:30px 0;">
//                   <span style="
//                     font-size:28px;
//                     font-weight:bold;
//                     letter-spacing:4px;
//                     padding:12px 24px;
//                     background:#f2f2f2;
//                     border-radius:6px;
//                     display:inline-block;
//                   ">
//                     ${otp}
//                   </span>
//                 </div>

//                 <p style="font-size:14px;color:#555;">
//                   For your security, do not share this OTP with anyone.
//                   If you did not request this code, please contact support.
//                 </p>

//                 <p style="font-size:16px;color:#333;">
//                   Regards,<br/>
//                   <strong>
//                     <a href="https://flowiz.biz" target="_blank" style="text-decoration:none;">
//                       Team Flowiz
//                     </a>
//                   </strong>
//                 </p>
//               </td>
//             </tr>

//             <tr>
//               <td style="padding:20px;text-align:center;font-size:12px;color:#999;">
//                 © ${new Date().getFullYear()}
//                 <a href="https://flowiz.biz" target="_blank"
//                    style="color:#999;text-decoration:none;">
//                   Flowiz
//                 </a>.
//                 All rights reserved.
//               </td>
//             </tr>

//           </table>
//         </td>
//       </tr>
//     </table>
//   </body>
//   </html>
//   `;
// };

const getOtpMailContent = async (otp: string): Promise<string> => {
  const year = new Date().getFullYear();
  const websiteUrl = "https://flowiz.biz/";
  
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Verify Your Account - Flowiz</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;700;800&display=swap');
      body { font-family: 'Manrope', Arial, sans-serif; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      a { text-decoration: none !important; }
    </style>
  </head>

  <body style="margin:0; padding:0; background-color:#f0f2f4; font-family: 'Manrope', Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding:40px 10px;">
          
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="max-width:550px; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.06);">
            
            <tr>
              <td style="padding:40px 40px 20px 40px; text-align:center;">
                <a href="${websiteUrl}" target="_blank" style="display:inline-block;cursor:pointer;" >
                  <img src="https://flowiz.biz/assets/images/logo.png" alt="Flowiz Logo" width="140" style="display:block; border:none;" />
                </a>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 40px 0 40px; text-align:center;">
                <h1 style="color:#111111; font-size:24px; font-weight:800; margin:0 0 16px 0; letter-spacing:-0.5px;">
                  Verify your account
                </h1>
                <p style="color:#333333; font-size:16px; line-height:1.6; margin:0;">
                  Hi there, <br/>
                  Please use the following verification code to complete your request on 
                  <a href="${websiteUrl}" style="color:#a570ff; font-weight:700; text-decoration:none; cursor:pointer;">Flowiz</a>. 
                  This code is valid for <strong>10 minutes</strong>.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:40px 40px; text-align:center;">
                <div style="background: linear-gradient(135deg, #a570ff 0%, #ff6eb2 100%); padding:2px; border-radius:12px; display:inline-block;">
                    <div style="background:#ffffff; border-radius:10px; padding:18px 36px;">
                        <span style="font-size:36px; font-weight:800; color:#111111; letter-spacing:8px; font-family: 'Courier New', Courier, monospace;">
                            ${otp}
                        </span>
                    </div>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:0 40px 40px 40px; text-align:center;">
                <p style="font-size:14px; color:#666666; margin:0; line-height:1.5;">
                  If you didn't request this code, you can safely ignore this email or 
                  <a href="mailto:support@flowiz.biz" style="color:#a570ff; text-decoration:none;">contact support</a>.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:0 40px; border-top:1px solid #1111111a;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="padding:30px 0; text-align:center;">
                            <p style="font-size:12px; color:#999999; margin:0; text-transform:uppercase; letter-spacing:1px;">
                                Sent by <a href="${websiteUrl}" style="color:#111111; font-weight:800; text-decoration:none; cursor:pointer;">Flowiz</a> &bull; Multi-Agent Workflows
                            </p>
                            <div style="margin-top:14px;">
                                <a href="${websiteUrl}" style="font-size:12px; color:#a570ff; text-decoration:none; margin:0 12px; font-weight:600; cursor:pointer;">Website</a>
                                <a href="${websiteUrl}privacy" style="font-size:12px; color:#a570ff; text-decoration:none; margin:0 12px; font-weight:600; cursor:pointer;">Privacy Policy</a>
                                <a href="${websiteUrl}terms" style="font-size:12px; color:#a570ff; text-decoration:none; margin:0 12px; font-weight:600; cursor:pointer;">Terms</a>
                            </div>
                        </td>
                    </tr>
                </table>
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:550px;">
            <tr>
              <td style="padding:24px 10px; text-align:center; font-size:11px; color:#999999; line-height:1.6;">
                &copy; ${year} <a href="${websiteUrl}" style="color:#999999; text-decoration:underline; cursor:pointer;">Flowiz Inc</a>. All rights reserved. <br/>
                Building Multi-Agent AI Workflows in Seconds.
              </td>
            </tr>
          </table>
          
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
};



export {
  setRecords,
  getRecordById,
  deleteRecord,
  listRecords,
  getPlanFeatures,
  likeRecord,
  hashPassword,
  comparePassword,
  generateOtp,
  bulkUploadLeads,
  getOtpMailContent,
  getCommonRecordsWhere,
  getCommonRecord,
  commonRecord,
  getAudienceByLeads,
  getLeadsWithAudience,
  removeAudienceInLead,
getLeadsData
};
