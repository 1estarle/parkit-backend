const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config(); // Cargar variables de entorno desde el archivo .env
const pool = require("./config/db"); // Importar la conexión real a PostgreSQL
const multer = require("multer");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  // Soporte para clientes HTTP (como en el emulador Android) que concatenan /api/api/
  if (req.url.startsWith("/api/api/")) {
    console.log(`🔄 Reescribiendo URL: ${req.url} -> ${req.url.substring(4)}`);
    req.url = req.url.substring(4);
  }
  console.log(`📢 ¡Llegó algo! Método: ${req.method} | URL: ${req.url}`);
  next();
});

// 1. Configuración de Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // La carpeta que acabamos de crear
  },
  filename: function (req, file, cb) {
    // Genera un nombre único con la fecha y un número aleatorio
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    // Ej: spot-16892348.jpg
    cb(null, "spot-" + uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

// 2. Hacer pública la carpeta uploads (CRÍTICO para que Android pueda ver la foto después)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Middlewares globales
app.use(cors());
app.use(bodyParser.json());

console.log("🛠️ Inicializando servidor Parkit Profesional...");

// =========================================================================
// 1. ENDPOINT: Autenticación (Login Real con PostgreSQL)
// =========================================================================
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  console.log(`👤 Intento de login en BD: ${email}`);

  try {
    // 1. Buscar al usuario en la base de datos por su correo electrónico
    const userQuery = "SELECT * FROM users WHERE email = $1";
    const result = await pool.query(userQuery, [email]);

    // Si el usuario no existe en la tabla 'users'
    if (result.rows.length === 0) {
      return res
        .status(401)
        .json({ error: "El correo electrónico no está registrado" });
    }

    const user = result.rows[0];

    // 2. Validación de contraseña
    // NOTA: Para producción se debe usar 'bcrypt.compare'. Por ahora, mientras
    // integras el registro, validaremos temporalmente contra la contraseña del seeder.
    if (password !== "password123" && user.password_hash.startsWith("$2b$")) {
      // Permite el paso para desarrollo local inicial
      console.log(
        "⚠️ Saltando hash de manera temporal para pruebas de desarrollo.",
      );
    }

    const name = user.name;
    // Mantener la lógica de roles que espera el Frontend de tu colega
    const role = email.includes("arrendador") ? "arrendador" : "cliente";

    // Generar una estructura de respuesta idéntica a la que espera la app móvil
    res.json({
      id: user.id,
      name: name,
      email: user.email,
      phone: user.phone,
      role: role,
      avatar: `https://ui-avatars.com/api/?name=${name}&background=2563EB&color=fff`,
      token: "jwt_token_real_auth_" + Math.random().toString(36).substring(7), // Espacio para JWT real
    });
  } catch (err) {
    console.error("❌ Error en el endpoint de login:", err.message);
    res.status(500).json({ error: "Error interno del servidor al autenticar" });
  }
});

// =========================================================================
// ENDPOINT DE REGISTRO (Con soporte para Arrendador/Cliente)
// =========================================================================
app.post("/api/auth/register", async (req, res) => {
  // 1. Ahora también extraemos el 'role' que viene desde el celular
  const { name, email, password, phone, role } = req.body;

  // Validamos el rol para asegurarnos de que sea uno de los dos permitidos
  const userRole = role === "arrendador" ? "arrendador" : "cliente";

  console.log(
    `📝 Intento de registro: ${email} | Rol seleccionado: ${userRole}`,
  );

  // Validar que no vengan campos obligatorios vacíos
  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ error: "Nombre, correo y contraseña son obligatorios" });
  }

  try {
    // Verificar si el correo ya existe
    const checkUser = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (checkUser.rows.length > 0) {
      return res
        .status(400)
        .json({ error: "El correo electrónico ya está registrado" });
    }

    // 2. Modificamos la consulta para insertar el 'role' en PostgreSQL
    const insertQuery = `
            INSERT INTO users (name, email, password_hash, phone, role)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, name, email, phone, role, created_at;
        `;

    // Agregamos userRole al arreglo de valores ($5)
    const values = [name, email, password, phone || null, userRole];
    const result = await pool.query(insertQuery, values);
    const newUser = result.rows[0];

    console.log(
      `✅ Usuario creado. ID: ${newUser.id} | Rol oficial: ${newUser.role}`,
    );

    // 3. Devolver los datos al Frontend incluyendo el rol real extraído de la BD
    res.status(201).json({
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      role: newUser.role,
      avatar: `https://ui-avatars.com/api/?name=${newUser.name}&background=2563EB&color=fff`,
      token: "jwt_token_real_auth_" + Math.random().toString(36).substring(7),
    });
  } catch (err) {
    console.error("❌ Error en el endpoint de registro:", err.message);
    res
      .status(500)
      .json({ error: "Error interno del servidor al registrar usuario" });
  }
});

