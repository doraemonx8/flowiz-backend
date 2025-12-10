import { Sequelize } from 'sequelize';
import Flow from "../models/flow";
import dotenv from 'dotenv';

dotenv.config();

const DB_NAME = process.env.DB_NAME || 'campaign';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_DIALECT = (process.env.DB_DIALECT as any) || 'mysql';

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  dialect: DB_DIALECT,
  logging: (msg: string) => {
    console.log('SQL Connection:', msg);
  },
  define: {
    freezeTableName: true,
  },
});

const db: { Sequelize: typeof Sequelize; sequelize: Sequelize; flows: any } = {} as any;

async function initializeDatabase() {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }

  sequelize.addHook("afterDisconnect", () => {
    console.log("Connection has been closed for campaign db");
  });

  await sequelize
    .sync({ force: false, alter: false, match: /campaign$/ })
    .then(() => {
      console.log('All models were synchronized successfully in campaign');
    });

  db.flows = await Flow(sequelize);
  db.sequelize=sequelize;
}

initializeDatabase().catch((error) => {
  console.error('Database initialization failed:', error);
});

export default db;
