import { DataTypes, Model, Optional, InferAttributes, InferCreationAttributes, CreationOptional, Sequelize } from 'sequelize';

export interface DeviceAttributes {
  id: number;
  deviceId: string;
  storeId: number | null;
  deviceName: string | null;
  osVersion: string | null;
  appVersion: string | null;
  lastOnlineAt: Date | null;
  status: 'online' | 'offline';
  localPaths: Record<string, string>;
  createdAt: Date;
}

export interface DeviceCreationAttributes extends Optional<DeviceAttributes, 'id' | 'status' | 'createdAt'> {}

export class Device extends Model<InferAttributes<Device>, InferCreationAttributes<Device>> {
  declare id: CreationOptional<number>;
  declare deviceId: string;
  declare storeId: number | null;
  declare deviceName: string | null;
  declare osVersion: string | null;
  declare appVersion: string | null;
  declare lastOnlineAt: Date | null;
  declare status: CreationOptional<'online' | 'offline'>;
  declare localPaths: CreationOptional<Record<string, string>>;
  declare createdAt: CreationOptional<Date>;
}

export function createModel(sequelize: Sequelize): typeof Device {
  Device.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      deviceId: {
        type: DataTypes.STRING(64),
        unique: true,
        allowNull: false,
        field: 'device_id',
      },
      storeId: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'store_id',
      },
      deviceName: {
        type: DataTypes.STRING(128),
        allowNull: true,
        field: 'device_name',
      },
      osVersion: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'os_version',
      },
      appVersion: {
        type: DataTypes.STRING(32),
        allowNull: true,
        field: 'app_version',
      },
      lastOnlineAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_online_at',
      },
      status: {
        type: DataTypes.ENUM('online', 'offline'),
        defaultValue: 'offline',
      },
      localPaths: {
        type: DataTypes.JSON,
        defaultValue: '{}',
        field: 'local_paths',
      },
      createdAt: {
        type: DataTypes.DATE,
        field: 'created_at',
      },
    },
    {
      sequelize,
      tableName: 'devices',
      timestamps: true,
      underscored: true,
      updatedAt: false,
    }
  );

  return Device;
}