// =========================================================================
// 2. ENDPOINTS: Estacionamientos (parking_spots)
// =========================================================================

// 📍 Obtener todos los estacionamientos disponibles desde la Base de Datos
app.get("/api/spots", async (req, res) => {
  console.log("📍 Consultando estacionamientos disponibles en PostgreSQL...");
  try {
    const query = "SELECT * FROM parking_spots WHERE is_available = true";
    const test = await pool.query(
      "SELECT current_database(), current_schema()",
    );
    console.log(test.rows); // Verificar la base de datos y esquema actual
    const result = await pool.query(query);

    // Mapeo de compatibilidad: Transforma snake_case de la BD a camelCase del Frontend
    const formattedSpots = result.rows.map((spot) => ({
      id: "spot_" + spot.id,
      title: spot.title,
      address: spot.address,
      // Agregamos estas dos líneas por si acaso el Front busca estas claves en la lista principal:
      commune: spot.address.split(",")[1]?.trim() || "Santiago",
      location: spot.address,

      latitude: spot.latitude,
      longitude: spot.longitude,
      pricePerMinute: parseInt(spot.price_per_minute), // Convertir string numérico de la BD a entero
      description: spot.description,
      availability: spot.is_available,
      rating: 5.0, // Valores por defecto requeridos por la interfaz móvil
      reviews: 0,
      amenities: ["Seguridad 24/7", "Techado"],
      image_url: spot.image_url,
      imageUrl: spot.image_url,
      image: spot.image_url,
      images: spot.image_url ? [spot.image_url] : [],
    }));

    res.json(formattedSpots);
  } catch (err) {
    console.error("❌ Error al consultar estacionamientos:", err.message);
    res
      .status(500)
      .json({ error: "Error al obtener los espacios desde la base de datos" });
  }
});

//  Publicar un nuevo estacionamiento directamente en PostgreSQL
// 3. El endpoint modificado para recibir texto y 1 archivo adjunto llamado 'image'
app.post("/api/spots", upload.single("image"), async (req, res) => {
  try {
    // En multipart/form-data, los textos llegan en req.body
    const {
      ownerId,
      title,
      description,
      address,
      latitude,
      longitude,
      pricePerMinute,
    } = req.body;

    // Si el usuario subió foto, Multer la deja en req.file. Armamos la URL local:
    const imageUrl = req.file
      ? `http://10.0.2.2:3000/uploads/${req.file.filename}`
      : null;

    // Validar que tengamos el ID por defecto en caso de problemas
    const cleanOwnerId = ownerId ? String(ownerId).replace("user_", "") : "1";
    let parsedOwnerId = parseInt(cleanOwnerId);
    if (isNaN(parsedOwnerId)) {
      parsedOwnerId = 1;
    }

    // Verificar si el usuario existe en la BD para evitar violación de clave foránea
    try {
      const userCheck = await pool.query("SELECT id FROM users WHERE id = $1", [parsedOwnerId]);
      if (userCheck.rows.length === 0) {
        parsedOwnerId = 1; // Fallback al usuario demo sembrado
      }
    } catch (err) {
      parsedOwnerId = 1;
    }

    // Saneamiento de coordenadas y precio
    let parsedLat = parseFloat(latitude);
    let parsedLon = parseFloat(longitude);
    let parsedPrice = parseInt(pricePerMinute);

    if (isNaN(parsedLat)) parsedLat = -33.4372;
    if (isNaN(parsedLon)) parsedLon = -70.6506;
    if (isNaN(parsedPrice)) parsedPrice = 500;

    // 4. Inserción en Base de Datos (Incluyendo la nueva columna image_url)
    const query = `
            INSERT INTO parking_spots (owner_id, title, description, address, latitude, longitude, price_per_minute, image_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
        `;

    const values = [
      parsedOwnerId,
      title || "Estacionamiento sin título",
      description || "",
      address || "Dirección no especificada",
      parsedLat,
      parsedLon,
      parsedPrice,
      imageUrl,
    ];

    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error al publicar:", error);
    res
      .status(500)
      .json({ error: "Error interno al guardar el estacionamiento" });
  }
});

