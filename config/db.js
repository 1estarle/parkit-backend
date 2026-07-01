// config/db.js
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const schemaQuery = `
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(50) DEFAULT 'cliente',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS parking_spots (
    id SERIAL PRIMARY KEY,
    owner_id INT REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    address VARCHAR(255) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    price_per_minute INTEGER NOT NULL,
    image_url VARCHAR(500),
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    parking_spot_id INT REFERENCES parking_spots(id) ON DELETE CASCADE,
    driver_id INT REFERENCES users(id) ON DELETE CASCADE,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    total_amount NUMERIC(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'confirmed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS high_demand_zones (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radius_meters INTEGER NOT NULL,
    suggested_price INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

async function initializeDatabase(client) {
  try {
    console.log("🛠️ Inicializando esquema de base de datos...");
    await client.query(schemaQuery);
    console.log("✅ Esquema de base de datos verificado/creado.");

    // Verificar si hay usuarios
    const usersCount = await client.query("SELECT COUNT(*) FROM users");
    if (parseInt(usersCount.rows[0].count) === 0) {
      console.log("🌱 Insertando usuario demo...");
      await client.query(`
        INSERT INTO users (id, name, email, password_hash, phone, role)
        VALUES (1, 'Usuario Demo', 'demo@parkit.com', 'password123', '+56912345678', 'arrendador')
      `);
      await client.query("SELECT setval('users_id_seq', 2, false)");
    }

    // Verificar si hay zonas de alta demanda
    const zonesCount = await client.query("SELECT COUNT(*) FROM high_demand_zones");
    if (parseInt(zonesCount.rows[0].count) === 0) {
      console.log("🌱 Insertando zonas de alta demanda...");
      await client.query(`
        INSERT INTO high_demand_zones (name, latitude, longitude, radius_meters, suggested_price) VALUES
        ('Centro de Santiago', -33.4372, -70.6506, 1000, 25),
        ('Providencia', -33.4256, -70.6146, 800, 30),
        ('Las Condes / Tobalaba', -33.4172, -70.5982, 1200, 35)
      `);
    }

    // Verificar si hay estacionamientos
    const spotsCount = await client.query("SELECT COUNT(*) FROM parking_spots");
    if (parseInt(spotsCount.rows[0].count) === 0) {
      console.log("🌱 Insertando estacionamientos iniciales...");
      const { spots } = require("../initial_data");
      for (const spot of spots) {
        const cleanId = parseInt(spot.id.replace("spot_", ""));
        await client.query(`
          INSERT INTO parking_spots (id, owner_id, title, description, address, latitude, longitude, price_per_minute, image_url, is_available)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          cleanId,
          1,
          spot.title,
          spot.description,
          spot.address,
          spot.latitude,
          spot.longitude,
          spot.pricePerMinute,
          spot.images && spot.images[0] ? spot.images[0] : null,
          spot.availability
        ]);
      }
      await client.query("SELECT setval('parking_spots_id_seq', COALESCE((SELECT MAX(id)+1 FROM parking_spots), 1), false)");
    }

    console.log("✅ Inicialización de base de datos completa.");
  } catch (err) {
    console.error("❌ Error inicializando base de datos:", err);
  }
}

async function connectAndInit(retries = 10, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      console.log("✅ Conexión exitosa a la base de datos Parkit");
      await initializeDatabase(client);
      client.release();
      return;
    } catch (err) {
      console.error(`❌ Intento ${i + 1}/${retries} fallido al conectar con PostgreSQL: ${err.message}`);
      if (i < retries - 1) {
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }
  console.error("❌ No se pudo conectar a la base de datos después de varios intentos.");
}

connectAndInit();

module.exports = pool;
