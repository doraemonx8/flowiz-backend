import { Sequelize} from 'sequelize';
import Flow from "../models/flow";

const sequelize = new Sequelize('campaign', 'root', 'cybernauts@110@aws', {
  host: 'localhost',
  dialect: 'mysql',
  password: 'yes',
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
