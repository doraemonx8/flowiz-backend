const  crypto =  require("crypto");


const secretKey = "603495c7c47a02be365c9333728a5e0514baf535539d895d026a4e215ef9fa5e";
const ivString = "eb47d0b5913c3eabc75b22644d2ab006";

if (!secretKey || secretKey.length !== 64) {
    throw new Error("Invalid secret key: Must be a 32-byte (64 hex characters) string.");
}
if (!ivString || ivString.length !== 32) {
    throw new Error("Invalid IV: Must be a 16-byte (32 hex characters) string.");
}

const iv = Buffer.from(ivString, "hex"); 

const encryptId = (id) => {
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


const a=encryptId(412);
console.log(a);
