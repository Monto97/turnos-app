# Frontend - Sistema de Turnos (Angular standalone)

Pantallas de autenticación (login, registro, recuperar/reset contraseña)
y home post-login, con JWT, guards e interceptor.

## Requisitos
- Node 18+
- El backend corriendo en http://localhost:3000

## Puesta en marcha
```
cd frontend
npm install
npm start        # o: npx ng serve
```
Abrí http://localhost:4200

## Pantallas
- `/login`          — inicio de sesión (+ botón Google maquetado)
- `/registro`       — alta con nombre, apellido, email, teléfono, contraseña
- `/recuperar`      — pide email para enviar enlace de recuperación
- `/reset-password` — cambia la contraseña (recibe ?token= del email)
- `/home`           — panel post-login (ruta protegida), verifica sesión contra el backend

## Cómo está armado
- **AuthService** (`core/auth.service.ts`): estado con signals, guarda token en localStorage.
- **authGuard / guestGuard** (`core/auth.guard.ts`): protegen rutas según sesión.
- **authInterceptor**: agrega `Authorization: Bearer <token>` a cada request.
- Rutas con **lazy loading** (cada pantalla es un chunk aparte).

## Diseño
Sistema de tokens en `src/styles.css` (paleta arcilla/oliva sobre hueso,
tipografía Fraunces + Inter). Responsive; en móvil se oculta el panel de marca.

## Nota sobre Google OAuth
El botón está maquetado pero no conectado. Para activarlo hace falta el
Client ID de Google Cloud (siguiente paso).
