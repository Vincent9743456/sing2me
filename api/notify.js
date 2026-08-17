/**
 * /api/notify — le facteur des groupes (b353) : appelé par le cron Vercel
 * toutes les 15 minutes, envoie les résumés e-mail des fils de groupe.
 * Toute la logique vit dans server/notify.js.
 */
export { default } from '../server/notify.js';
