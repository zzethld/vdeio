import { seed } from './001_seed_data';
import { seedMqttUser } from './002_seed_mqtt_user';
import { sequelize } from '../config/database';

async function main() {
  try {
    await seed();
    await seedMqttUser();
  } catch (error) {
    console.error('Seeder runner failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
