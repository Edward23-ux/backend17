require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Servir archivos estáticos del build del frontend (si existe)
app.use(express.static(path.join(__dirname, "../public")));

// Configuración de la conexión a MySQL
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "tienda",
  port: parseInt(process.env.DB_PORT || "3306", 10),
};

let pool = null;
let dbConnected = false;

// Datos de simulación (Fallback / Mock) en caso de que no haya BD conectada
let mockClientes = [
  { id_cliente: 1, nombre: "Juan Pérez", correo: "juan@example.com", telefono: "987654321" },
  { id_cliente: 2, nombre: "María Gomez", correo: "maria@example.com", telefono: "912345678" }
];

let mockProductos = [
  { id_producto: 1, nombre: "Laptop HP Pavillion", precio: 850.00, stock: 15 },
  { id_producto: 2, nombre: "Mouse Inalámbrico", precio: 25.50, stock: 50 },
  { id_producto: 3, nombre: "Teclado Mecánico RGB", precio: 75.00, stock: 20 },
  { id_producto: 4, nombre: "Monitor 24' Full HD", precio: 180.00, stock: 8 }
];

let mockVentas = [
  { id_venta: 1, id_cliente: 1, id_producto: 2, cantidad: 2, fecha: "2026-07-16" }
];

let nextClienteId = 3;
let nextProductoId = 5;
let nextVentaId = 2;

