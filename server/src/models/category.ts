import { DataTypes, Model, Optional, InferAttributes, InferCreationAttributes, CreationOptional, Sequelize } from 'sequelize';

export interface CategoryAttributes {
  id: number;
  name: string | null;
  parentId: number | null;
  sortOrder: number;
  createdAt: Date;
}

export interface CategoryCreationAttributes extends Optional<CategoryAttributes, 'id' | 'parentId' | 'sortOrder' | 'createdAt'> {}

export class Category extends Model<InferAttributes<Category>, InferCreationAttributes<Category>> {
  declare id: CreationOptional<number>;
  declare name: string | null;
  declare parentId: number | null;
  declare sortOrder: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
}

export function createModel(sequelize: Sequelize): typeof Category {
  Category.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      parentId: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'parent_id',
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'sort_order',
      },
      createdAt: {
        type: DataTypes.DATE,
        field: 'created_at',
      },
    },
    {
      sequelize,
      tableName: 'categories',
      timestamps: true,
      underscored: true,
      updatedAt: false,
    }
  );

  return Category;
}
