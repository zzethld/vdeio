import { DataTypes, Model, Optional, InferAttributes, InferCreationAttributes, CreationOptional, Sequelize } from 'sequelize';

export interface AdminAttributes {
  id: number;
  username: string;
  passwordHash: string;
  name: string | null;
  role: 'super_admin' | 'admin';
  loginFailCount: number;
  lockedUntil: Date | null;
  status: number;
  createdAt: Date;
}

export interface AdminCreationAttributes extends Optional<AdminAttributes, 'id' | 'role' | 'loginFailCount' | 'lockedUntil' | 'status' | 'createdAt'> {}

export class Admin extends Model<InferAttributes<Admin>, InferCreationAttributes<Admin>> {
  declare id: CreationOptional<number>;
  declare username: string;
  declare passwordHash: string;
  declare name: string | null;
  declare role: CreationOptional<'super_admin' | 'admin'>;
  declare loginFailCount: CreationOptional<number>;
  declare lockedUntil: Date | null;
  declare status: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
}

export function createModel(sequelize: Sequelize): typeof Admin {
  Admin.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      username: {
        type: DataTypes.STRING(64),
        unique: true,
        allowNull: false,
      },
      passwordHash: {
        type: DataTypes.STRING(256),
        allowNull: false,
        field: 'password_hash',
      },
      name: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      role: {
        type: DataTypes.ENUM('super_admin', 'admin'),
        defaultValue: 'admin',
      },
      loginFailCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'login_fail_count',
      },
      lockedUntil: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'locked_until',
      },
      status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
      },
      createdAt: {
        type: DataTypes.DATE,
        field: 'created_at',
      },
    },
    {
      sequelize,
      tableName: 'admins',
      timestamps: true,
      underscored: true,
      updatedAt: false,
    }
  );

  return Admin;
}
