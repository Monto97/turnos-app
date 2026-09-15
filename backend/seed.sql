-- ============================================================
--  DATOS DE DEMO - Studio Belle (PostgreSQL)
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
SELECT p.id, d.dia, d.inicio::time, d.fin::time
FROM profesionales p
CROSS JOIN (
  VALUES
    (1, '09:00', '18:00'),
    (2, '09:00', '18:00'),
    (3, '09:00', '18:00'),
    (4, '09:00', '18:00'),
    (5, '09:00', '18:00'),
    (6, '09:00', '14:00')
) AS d(dia, inicio, fin);

-- Clientes de demo
INSERT INTO clientes (nombre, telefono, email) VALUES
('Laura Fernández',  '+54 11 5555-0001', 'laura@email.com'),
('Pedro Sánchez',    '+54 11 5555-0002', 'pedro@email.com'),
('Valeria Torres',   '+54 11 5555-0003', 'valeria@email.com'),
('Diego Martínez',   '+54 11 5555-0004', 'diego@email.com'),
('Sofía Herrera',    '+54 11 5555-0005', 'sofia@email.com'),
('Lucas Romero',     '+54 11 5555-0006', 'lucas@email.com'),
('Camila Núñez',     '+54 11 5555-0007', 'camila@email.com');

-- Turnos pasados (historial en la agenda)
INSERT INTO turnos (cliente_id, profesional_id, servicio_id, inicio, fin, estado, sena_requerida, sena_pagada, precio_snapshot, origen)
VALUES
(1, 1, 1, (CURRENT_DATE - 7) + '09:00'::time, (CURRENT_DATE - 7) + '09:45'::time, 'completado', 0, FALSE, 3500, 'online'),
(2, 2, 2, (CURRENT_DATE - 6) + '10:00'::time, (CURRENT_DATE - 6) + '12:00'::time, 'completado', 3000, TRUE,  12000, 'online'),
(3, 3, 3, (CURRENT_DATE - 5) + '11:00'::time, (CURRENT_DATE - 5) + '11:30'::time, 'completado', 0, FALSE, 2500, 'interno'),
(4, 1, 4, (CURRENT_DATE - 4) + '14:00'::time, (CURRENT_DATE - 4) + '14:40'::time, 'completado', 0, FALSE, 2000, 'interno'),
(5, 2, 5, (CURRENT_DATE - 3) + '15:00'::time, (CURRENT_DATE - 3) + '16:00'::time, 'ausente',    1500, TRUE,  5500, 'online'),
(6, 3, 1, (CURRENT_DATE - 2) + '09:00'::time, (CURRENT_DATE - 2) + '09:45'::time, 'cancelado',  0, FALSE, 3500, 'online'),
-- Próximos días
(1, 1, 1, (CURRENT_DATE + 1) + '09:00'::time, (CURRENT_DATE + 1) + '09:45'::time, 'confirmado', 0, FALSE, 3500, 'online'),
(2, 2, 2, (CURRENT_DATE + 1) + '10:00'::time, (CURRENT_DATE + 1) + '12:00'::time, 'pendiente',  3000, FALSE, 12000, 'online'),
(3, 3, 4, (CURRENT_DATE + 2) + '10:00'::time, (CURRENT_DATE + 2) + '10:40'::time, 'confirmado', 0, FALSE, 2000, 'interno'),
(4, 1, 5, (CURRENT_DATE + 2) + '11:00'::time, (CURRENT_DATE + 2) + '12:00'::time, 'pendiente',  1500, FALSE, 5500, 'online'),
(5, 2, 3, (CURRENT_DATE + 3) + '09:00'::time, (CURRENT_DATE + 3) + '09:30'::time, 'confirmado', 0, FALSE, 2500, 'interno'),
(6, 3, 1, (CURRENT_DATE + 3) + '10:00'::time, (CURRENT_DATE + 3) + '10:45'::time, 'confirmado', 0, FALSE, 3500, 'online'),
(7, 1, 2, (CURRENT_DATE + 4) + '09:00'::time, (CURRENT_DATE + 4) + '11:00'::time, 'pendiente',  3000, TRUE,  12000, 'online'),
(1, 2, 4, (CURRENT_DATE + 5) + '14:00'::time, (CURRENT_DATE + 5) + '14:40'::time, 'confirmado', 0, FALSE, 2000, 'interno'),
(2, 3, 5, (CURRENT_DATE + 7) + '10:00'::time, (CURRENT_DATE + 7) + '11:00'::time, 'pendiente',  1500, FALSE, 5500, 'online');
