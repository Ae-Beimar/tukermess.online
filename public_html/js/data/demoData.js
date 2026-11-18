// Datos de ejemplo SOLO para ver el diseño mientras supabaseConfig.js no está configurado.
// Fotos: Wikimedia Commons (ver assets/img/demo/CREDITOS.txt). Las kermeses y organizadores son ficticios.
// En cuanto pongas tu URL y anon key, la app lee de Supabase y este archivo no se usa.
import { toISODate } from '../utils/format.js';

const today = new Date();
const dow = today.getDay();
const nextSat = new Date(today.getFullYear(), today.getMonth(), today.getDate() + ((6 - dow) % 7));
const plus = (d, n) => toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));

const organizer = { full_name: 'Organizador Demo', organization_name: 'Comunidad Demo' };

export const demoKermeses = [
  {
    id: 'demo-1',
    title: 'Kermés Pro Techo de la Parroquia San Roque',
    description: 'Reunimos fondos para reparar el techo del comedor parroquial que atiende a 80 niños cada día.\n¡Ven con tu familia, habrá juegos y música en vivo!',
    event_date: plus(nextSat, 0), start_time: '10:00:00', end_time: '17:00:00',
    address: 'Calle Ñuflo de Chávez esq. Ayacucho', zone: 'Casco Viejo', latitude: -17.7810, longitude: -63.1790,
    cover_image_url: 'assets/img/demo/majadito.webp', whatsapp: '59170000001', status: 'publicada', organizer,
    menu_items: [
      { id: 'm1', name: 'Majadito', description: 'Con huevo frito, plátano y yuca', price: 25, image_url: 'assets/img/demo/majadito.webp', is_featured: true, sort_order: 1 },
      { id: 'm2', name: 'Sonso de yuca', description: 'En palito, recién asado', price: 8, image_url: 'assets/img/demo/sonso.webp', is_featured: true, sort_order: 2 },
      { id: 'm3', name: 'Cuñapé', description: 'Media docena', price: 10, image_url: 'assets/img/demo/cunape.webp', is_featured: false, sort_order: 3 },
      { id: 'm4', name: 'Mocochinchi', description: 'Vaso grande', price: 5, image_url: 'assets/img/demo/mocochinchi.webp', is_featured: false, sort_order: 4 },
    ],
  },
  {
    id: 'demo-2',
    title: 'Gran Kermés Solidaria por Doña Rosa',
    description: 'Los vecinos del barrio organizamos esta kermés para apoyar el tratamiento médico de Doña Rosa, vecina de toda la vida.',
    event_date: plus(nextSat, 1), start_time: '09:00:00', end_time: '15:00:00',
    address: 'Av. San Martín, 3er anillo', zone: 'Equipetrol', latitude: -17.7665, longitude: -63.1985,
    cover_image_url: 'assets/img/demo/keperi.webp', whatsapp: '59170000002', status: 'publicada', organizer,
    menu_items: [
      { id: 'm5', name: 'Locro carretero', description: 'Con charque y huevo', price: 25, image_url: 'assets/img/demo/locro.webp', is_featured: true, sort_order: 1 },
      { id: 'm6', name: 'Keperí al horno', description: 'Con yuca y ensalada', price: 40, image_url: 'assets/img/demo/keperi.webp', is_featured: true, sort_order: 2 },
      { id: 'm7', name: 'Somó', description: 'Bebida de maíz bien fría', price: 5, image_url: 'assets/img/demo/somo.webp', is_featured: false, sort_order: 3 },
    ],
  },
  {
    id: 'demo-3',
    title: 'Kermés Promoción 2026 – Colegio Santa Ana',
    description: 'Los alumnos de 6.º de secundaria recaudan fondos para su viaje de promoción.',
    event_date: plus(nextSat, 7), start_time: '11:00:00', end_time: '18:00:00',
    address: 'Av. Paurito, Plan 3000', zone: 'Plan 3000', latitude: -17.8130, longitude: -63.1300,
    cover_image_url: 'assets/img/demo/saltenas.webp', whatsapp: '59170000003', status: 'publicada', organizer,
    menu_items: [
      { id: 'm8', name: 'Pique macho', description: 'Para compartir entre dos', price: 35, image_url: 'assets/img/demo/pique-macho.webp', is_featured: true, sort_order: 1 },
      { id: 'm9', name: 'Salteñas', description: 'De pollo o carne', price: 8, image_url: 'assets/img/demo/saltenas.webp', is_featured: true, sort_order: 2 },
      { id: 'm10', name: 'Empanada de arroz', description: 'Unidad', price: 4, image_url: null, is_featured: false, sort_order: 3 },
    ],
  },
];
