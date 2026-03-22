import { DataTypes, Sequelize } from 'sequelize';

export default (sequelize: Sequelize) => {
  const Transaction = sequelize.define('transactions', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    orderId: { type: DataTypes.STRING(1024), allowNull: true },
    planId: { type: DataTypes.INTEGER, allowNull: true },
    offerId: { type: DataTypes.INTEGER, defaultValue: 0, allowNull: true },
    total: { type: DataTypes.STRING(256), allowNull: true },
    invoiceURL: { type: DataTypes.STRING(1024), allowNull: true },
    basePrice: { type: DataTypes.INTEGER, allowNull: true },
    error_code: { type: DataTypes.STRING(42), allowNull: true },
    error_source: { type: DataTypes.STRING(45), allowNull: true },
    error_reason: { type: DataTypes.STRING(102), allowNull: true },
    status: {
      type: DataTypes.ENUM('0', '1', '2'),
      defaultValue: '0',
      comment: "0=pending,1=success,2=failed",
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

  return Transaction;
};