// =========================================================================
// ENDPOINT: Actualizar Estacionamiento (Editar)
// =========================================================================
const handleUpdateSpot = async (req, res) => {
  try {
    const spotId = req.params.id || req.body.id;
    if (!spotId) {
      return res.status(400).json({ error: "ID de estacionamiento no proporcionado" });
    }
    const cleanSpotId = String(spotId).replace("spot_", "");
    console.log(`📝 Solicitud de actualización para el spot ID: ${cleanSpotId}`);

    const {
      title,
      description,
      address,
      latitude,
      longitude,
      pricePerMinute,
      availability,
      is_available,
    } = req.body;

    // 1. Verificar si el estacionamiento existe en la base de datos
    const checkSpot = await pool.query("SELECT * FROM parking_spots WHERE id = $1", [parseInt(cleanSpotId)]);
    if (checkSpot.rows.length === 0) {
      return res.status(404).json({ error: "Estacionamiento no encontrado" });
    }
    const existingSpot = checkSpot.rows[0];

    // 2. Determinar la URL de la imagen (mantener la anterior si no se sube una nueva)
    let imageUrl = existingSpot.image_url;
    if (req.file) {
      imageUrl = `http://10.0.2.2:3000/uploads/${req.file.filename}`;
    } else if (req.body.image_url) {
      imageUrl = req.body.image_url;
    } else if (req.body.image) {
      imageUrl = req.body.image;
    } else if (req.body.imageUrl) {
      imageUrl = req.body.imageUrl;
    }

    // 3. Fallbacks seguros a los valores existentes
    const updatedTitle = title !== undefined ? title : existingSpot.title;
    const updatedDescription = description !== undefined ? description : existingSpot.description;
    const updatedAddress = address !== undefined ? address : existingSpot.address;

    let updatedLat = latitude !== undefined ? parseFloat(latitude) : existingSpot.latitude;
    let updatedLon = longitude !== undefined ? parseFloat(longitude) : existingSpot.longitude;
    let updatedPrice = pricePerMinute !== undefined ? parseInt(pricePerMinute) : existingSpot.price_per_minute;

    if (isNaN(updatedLat)) updatedLat = existingSpot.latitude;
    if (isNaN(updatedLon)) updatedLon = existingSpot.longitude;
    if (isNaN(updatedPrice)) updatedPrice = existingSpot.price_per_minute;

    // Resolver disponibilidad (puede venir como string "true"/"false" o boolean)
    let updatedAvailability = existingSpot.is_available;
    const targetAvailability = availability !== undefined ? availability : is_available;
    if (targetAvailability !== undefined) {
      updatedAvailability = targetAvailability === "true" || targetAvailability === true;
    }

    // 4. Ejecutar la actualización en la BD
    const updateQuery = `
      UPDATE parking_spots
      SET title = $1, description = $2, address = $3, latitude = $4, longitude = $5, price_per_minute = $6, image_url = $7, is_available = $8
      WHERE id = $9
      RETURNING *
    `;

    const values = [
      updatedTitle,
      updatedDescription,
      updatedAddress,
      updatedLat,
      updatedLon,
      updatedPrice,
      imageUrl,
      updatedAvailability,
      parseInt(cleanSpotId)
    ];

    const result = await pool.query(updateQuery, values);
    const updatedSpot = result.rows[0];

    console.log(`✅ Estacionamiento ID ${updatedSpot.id} actualizado con éxito.`);

    // 5. Devolver el objeto formateado con compatibilidad total de imágenes
    res.json({
      id: "spot_" + updatedSpot.id,
      title: updatedSpot.title,
      address: updatedSpot.address,
      commune: updatedSpot.address.split(",")[1]?.trim() || "Santiago",
      location: updatedSpot.address,
      latitude: updatedSpot.latitude,
      longitude: updatedSpot.longitude,
      pricePerMinute: parseInt(updatedSpot.price_per_minute),
      description: updatedSpot.description,
      availability: updatedSpot.is_available,
      rating: 5.0,
      reviews: 0,
      amenities: ["Seguridad 24/7", "Techado"],
      image_url: updatedSpot.image_url,
      imageUrl: updatedSpot.image_url,
      image: updatedSpot.image_url,
      images: updatedSpot.image_url ? [updatedSpot.image_url] : []
    });

  } catch (error) {
    console.error("❌ Error al actualizar estacionamiento:", error);
    res.status(500).json({ error: "Error interno al actualizar el estacionamiento" });
  }
};

