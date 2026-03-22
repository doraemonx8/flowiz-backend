import fs from "fs";
import path from "path";
import axios from "axios";

import { SendMailClient } from "zeptomail";
const url = process.env.EMAIL_SERVICE_URL as string;
const token = process.env.EMAIL_SERVICE_TOKEN as string;

const mailClient = new SendMailClient({ url, token });

export const sendZeptoMail = async (
  toAddress: string,
  toName: string,
  subject: string,
  htmlBody: string
): Promise<void> => {
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toAddress);

  const isTestEmail = toAddress.toLowerCase().includes("test");

  if (!isValidEmail || isTestEmail) {
    console.warn(
      `Skipped sending email to "${toAddress}" (invalid or test email)`
    );
    return;
  }

  try {
    await mailClient.sendMail({
      from: {
        address: "noreply@flowiz.biz",
        name: "Flowiz",
      },
      to: [
        {
          email_address: {
            address: toAddress,
            name: toName,
          },
        },
      ],
      subject,
      htmlbody: htmlBody,
    });

    console.log(`Email sent successfully to ${toAddress}`);
  } catch (error: any) {
    console.error(
      `Failed to send email to ${toAddress}:`,
      error?.message || error
    );
    throw new Error("Email sending failed");
  }
};


export const saveImageFromUrl = async (
  url: string
): Promise<string | null> => {
  try {
    if (!url) return null;

    const response = await axios.get<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      timeout: 10000,
    });

    const imageName = `${Date.now()}.jpg`;
    const folderPath = path.join(
      process.cwd(),
      "attachments",
      "profile"
    );

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const filePath = path.join(folderPath, imageName);
    fs.writeFileSync(filePath, Buffer.from(response.data));

    return imageName;
  } catch (error: any) {
    console.error(
      "Error saving image:",
      error?.message || error
    );
    return null;
  }
};