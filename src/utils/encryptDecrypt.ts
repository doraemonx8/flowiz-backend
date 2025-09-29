import crypto from "crypto";


const secretKey = process.env.CRYPTO_SECRET_KEY;
const ivString = process.env.CRYPTO_IV;

if (!secretKey || secretKey.length !== 64) {
    throw new Error("Invalid secret key: Must be a 32-byte (64 hex characters) string.");
}
if (!ivString || ivString.length !== 32) {
    throw new Error("Invalid IV: Must be a 16-byte (32 hex characters) string.");
}

const iv = Buffer.from(ivString, "hex"); 

const encryptId = (id: string | number): string => {
    try {
        const cipher = crypto.createCipheriv(
            "aes-256-cbc",
            Buffer.from(secretKey, "hex"), // Convert key to Buffer
            iv
        );

        let encrypted = cipher.update(id.toString(), "utf-8", "hex");
        encrypted += cipher.final("hex");

        return iv.toString("hex") + encrypted; // Prepend IV for decryption
    } catch (error) {
        console.error("Encryption error:", error);
        return "";
    }
};

const decryptId = (encryptedId: string): string | null => {
    try {
        const extractedIv = Buffer.from(encryptedId.slice(0, 32), "hex"); // Extract IV from encrypted text
        const encryptedText = encryptedId.slice(32); // Extract encrypted data

        const decipher = crypto.createDecipheriv(
            "aes-256-cbc",
            Buffer.from(secretKey, "hex"),
            extractedIv
        );

        let decrypted = decipher.update(encryptedText, "hex", "utf-8");
        decrypted += decipher.final("utf-8");

        return decrypted;
    } catch (error) {
        console.error("Decryption error:", error);
        return null;
    }
};

export { encryptId, decryptId };