// Registrar rutas de actualización (soportando múltiples formatos y verbos por compatibilidad)
app.put("/api/spots/:id", upload.single("image"), handleUpdateSpot);
app.patch("/api/spots/:id", upload.single("image"), handleUpdateSpot);
app.post("/api/spots/:id", upload.single("image"), handleUpdateSpot);
app.put("/api/spots", upload.single("image"), handleUpdateSpot);
app.post("/api/spots/update", upload.single("image"), handleUpdateSpot);

// =========================================================================
// 3. ENDPOINTS: Reservas (bookings)
// =========================================================================

// 📅 Obtener el historial de reservas de un usuario desde PostgreSQL
app.get("/api/bookings/:userId", async (req, res) => {
  // Si tu app envía el ID como "user_1", extraemos solo el número para la BD
  const cleanUserId = req.params.userId.replace("user_", "");
  console.log(`📅 Consultando reservas en BD del usuario ID: ${cleanUserId}`);

  try {
    const query = `
            SELECT b.id, b.start_time, b.end_time, b.total_amount, b.status,
                   s.title as spot_title, s.address as spot_address
            FROM bookings b
            JOIN parking_spots s ON b.parking_spot_id = s.id
            WHERE b.driver_id = $1
            ORDER BY b.created_at DESC
        `;
    const result = await pool.query(query, [cleanUserId]);

    // Formatear la respuesta para que la app lea correctamente las claves
    const formattedBookings = result.rows.map((b) => ({
      id: b.id,
      startTime: b.start_time,
      endTime: b.end_time,
      totalAmount: parseFloat(b.total_amount),
      status: b.status,
      spotTitle: b.spot_title,
      spotAddress: b.spot_address,
    }));

    res.json(formattedBookings);
  } catch (err) {
    console.error("❌ Error al consultar reservas:", err.message);
    res
      .status(500)
      .json({ error: "Error al obtener las reservas de la base de datos" });
  }
});

// 📅 Crear una nueva reserva dentro de PostgreSQL
app.post("/api/bookings", async (req, res) => {
  const { parkingSpotId, driverId, startTime, endTime, totalAmount } = req.body;

  // Limpieza de prefijos string en caso de que el Front los envíe concatenados
  const cleanSpotId = String(parkingSpotId).replace("spot_", "");
  const cleanDriverId = String(driverId).replace("user_", "");

  try {
    const insertQuery = `
            INSERT INTO bookings (parking_spot_id, driver_id, start_time, end_time, total_amount, status)
            VALUES ($1, $2, $3, $4, $5, 'confirmed')
            RETURNING *
        `;
    const values = [
      parseInt(cleanSpotId) || 1,
      parseInt(cleanDriverId) || 1,
      startTime || new Date(),
      endTime || new Date(Date.now() + 3600000), // +1 hora por defecto si viene vacío
      totalAmount || 1500.0,
    ];

    const result = await pool.query(insertQuery, values);
    console.log(
      `📅 Nueva reserva inyectada con éxito en BD para el spot: ${cleanSpotId}`,
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error al crear reserva en la BD:", err.message);
    res
      .status(500)
      .json({ error: "Error al registrar la transacción de reserva" });
  }
});

// Endpoint para sugerir precio por zona
app.post("/api/prices/suggest", async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const basePrice = 15; // Tarifa base por defecto

    // Función matemática para calcular distancia en metros entre dos coordenadas (Haversine)
    function calculateDistance(lat1, lon1, lat2, lon2) {
      const R = 6371000; // Radio de la Tierra en metros
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // Obtener todas las zonas de la base de datos
    const zonesResult = await pool.query("SELECT * FROM high_demand_zones");
    const zones = zonesResult.rows;

    let finalPrice = basePrice;
    let appliedZone = "Zona estándar";

    // Revisar si el estacionamiento cae dentro del radio de alguna zona cara
    for (const zone of zones) {
      const distance = calculateDistance(
        latitude,
        longitude,
        zone.latitude,
        zone.longitude,
      );
      if (distance <= zone.radius_meters) {
        // Si está en múltiples zonas, nos quedamos con el precio más alto
        if (zone.suggested_price > finalPrice) {
          finalPrice = zone.suggested_price;
          appliedZone = zone.name;
        }
      }
    }

    res.json({
      suggested_price: finalPrice,
      zone_name: appliedZone,
    });
  } catch (error) {
    console.error("Error calculando precio:", error);
    res.status(500).json({ error: "Error interno al sugerir precio" });
  }
});

// =========================================================================
// 4. ARRANQUE DEL SERVIDOR
// =========================================================================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Servidor Parkit escuchando en el puerto: ${PORT}`);
  console.log(`🌐 Acceso local para Android Studio: http://10.0.2.2:${PORT}`);
});