// Intentar conectar a la Base de Datos
async function testDbConnection() {
  try {
    pool = mysql.createPool({
      ...dbConfig,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
    // Probar conexión
    const connection = await pool.getConnection();
    console.log("✅ Conexión exitosa a MySQL (Base de datos: " + dbConfig.database + ")");
    connection.release();
    dbConnected = true;
  } catch (error) {
    console.error("⚠️ No se pudo conectar a MySQL. Iniciando en modo DEMOSTRACIÓN con datos en memoria.");
    console.error("Detalle del error:", error.message);
    dbConnected = false;
  }
}

// Endpoint para obtener el estado de conexión
app.get("/api/status", (req, res) => {
  res.json({
    connected: dbConnected,
    mode: dbConnected ? "MySQL Database" : "Demo (In-Memory)",
    config: {
      host: dbConfig.host,
      database: dbConfig.database,
      user: dbConfig.user
    }
  });
});

// --- API CLIENTES ---
app.get("/api/clientes", async (req, res) => {
  if (dbConnected) {
    try {
      const [rows] = await pool.query("SELECT * FROM clientes ORDER BY id_cliente DESC");
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else {
    res.json([...mockClientes].reverse());
  }
});

app.post("/api/clientes", async (req, res) => {
  const { nombre, correo, telefono } = req.body;
  if (!nombre) {
    return res.status(400).json({ error: "El nombre es obligatorio" });
  }

  if (dbConnected) {
    try {
      const [result] = await pool.query(
        "INSERT INTO clientes (nombre, correo, telefono) VALUES (?, ?, ?)",
        [nombre, correo || null, telefono || null]
      );
      res.status(201).json({
        id_cliente: result.insertId,
        nombre,
        correo,
        telefono
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(400).json({ error: "El correo ya está registrado" });
      }
      res.status(500).json({ error: error.message });
    }
  } else {
    // Comprobar correo único en memoria
    if (correo && mockClientes.some(c => c.correo === correo)) {
      return res.status(400).json({ error: "El correo ya está registrado" });
    }
    const nuevoCliente = {
      id_cliente: nextClienteId++,
      nombre,
      correo: correo || null,
      telefono: telefono || null
    };
    mockClientes.push(nuevoCliente);
    res.status(201).json(nuevoCliente);
  }
});

// --- API PRODUCTOS ---
app.get("/api/productos", async (req, res) => {
  if (dbConnected) {
    try {
      const [rows] = await pool.query("SELECT * FROM productos ORDER BY id_producto DESC");
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else {
    res.json([...mockProductos].reverse());
  }
});

app.post("/api/productos", async (req, res) => {
  const { nombre, precio, stock } = req.body;
  if (!nombre || precio === undefined || stock === undefined) {
    return res.status(400).json({ error: "Nombre, precio y stock son obligatorios" });
  }

  if (dbConnected) {
    try {
      const [result] = await pool.query(
        "INSERT INTO productos (nombre, precio, stock) VALUES (?, ?, ?)",
        [nombre, precio, stock]
      );
      res.status(201).json({
        id_producto: result.insertId,
        nombre,
        precio,
        stock
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else {
    const nuevoProducto = {
      id_producto: nextProductoId++,
      nombre,
      precio: parseFloat(precio),
      stock: parseInt(stock, 10)
    };
    mockProductos.push(nuevoProducto);
    res.status(201).json(nuevoProducto);
  }
});

// --- API VENTAS ---
app.get("/api/ventas", async (req, res) => {
  if (dbConnected) {
    try {
      const query = `
        SELECT 
          v.id_venta,
          v.cantidad,
          v.fecha,
          c.id_cliente,
          c.nombre AS cliente_nombre,
          p.id_producto,
          p.nombre AS producto_nombre,
          p.precio AS producto_precio,
          (v.cantidad * p.precio) AS total
        FROM ventas v
        JOIN clientes c ON v.id_cliente = c.id_cliente
        JOIN productos p ON v.id_producto = p.id_producto
        ORDER BY v.id_venta DESC
      `;
      const [rows] = await pool.query(query);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else {
    // Resolver relaciones en memoria
    const ventasDetalladas = mockVentas.map(v => {
      const cliente = mockClientes.find(c => c.id_cliente === v.id_cliente);
      const producto = mockProductos.find(p => p.id_producto === v.id_producto);
      const total = producto ? v.cantidad * producto.precio : 0;
      return {
        id_venta: v.id_venta,
        cantidad: v.cantidad,
        fecha: v.fecha,
        id_cliente: v.id_cliente,
        cliente_nombre: cliente ? cliente.nombre : "Cliente desconocido",
        id_producto: v.id_producto,
        producto_nombre: producto ? producto.nombre : "Producto desconocido",
        producto_precio: producto ? producto.precio : 0,
        total
      };
    });
    res.json([...ventasDetalladas].reverse());
  }
});

app.post("/api/ventas", async (req, res) => {
  const { id_cliente, id_producto, cantidad, fecha } = req.body;

  if (!id_cliente || !id_producto || !cantidad || !fecha) {
    return res.status(400).json({ error: "Cliente, producto, cantidad y fecha son obligatorios" });
  }

  const cantidadVenta = parseInt(cantidad, 10);
  if (cantidadVenta <= 0) {
    return res.status(400).json({ error: "La cantidad debe ser mayor que 0" });
  }

  if (dbConnected) {
    // Usar transacción para garantizar atomicidad al descontar stock y registrar la venta
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Verificar stock del producto
      const [prodRows] = await connection.query(
        "SELECT stock, nombre, precio FROM productos WHERE id_producto = ? FOR UPDATE",
        [id_producto]
      );

      if (prodRows.length === 0) {
        throw new Error("El producto seleccionado no existe");
      }

      const producto = prodRows[0];
      if (producto.stock < cantidadVenta) {
        throw new Error(`Stock insuficiente. Solo quedan ${producto.stock} unidades de ${producto.nombre}`);
      }

      // 2. Descontar stock
      const nuevoStock = producto.stock - cantidadVenta;
      await connection.query(
        "UPDATE productos SET stock = ? WHERE id_producto = ?",
        [nuevoStock, id_producto]
      );

      // 3. Registrar venta
      const [ventasResult] = await connection.query(
        "INSERT INTO ventas (id_cliente, id_producto, cantidad, fecha) VALUES (?, ?, ?, ?)",
        [id_cliente, id_producto, cantidadVenta, fecha]
      );

      await connection.commit();

      res.status(201).json({
        id_venta: ventasResult.insertId,
        id_cliente,
        id_producto,
        cantidad: cantidadVenta,
        fecha
      });
    } catch (error) {
      await connection.rollback();
      res.status(400).json({ error: error.message });
    } finally {
      connection.release();
    }
  } else {
    // Lógica en memoria
    const productoIndex = mockProductos.findIndex(p => p.id_producto === parseInt(id_producto, 10));
    if (productoIndex === -1) {
      return res.status(400).json({ error: "El producto seleccionado no existe" });
    }

    const clienteExists = mockClientes.some(c => c.id_cliente === parseInt(id_cliente, 10));
    if (!clienteExists) {
      return res.status(400).json({ error: "El cliente seleccionado no existe" });
    }

    const producto = mockProductos[productoIndex];
    if (producto.stock < cantidadVenta) {
      return res.status(400).json({
        error: `Stock insuficiente. Solo quedan ${producto.stock} unidades de ${producto.nombre}`
      });
    }

    // Descontar stock
    mockProductos[productoIndex].stock -= cantidadVenta;

    // Registrar venta
    const nuevaVenta = {
      id_venta: nextVentaId++,
      id_cliente: parseInt(id_cliente, 10),
      id_producto: parseInt(id_producto, 10),
      cantidad: cantidadVenta,
      fecha
    };
    mockVentas.push(nuevaVenta);

    res.status(201).json(nuevaVenta);
  }
});

// Iniciar servidor tras probar la BD
testDbConnection().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor backend iniciado en http://localhost:${PORT}`);
  });
});