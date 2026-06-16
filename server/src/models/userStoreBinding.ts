import { DataTypes, Model, Optional, InferAttributes, InferCreationAttributes, CreationOptional, Sequelize } from 'sequelize';

export interface UserStoreBindingAttributes {
  id: number;
  userId: number;
  storeId: number;
}

export interface UserStoreBindingCreationAttributes extends Optional<UserStoreBindingAttributes, 'id'> {}

export class UserStoreBinding extends Model<InferAttributes<UserStoreBinding>, InferCreationAttributes<UserStoreBinding>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare storeId: number;
}

export function createModel(sequelize: Sequelize): typeof UserStoreBinding {
  UserStoreBinding.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'user_id',
      },
      storeId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'store_id',
      },
    },
    {
      sequelize,
      tableName: 'user_store_bindings',
      timestamps: false,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'store_id'],
        },
        {
          unique: true,
          fields: ['user_id'],
        },
      ],
    }
  );

  return UserStoreBinding;
}
