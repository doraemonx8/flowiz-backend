import { Sequelize, DataTypes, Model, Optional } from 'sequelize';


interface FlowAttributes {
  id: number;
  userId: number;
  companyId:number,
  slug: string;
  prompt: string;
  status: '0' | '1';
  isDeleted: '0' | '1';
  json: any;
}

interface FlowCreationAttributes extends Optional<FlowAttributes, 'id'> {}

const Flow = (sequelize: Sequelize) => {

  const FlowModel = sequelize.define<Model<FlowAttributes, FlowCreationAttributes>>(
    'flows',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      companyId:{
        type:DataTypes.INTEGER,
        allowNull:false,
        defaultValue:1
      },
      slug: {
        type: DataTypes.STRING(256),
        allowNull: true,
      },
      prompt: {
        type: DataTypes.TEXT(),
        allowNull: true,
      },
      
      status: {
        type: DataTypes.ENUM('0', '1'),
        defaultValue: '1',
      },
      isDeleted: {
        type: DataTypes.ENUM('0', '1'),
        defaultValue: '0',
      },
      json: {
        type: DataTypes.JSON(),
        allowNull: true,
      },
    },
    {
      timestamps: false, // Disable createdAt and updatedAt fields
    }
  );

  return FlowModel;
};

export default Flow;
