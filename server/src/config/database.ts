import { Sequelize, Options } from 'sequelize';
import * as dotenv from 'dotenv';

dotenv.config();

const isDevelopment = process.env.NODE_ENV !== 'production';
const dbDialect = process.env.DB_DIALECT || 'mysql';

function createSequelizeInstance(): Sequelize {
  if (dbDialect === 'sqlite') {
    const opts: Options = {
      dialect: 'sqlite',
      storage: process.env.DB_STORAGE || ':memory:',
      logging: false,
      define: {
        timestamps: true,
        underscored: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    };
    return new Sequelize(opts);
  }

  return new Sequelize(
    process.env.DB_NAME || 'vdeio',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      dialect: 'mysql',
      dialectModule: require('mysql2'),
      pool: {
        max: 10,
        min: 2,
        acquire: 30000,
        idle: 10000,
      },
      logging: isDevelopment ? console.log : false,
      define: {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        timestamps: true,
        underscored: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    }
  );
}

export const sequelize = createSequelizeInstance();

export async function testConnection(): Promise<void> {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
}
