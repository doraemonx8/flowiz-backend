import { DataTypes, Sequelize } from 'sequelize';

export default (sequelize: Sequelize) => {
  const Plan = sequelize.define('plans', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    lemonId: { type: DataTypes.INTEGER, allowNull: true },
    name: { type: DataTypes.STRING(21), allowNull: true },
    amount: { type: DataTypes.STRING(7), allowNull: true },
    duration: { type: DataTypes.INTEGER, allowNull: true },
    status: {
      type: DataTypes.ENUM('0', '1'),
      defaultValue: '1',
    },
    isDeleted: {
      type: DataTypes.ENUM('0', '1'),
      defaultValue: '0',
    },
  }, {
    timestamps: true,
    createdAt: 'createdOn',
    updatedAt: 'modifiedOn',
  });

  return Plan;
};