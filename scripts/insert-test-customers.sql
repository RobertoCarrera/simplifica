-- Script para insertar clientes de prueba en la base de datos
-- Ejecutar este script en Supabase SQL Editor

-- Insertar algunos clientes para Alberto Dominguez (1e816ec8-4a5d-4e43-806a-6c7cf2ec6950)
INSERT INTO customers (
  id,
  nombre,
  apellidos,
  email,
  telefono,
  dni,
  usuario_id,
  created_at,
  updated_at,
  activo
) VALUES 
  (
    gen_random_uuid(),
    'Juan Carlos',
    'García López',
    'juan.garcia@email.com',
    '+34 666 123 456',
    '12345678A',
    '1e816ec8-4a5d-4e43-806a-6c7cf2ec6950',
    now(),
    now(),
    true
  ),
  (
    gen_random_uuid(),
    'María',
    'Rodríguez Martín',
    'maria.rodriguez@email.com',
    '+34 666 789 012',
    '87654321B',
    '1e816ec8-4a5d-4e43-806a-6c7cf2ec6950',
    now(),
    now(),
    true
  ),
  (
    gen_random_uuid(),
    'Carlos',
    'Fernández Ruiz',
    'carlos.fernandez@email.com',
    '+34 666 345 678',
    '11223344C',
    '1e816ec8-4a5d-4e43-806a-6c7cf2ec6950',
    now(),
    now(),
    true
  );

-- Insertar algunos clientes para Eva Marín (2d2bd829-f80f-423e-b944-7bb407c08014)
INSERT INTO customers (
  id,
  nombre,
  apellidos,
  email,
  telefono,
  dni,
  usuario_id,
  created_at,
  updated_at,
  activo
) VALUES 
  (
    gen_random_uuid(),
    'Ana',
    'Sánchez Torres',
    'ana.sanchez@email.com',
    '+34 666 111 222',
    '55667788D',
    '2d2bd829-f80f-423e-b944-7bb407c08014',
    now(),
    now(),
    true
  ),
  (
    gen_random_uuid(),
    'Pedro',
    'Jiménez Castro',
    'pedro.jimenez@email.com',
    '+34 666 333 444',
    '99887766E',
    '2d2bd829-f80f-423e-b944-7bb407c08014',
    now(),
    now(),
    true
  );

-- Insertar algunos clientes para Marina Casado García (4ae3c31e-9f5b-487f-81f7-e51432691058)
INSERT INTO customers (
  id,
  nombre,
  apellidos,
  email,
  telefono,
  dni,
  usuario_id,
  created_at,
  updated_at,
  activo
) VALUES 
  (
    gen_random_uuid(),
    'Luis',
    'Moreno Vega',
    'luis.moreno@email.com',
    '+34 666 555 777',
    '44556677F',
    '4ae3c31e-9f5b-487f-81f7-e51432691058',
    now(),
    now(),
    true
  ),
  (
    gen_random_uuid(),
    'Laura',
    'Díaz Herrera',
    'laura.diaz@email.com',
    '+34 666 888 999',
    '33445566G',
    '4ae3c31e-9f5b-487f-81f7-e51432691058',
    now(),
    now(),
    true
  );

-- Verificar que se insertaron correctamente
SELECT 
  c.nombre,
  c.apellidos,
  c.email,
  c.usuario_id,
  u.name as usuario_nombre
FROM customers c
LEFT JOIN auth.users u ON u.id::text = c.usuario_id
ORDER BY c.created_at DESC;
