import bcrypt from 'bcryptjs';
import { sequelize } from '../config/database';
import { setupAssociations } from '../models';
import { createModel as createAdminModel } from '../models/admin';
import { createModel as createStoreModel } from '../models/store';

export async function seed(): Promise<void> {
  try {
    // Initialize models
    const Admin = createAdminModel(sequelize);
    const Store = createStoreModel(sequelize);

    await sequelize.authenticate();
    console.log('Database connected.');

    // Sync models for SQLite (creates tables automatically)
    if (process.env.DB_DIALECT === 'sqlite') {
      setupAssociations();
      await sequelize.sync({ force: false });
      console.log('SQLite tables synced for seed.');
    }

    // Seed admin
    const adminExists = await Admin.findOne({ where: { username: 'admin' } });
    if (!adminExists) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      await Admin.create({
        username: 'admin',
        passwordHash,
        name: '\u7cfb\u7edf\u7ba1\u7406\u5458',
        role: 'super_admin',
        status: 1,
      });
      console.log('Admin user created: admin / admin123');
    } else {
      console.log('Admin user already exists, skipping.');
    }

    // Seed test store
    const storeExists = await Store.findOne({ where: { code: 'TEST001' } });
    if (!storeExists) {
      await Store.create({
        name: '\u6d4b\u8bd5\u95e8\u5e97',
        code: 'TEST001',
        region: '\u534e\u4e1c',
        address: '\u4e0a\u6d77\u5e02\u6d66\u4e1c\u65b0\u533a\u6d4b\u8bd5\u8def1\u53f7',
        status: 1,
      });
      console.log('Test store created: TEST001');
    } else {
      console.log('Test store already exists, skipping.');
    }

    console.log('Seed completed successfully.');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}
