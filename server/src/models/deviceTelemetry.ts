import { DataTypes, Model, Optional, InferAttributes, InferCreationAttributes, CreationOptional, Sequelize } from 'sequelize';

export interface DeviceTelemetryAttributes {
  id: number;
  deviceId: string;
  cpu: number | null;
  memory: number | null;
  disk: number | null;
  diskFree: number | null;
  cacheSize: number | null;
  appVersion: string | null;
  uptime: number | null;
  network: string | null;
  createdAt: Date;
}

export interface DeviceTelemetryCreationAttributes extends Optional<DeviceTelemetryAttributes, 'id' | 'cpu' | 'memory' | 'disk' | 'diskFree' | 'cacheSize' | 'appVersion' | 'uptime' | 'network' | 'createdAt'> {}

export class DeviceTelemetry extends Model<InferAttributes<DeviceTelemetry>, InferCreationAttributes<DeviceTelemetry>> {
  declare id: CreationOptional<number>;
  declare deviceId: string;
  declare cpu: CreationOptional<number | null>;
  declare memory: CreationOptional<number | null>;
  declare disk: CreationOptional<number | null>;
  declare diskFree: CreationOptional<number | null>;
  declare cacheSize: CreationOptional<number | null>;
  declare appVersion: CreationOptional<string | null>;
  declare uptime: CreationOptional<number | null>;
  declare network: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
}

export function createModel(sequelize: Sequelize): typeof DeviceTelemetry {
  DeviceTelemetry.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      deviceId: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'device_id',
      },
      cpu: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
      },
      memory: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
      },
      disk: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
      },
      diskFree: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
        field: 'disk_free',
      },
      cacheSize: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: 0,
        field: 'cache_size',
      },
      appVersion: {
        type: DataTypes.STRING(32),
        allowNull: true,
        defaultValue: '',
        field: 'app_version',
      },
      uptime: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      network: {
        type: DataTypes.STRING(16),
        allowNull: true,
        defaultValue: 'offline',
      },
      createdAt: {
        type: DataTypes.DATE,
        field: 'created_at',
      },
    },
    {
      sequelize,
      tableName: 'device_telemetries',
      timestamps: true,
      underscored: true,
      updatedAt: false,
    }
  );

  return DeviceTelemetry;
}
