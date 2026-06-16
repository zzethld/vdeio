import { DataTypes, Model, Optional, InferAttributes, InferCreationAttributes, CreationOptional, Sequelize } from 'sequelize';

export interface UserAttributes {
  id: number;
  dingtalkId: string | null;
  name: string | null;
  phone: string | null;
  avatar: string | null;
  role: 'admin' | 'operator';
  status: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'role' | 'status' | 'createdAt' | 'updatedAt'> {}

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare dingtalkId: string | null;
  declare name: string | null;
  declare phone: string | null;
  declare avatar: string | null;
  declare role: CreationOptional<'admin' | 'operator'>;
  declare status: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function createModel(sequelize: Sequelize): typeof User {
  User.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      dingtalkId: {
        type: DataTypes.STRING(64),
        unique: true,
        allowNull: true,
        field: 'dingtalk_id',
      },
      name: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      avatar: {
        type: DataTypes.STRING(256),
        allowNull: true,
      },
      role: {
        type: DataTypes.ENUM('admin', 'operator'),
        defaultValue: 'operator',
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
      tableName: 'users',
      timestamps: true,
      underscored: true,
    }
  );

  return User;
}
