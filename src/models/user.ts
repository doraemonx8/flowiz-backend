import { DataTypes, Sequelize } from 'sequelize';

export default (sequelize: Sequelize) => {
  const User = sequelize.define('users', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    roleId: { type: DataTypes.INTEGER, defaultValue: 0 },
    groupCompaniesId: { type: DataTypes.INTEGER, defaultValue: 0 },
    companyId: { type: DataTypes.INTEGER, defaultValue: 1 },
    departmenId: { type: DataTypes.INTEGER, defaultValue: 0 },
    image: { type: DataTypes.STRING(256), allowNull: true },
    name: { type: DataTypes.STRING(126), allowNull: true },
    email: { type: DataTypes.STRING(256), allowNull: true },
    contact: { type: DataTypes.STRING(20), allowNull: true },
    otp: { type: DataTypes.STRING(20), defaultValue: '0' },
    token: { type: DataTypes.STRING(356), allowNull: true },
    googleTokenData: { type: DataTypes.TEXT, allowNull: true },
    zohoTokenData: { type: DataTypes.TEXT, allowNull: true },
    outlookTokenData: { type: DataTypes.TEXT, allowNull: true },
    metaTokenData: { type: DataTypes.TEXT, allowNull: true },
    customerId: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "id of the payment gateway customer",
    },
    status: {
      type: DataTypes.ENUM('0', '1', '2'),
      defaultValue: '0',
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

  return User;
};