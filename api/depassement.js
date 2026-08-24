/**
 * /api/depassement — l'horloge du plan gratuit (b422) : appelé par le cron
 * Vercel une fois par jour, pose/lève les délais de dépassement et envoie
 * les e-mails de prévenance. Toute la logique vit dans
 * server/depassement.js.
 */
export { default } from '../server/depassement.js';
