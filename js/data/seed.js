/* ============================================================================
   js/data/seed.js — Datos de ejemplo ("cons" como base de datos)
   ----------------------------------------------------------------------------
   `dbJSON` es la base de datos semilla: categorías, productos y un plano de
   mesas de muestra. Al primer arranque se copia a `window.storage`; a partir
   de ahí manda lo guardado. Para producción, estas tablas vivirán en el BaaS.
   ========================================================================== */

// --- BASE DE DATOS JSON INICIAL ---
const dbJSON = {
  "categories": [
    { "id": "cat-all", "name": "Todos", "icon": "bi-grid-fill" },
    { "id": "cat-bebidas", "name": "Bebidas", "icon": "bi-cup-straw" },
    { "id": "cat-entradas", "name": "Entradas", "icon": "bi-egg-fried" },
    { "id": "cat-fuertes", "name": "Platos Fuertes", "icon": "bi-funnel-fill" },
    { "id": "cat-postres", "name": "Postres", "icon": "bi-cake2-fill" }
  ],
  "products": [
    { "id": "p-101", "categoryId": "cat-bebidas", "name": "Cerveza IPA 500ml", "price": 15000, "code": "BEB-01", "stock": 48 },
    { "id": "p-102", "categoryId": "cat-bebidas", "name": "Cocktail Mojito", "price": 22000, "code": "BEB-02", "stock": 30 },
    { "id": "p-103", "categoryId": "cat-bebidas", "name": "Gaseosa 350ml", "price": 6000, "code": "BEB-03", "stock": 60 },
    { "id": "p-104", "categoryId": "cat-bebidas", "name": "Jugo Natural", "price": 9000, "code": "BEB-04", "stock": 40 },
    { "id": "p-201", "categoryId": "cat-entradas", "name": "Nachos con Queso & Guacamole", "price": 25000, "code": "ENT-01", "stock": 25 },
    { "id": "p-202", "categoryId": "cat-entradas", "name": "Papas Rústicas BBQ", "price": 18000, "code": "ENT-02", "stock": 35 },
    { "id": "p-203", "categoryId": "cat-entradas", "name": "Alitas Cruncy (6 und)", "price": 32000, "code": "ENT-03", "stock": 20 },
    { "id": "p-301", "categoryId": "cat-fuertes", "name": "Burger Doble Carne", "price": 38000, "code": "PF-01", "stock": 18 },
    { "id": "p-302", "categoryId": "cat-fuertes", "name": "Pizza Artesanal 4 Quesos", "price": 45000, "code": "PF-02", "stock": 15 },
    { "id": "p-303", "categoryId": "cat-fuertes", "name": "Costillas Ahumadas BBQ", "price": 62000, "code": "PF-03", "stock": 12 },
    { "id": "p-401", "categoryId": "cat-postres", "name": "Volcán de Chocolate", "price": 18000, "code": "POS-01", "stock": 22 },
    { "id": "p-402", "categoryId": "cat-postres", "name": "Cheesecake de Frutos Rojos", "price": 20000, "code": "POS-02", "stock": 20 }
  ],
  "initialMesas": [
    { "id": "mesa_bar_01", "nombre": "Bar Principal", "colorHex": "#6f42c1", "w": 6, "h": 2, "x": 0, "y": 0, "piso": 1,
      "cuentas": [
        { "idCuenta": 101, "nombreCuenta": "Cuenta #1", "productos": [
          { "productId": "p-101", "nombre": "Cerveza IPA 500ml", "cant": 2, "precio": 15000 },
          { "productId": "p-201", "nombre": "Nachos con Queso & Guacamole", "cant": 1, "precio": 25000 }
        ]},
        { "idCuenta": 102, "nombreCuenta": "Cuenta #2", "productos": [
          { "productId": "p-102", "nombre": "Cocktail Mojito", "cant": 3, "precio": 22000 }
        ]}
      ]
    },
    { "id": "mesa_01", "nombre": "Mesa 1", "colorHex": "#198754", "w": 2, "h": 2, "x": 6, "y": 0, "piso": 1,
      "cuentas": [
        { "idCuenta": 103, "nombreCuenta": "Cuenta #1", "productos": [
          { "productId": "p-301", "nombre": "Burger Doble Carne", "cant": 1, "precio": 38000 },
          { "productId": "p-103", "nombre": "Gaseosa 350ml", "cant": 1, "precio": 6000 }
        ]}
      ]
    },
    { "id": "mesa_02", "nombre": "Mesa 2", "colorHex": "#198754", "w": 2, "h": 2, "x": 8, "y": 0, "piso": 1, "cuentas": [] },
    { "id": "mesa_03", "nombre": "Mesa 3", "colorHex": "#198754", "w": 2, "h": 2, "x": 10, "y": 0, "piso": 1, "cuentas": [] },
    { "id": "mesa_04", "nombre": "Mesa 4", "colorHex": "#0d6efd", "w": 2, "h": 2, "x": 12, "y": 0, "piso": 1, "cuentas": [] },
    { "id": "mesa_grande_01", "nombre": "Mesa Grande 1", "colorHex": "#fd7e14", "w": 4, "h": 2, "x": 14, "y": 0, "piso": 1,
      "cuentas": [
        { "idCuenta": 105, "nombreCuenta": "Cuenta #1", "productos": [
          { "productId": "p-302", "nombre": "Pizza Artesanal 4 Quesos", "cant": 1, "precio": 45000 },
          { "productId": "p-104", "nombre": "Jugo Natural", "cant": 2, "precio": 9000 }
        ]}
      ]
    },
    { "id": "mesa_05", "nombre": "Mesa 5", "colorHex": "#198754", "w": 2, "h": 2, "x": 0, "y": 2, "piso": 1, "cuentas": [] },
    { "id": "mesa_06", "nombre": "Mesa 6", "colorHex": "#198754", "w": 2, "h": 2, "x": 2, "y": 2, "piso": 1, "cuentas": [] },
    { "id": "mesa_07", "nombre": "Mesa 7", "colorHex": "#198754", "w": 2, "h": 2, "x": 4, "y": 2, "piso": 1,
      "cuentas": [
        { "idCuenta": 106, "nombreCuenta": "Cuenta #1", "productos": [
          { "productId": "p-203", "nombre": "Alitas Cruncy (6 und)", "cant": 1, "precio": 32000 },
          { "productId": "p-101", "nombre": "Cerveza IPA 500ml", "cant": 2, "precio": 15000 }
        ]}
      ]
    },
    { "id": "mesa_08", "nombre": "Mesa 8", "colorHex": "#0d6efd", "w": 2, "h": 2, "x": 6, "y": 2, "piso": 1, "cuentas": [] },
    { "id": "mesa_grande_02", "nombre": "Mesa Grande 2", "colorHex": "#fd7e14", "w": 4, "h": 2, "x": 8, "y": 2, "piso": 1, "cuentas": [] },
    { "id": "mesa_09", "nombre": "Mesa 9", "colorHex": "#d63384", "w": 2, "h": 2, "x": 12, "y": 2, "piso": 1, "cuentas": [] },
    { "id": "mesa_10", "nombre": "Mesa 10", "colorHex": "#d63384", "w": 2, "h": 2, "x": 14, "y": 2, "piso": 1, "cuentas": [] },
    { "id": "mesa_11", "nombre": "Mesa 11", "colorHex": "#20c997", "w": 2, "h": 2, "x": 16, "y": 2, "piso": 1, "cuentas": [] },
    { "id": "zona_vip_salon", "nombre": "Zona VIP Salón", "colorHex": "#fd7e14", "w": 8, "h": 4, "x": 0, "y": 4, "piso": 1,
      "cuentas": [
        { "idCuenta": 107, "nombreCuenta": "Cuenta Cumpleaños", "productos": [
          { "productId": "p-303", "nombre": "Costillas Ahumadas BBQ", "cant": 3, "precio": 62000 },
          { "productId": "p-401", "nombre": "Volcán de Chocolate", "cant": 3, "precio": 18000 },
          { "productId": "p-102", "nombre": "Cocktail Mojito", "cant": 4, "precio": 22000 }
        ]}
      ]
    },
    { "id": "mesa_vip_01", "nombre": "Zona VIP Terraza", "colorHex": "#fd7e14", "w": 8, "h": 4, "x": 0, "y": 0, "piso": 2,
      "cuentas": [
        { "idCuenta": 104, "nombreCuenta": "Cuenta Reserva VIP", "productos": [
          { "productId": "p-303", "nombre": "Costillas Ahumadas BBQ", "cant": 2, "precio": 62000 },
          { "productId": "p-402", "nombre": "Cheesecake de Frutos Rojos", "cant": 2, "precio": 20000 }
        ]}
      ]
    },
    { "id": "mesa_12", "nombre": "Mesa 12", "colorHex": "#0d6efd", "w": 2, "h": 2, "x": 8, "y": 0, "piso": 2, "cuentas": [] },
    { "id": "mesa_13", "nombre": "Mesa 13", "colorHex": "#0d6efd", "w": 2, "h": 2, "x": 10, "y": 0, "piso": 2, "cuentas": [] },
    { "id": "mesa_14", "nombre": "Mesa 14", "colorHex": "#0dcaf0", "w": 2, "h": 2, "x": 12, "y": 0, "piso": 2, "cuentas": [] },
    { "id": "mesa_15", "nombre": "Mesa 15", "colorHex": "#0dcaf0", "w": 2, "h": 2, "x": 14, "y": 0, "piso": 2, "cuentas": [] },
    { "id": "bar_terraza", "nombre": "Bar Terraza", "colorHex": "#6f42c1", "w": 6, "h": 2, "x": 0, "y": 4, "piso": 2,
      "cuentas": [
        { "idCuenta": 108, "nombreCuenta": "Cuenta #1", "productos": [
          { "productId": "p-102", "nombre": "Cocktail Mojito", "cant": 2, "precio": 22000 }
        ]}
      ]
    },
    { "id": "mesa_16", "nombre": "Mesa 16", "colorHex": "#198754", "w": 2, "h": 2, "x": 6, "y": 4, "piso": 2, "cuentas": [] },
    { "id": "mesa_17", "nombre": "Mesa 17", "colorHex": "#198754", "w": 2, "h": 2, "x": 8, "y": 4, "piso": 2, "cuentas": [] },
    { "id": "mesa_18", "nombre": "Mesa 18", "colorHex": "#d63384", "w": 2, "h": 2, "x": 10, "y": 4, "piso": 2, "cuentas": [] },
    { "id": "mesa_19", "nombre": "Mesa 19", "colorHex": "#d63384", "w": 2, "h": 2, "x": 12, "y": 4, "piso": 2, "cuentas": [] }
  ]
};
