/**
 * `qrcode` n'expose pas de types. Sans cette déclaration, le typecheck
 * STRICT (npm run typecheck) échouait sur trois fichiers — et on prenait
 * l'habitude de lire ses erreurs de travers, jusqu'à en manquer une vraie
 * (b215 : la page du spectateur plantait). Un gardien qui crie pour rien
 * finit par ne plus être écouté.
 */
declare module 'qrcode';
