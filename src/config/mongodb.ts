import mongoose from "mongoose";

const MONGO_URI = process.env.LOCAL_MONGO_URI || process.env.MONGO_URI || "";

const connectMongo = async () => {
    try {
        const connection = await mongoose.connect(MONGO_URI, {dbName:"flowiz"} as mongoose.ConnectOptions);

        console.log("MongoDB connected successfully 🚀");

        const db = connection.connection.db;

        if (!db) {
            console.error("Database object is undefined ❌");
            return;
        }

    } catch (error) {
        console.error("MongoDB connection failed ❌", error);
        process.exit(1);
    }
};

export default connectMongo;
