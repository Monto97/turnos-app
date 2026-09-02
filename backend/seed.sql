-- ============================================================
--  DATOS DE DEMO - Studio Belle
-- ============================================================
--  Datos de ejemplo para el portfolio. Se carga automáticamente
--  cuando la base está vacía (via scripts/migrate.js).
--  Las cuentas de usuario se crean en el mismo script (requieren bcrypt).
-- ============================================================

-- Profesionales
INSERT INTO profesionales (nombre, email, telefono, color_agenda) VALUES
('María García',  'maria@studiobelle.com',  '+54 11 4444-1111', '#e11d48'),
('Carlos Pérez',  'carlos@studiobelle.com', '+54 11 4444-2222', '#2563eb'),
('Ana López',     'ana@studiobelle.com',    '+54 11 4444-3333', '#16a34a');

-- Servicios
INSERT INTO servicios (nombre, duracion_min, precio, sena_monto) VALUES
('Corte de cabello',     45,  3500.00,    0.00),
('Color y mechas',      120, 12000.00, 3000.00),
('Peinado',              30,  2500.00,    0.00),
('Manicura',             40,  2000.00,    0.00),
('Tratamiento capilar',  60,  5500.00, 1500.00);

-- Todos los profesionales ofrecen todos los servicios
INSERT INTO profesional_servicio (profesional_id, servicio_id)
SELECT p.id, s.id FROM profesionales p CROSS JOIN servicios s;

-- Horarios laborales: Lunes a Viernes 9-18, Sábado 9-14
INSERT INTO horarios_laborales (profesional_id, dia_semana, hora_inicio, hora_fin)
SELECT p.id, d.dia, h.inicio, h.fin
FROM profesionales p
CROSS JOIN (
  SELECT 1 AS dia, '09:00:00' AS inicio, '18:00:00' AS fin UNION ALL
  SELECT 2, '09:00:00', '18:00:00' UNION ALL
  SELECT 3, '09:00:00', '18:00:00' UNION ALL
  SELECT 4, '09:00:00', '18:00:00' UNION ALL
  SELECT 5, '09:00:00', '18:00:00' UNION ALL
  SELECT 6, '09:00:00', '14:00:00'
) d;

-- Clientes de demo
INSERT INTO clientes (nombre, telefono, email) VALUES
('Laura Fernández',  '+54 11 5555-0001', 'laura@email.com'),
('Pedro Sánchez',    '+54 11 5555-0002', 'pedro@email.com'),
('Valeria Torres',   '+54 11 5555-0003', 'valeria@email.com'),
('Diego Martínez',   '+54 11 5555-0004', 'diego@email.com'),
('Sofía Herrera',    '+54 11 5555-0005', 'sofia@email.com'),
('Lucas Romero',     '+54 11 5555-0006', 'lucas@email.com'),
('Camila Núñez',     '+54 11 5555-0007', 'camila@email.com');

-- Turnos pasados (para ver historial en la agenda)
INSERT INTO turnos (cliente_id, profesional_id, servicio_id, inicio, fin, estado, sena_requerida, sena_pagada, precio_snapshot, origen)
VALUES
-- Semana pasada
(1, 1, 1, DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL -7 DAY), '%Y-%m-%d 09:00:00'),
         DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL -7 DAY), '%Y-%m-%d 09:45:00'),
         'completado', 0, FALSE, 3500, 'online'),
(2, 2, 2, DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL -6 DAY), '%Y-%m-%d 10:00:00'),
         DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL -6 DAY), '%Y-%m-%d 12:00:00'),
         'completado', 3000, TRUE, 12000, 'online'),
(3, 3, 3, DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL -5 DAY), '%Y-%m-%d 11:00:00'),
         DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL -5 DAY), '%Y-%m-%d 11:30:00'),
         'completado', 0, FALSE, 2500, 'interno'),
(4, 1, 4, DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL -4 DAY), '%Y-%m-%d 14:00:00'),
         DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL -4 DAY), '%Y-%m-%d 14:40:00'),
         'completado', 0, FALSE, 2000, 'interno'),
(5, 2, 5, DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL -3 DAY), '%Y-%m-%d 15:00:00'),
         DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL -3 DAY), '%Y-%m-%d 16:00:00'),
         'ausente', 1500, TRUE, 5500, 'online'),
(6, 3, 1, DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL -2 DAY), '%Y-%m-%d 09:00:00'),
         DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL -2 DAY), '%Y-%m-%d 09:45:00'),
         'cancelado', 0, FALSE, 3500, 'online'),

-- Esta semana / próximos días
(1, 1, 1, DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), '%Y-%m-%d 09:00:00'),
         DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), '%Y-%m-%d 09:45:00'),
         'confirmado', 0, FALSE, 3500, 'online'),
(2, 2, 2, DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), '%Y-%m-%d 10:00:00'),
         DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), '%Y-%m-%d 12:00:00'),
         'pendiente', 3000, FALSE, 12000, 'online'),
(3, 3, 4, DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY), '%Y-%m-%d 10:00:00'),
         DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY), '%Y-%m-%d 10:40:00'),
         'confirmado', 0, FALSE, 2000, 'interno'),
(4, 1, 5, DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY), '%Y-%m-%d 11:00:00'),
         DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY), '%Y-%m-%d 12:00:00'),
         'pendiente', 1500, FALSE, 5500, 'online'),
(5, 2, 3, DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 3 DAY), '%Y-%m-%d 09:00:00'),
         DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 3 DAY), '%Y-%m-%d 09:30:00'),
         'confirmado', 0, FALSE, 2500, 'interno'),
(6, 3, 1, DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 3 DAY), '%Y-%m-%d 10:00:00'),
         DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 3 DAY), '%Y-%m-%d 10:45:00'),
         'confirmado', 0, FALSE, 3500, 'online'),
(7, 1, 2, DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 4 DAY), '%Y-%m-%d 09:00:00'),
         DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 4 DAY), '%Y-%m-%d 11:00:00'),
         'pendiente', 3000, TRUE, 12000, 'online'),
(1, 2, 4, DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 5 DAY), '%Y-%m-%d 14:00:00'),
         DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 5 DAY), '%Y-%m-%d 14:40:00'),
         'confirmado', 0, FALSE, 2000, 'interno'),
(2, 3, 5, DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '%Y-%m-%d 10:00:00'),
         DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '%Y-%m-%d 11:00:00'),
         'pendiente', 1500, FALSE, 5500, 'online');
