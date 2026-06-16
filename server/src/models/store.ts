import { DataTypes, Model, Optional, InferAttributes, InferCreationAttributes, CreationOptional, Sequelize } from 'sequelize';

export interface StoreAttributes {
  id: number;
  name: string | null;
  code: string | null;
  region: string | null;
  address: string | null;
  status: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoreCreationAttributes extends Optional<StoreAttributes, 'id' | 'status' | 'createdAt' | 'updatedAt'> {}

export class Store extends Model<InferAttributes<Store>, InferCreationAttributes<Store>> {
  declare id: CreationOptional<number>;
  declare name: string | null;
  declare code: string | null;
  declare region: string | null;
  declare address: string | null;
  declare status: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function createModel(sequelize: Sequelize): typeof Store {
  Store.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      code: {
        type: DataTypes.STRING(32),
        unique: true,
        allowNull: true,
      },
      region: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      address: {
        type: DataTypes.STRING(256),
        allowNull: true,
      },
      status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      tableName: 'stores',
      timestamps: true,
      underscored: true,
    }
  );

  return Store;
}
