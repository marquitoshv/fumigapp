1) En la carpeta, corré un servidor local:

   python -m http.server 8000

2) Abrí:
   http://localhost:8000

3) Para probar offline:
   - Chrome DevTools > Application > Service Workers (ver que esté activo)
   - DevTools > Network > Offline
   - Recargar: debe abrir igual

4) En teléfono:
   - Subilo a Netlify/Vercel/GitHub Pages (HTTPS)
   - Abrí el link en el celu
   - Instalar / Agregar a pantalla de inicio
   - Cortá internet y abrila desde el ícono: debe funcionar offline
