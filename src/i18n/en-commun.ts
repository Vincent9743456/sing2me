/** Traductions anglaises — domaine commun (clé = chaîne française exacte). */
export const EN_COMMUN: Record<string, string> = {
  // Barre d'onglets
  Morceaux: 'Songs',
  Setlists: 'Setlists',
  Concerts: 'Gigs',
  Groupes: 'Bands',
  Artiste: 'Artist',
  // Boutons et gestes communs
  Annuler: 'Cancel',
  Valider: 'Save',
  Confirmer: 'Confirm',
  Retour: 'Back',
  'Modifications en attente': 'Unsaved changes',
  'Créer la setlist': 'Create setlist',
  '🔕 Pense à « Ne pas déranger » : aucun appel pendant le concert. L’écran, lui, restera allumé tout seul.':
    '🔕 Remember “Do Not Disturb”: no calls during the show. The screen itself will stay awake on its own.',
  // Réglages
  Réglages: 'Settings',
  'Langue de l’application': 'App language',
  'Thème de l’application': 'App theme',
  '🌙 Sombre (scène)': '🌙 Dark (stage)',
  '☀️ Clair (plein jour)': '☀️ Light (daylight)',
  'Enregistrer tes modifications ?': 'Save your changes?',
  '💾 Enregistrer et sortir': '💾 Save and leave',
  'Sortir sans enregistrer': 'Leave without saving',
  'Tes partitions, paroles, notes et messages ne sont jamais traduits — seule l’interface change de langue.':
    'Your charts, lyrics, notes and messages are never translated — only the interface changes language.',
  Exporter: 'Export',
  '📄 Exporter la bibliothèque en PDF': '📄 Export the library as PDF',
  // Sauvegarde et restauration : le filet qui ne dépend d'aucun serveur.
  '💾 Enregistrer une sauvegarde': '💾 Save a backup',
  // Rappel discret : on parle de GARDER, jamais de perdre.
  '💾 Garde une copie de ta bibliothèque': '💾 Keep a copy of your library',
  '💾 Ta copie a un peu vieilli': '💾 Your copy has aged a little',
  '{n} morceaux. Un fichier que tu gardes chez toi, sur ton téléphone — deux secondes.':
    '{n} songs. A file you keep, on your own phone — two seconds.',
  'La dernière date d’il y a {mois} mois, et tu as ajouté {n} morceaux depuis.':
    'The last one is {mois} months old, and you have added {n} songs since.',
  'Enregistrer une sauvegarde': 'Save a backup',
  'Mettre à jour': 'Update it',
  'Plus tard': 'Later',
  'Un fichier que tu gardes chez toi — il se relit même sans nous':
    'A file you keep — it reads back even without us',
  '↩︎ Restaurer une sauvegarde': '↩︎ Restore a backup',
  'Ajoute ce qui manque, n’écrase jamais ce qui est plus récent':
    'Adds what is missing, never overwrites anything newer',
  'Ta bibliothèque vit sur ce téléphone ; la copie en ligne sert à la retrouver sur un autre appareil. Une sauvegarde te met à l’abri des deux à la fois.':
    'Your library lives on this phone; the online copy is there to find it again on another device. A backup covers you against losing both.',
  'Sauvegarde enregistrée — {n} morceaux.': 'Backup saved — {n} songs.',
  'La sauvegarde n’a pas pu être écrite.': 'The backup could not be written.',
  '{n} morceaux retrouvés.': '{n} songs recovered.',
  '1 morceau retrouvé.': '1 song recovered.',
  'Rien à ajouter — tout y était déjà.': 'Nothing to add — it was all there.',
  'Ce fichier n’est pas lisible — il a peut-être été tronqué.':
    'This file cannot be read — it may have been truncated.',
  'Ce fichier ne contient pas de sauvegarde.':
    'This file does not contain a backup.',
  'Ce fichier ne vient pas de mojosong.': 'This file does not come from mojosong.',
  'Cette sauvegarde est incomplète — ses morceaux sont illisibles.':
    'This backup is incomplete — its songs cannot be read.',
  'Sauvegarde en ligne incohérente — ta bibliothèque locale a été conservée.':
    'Inconsistent online backup — your local library was kept.',
  '{n} morceau': '{n} song',
  '{n} morceaux': '{n} songs',
  ' — carnet imprimable, « Enregistrer en PDF »':
    ' — printable songbook, “Save as PDF”',
  Réinitialiser: 'Reset',
  'Choisis ce que tu veux effacer sur ce compte. C’est définitif — la suppression vaut aussi sur tes autres appareils.':
    'Choose what to erase on this account. This is permanent — the deletion also applies to your other devices.',
  'Bibliothèque et propositions. Les morceaux des répertoires de groupe reviendront en propositions 📥.':
    'Library, ideas and proposals. Songs from band repertoires will come back as proposals 📥.',
  'Toutes les setlists (solo et groupes), avec leur sono & scène.':
    'All setlists (solo and bands), with their sound & stage setup.',
  'Dates passées et à venir.': 'Past and upcoming dates.',
  'Concerts et lives': 'Gigs and lives',
  'Dates passées et à venir, et l’historique de tes lives.':
    'Past and upcoming dates, and the history of your live sessions.',
  'Tu quittes tous tes groupes sur CE compte — les groupes continuent d’exister pour les autres membres.':
    'You leave all your bands on THIS account — the bands keep existing for the other members.',
  'Profil artiste': 'Artist profile',
  'Nom, photo, bio, liens, pourboires, matériel, écran public.':
    'Name, photo, bio, links, tips, gear, public screen.',
  'Effacer {liste} ?': 'Erase {liste}?',
  'C’est définitif, il n’y a pas de retour en arrière — et la suppression se propagera à tes autres appareils.':
    'This is permanent, there is no going back — and the deletion will propagate to your other devices.',
  'Effacer définitivement': 'Erase permanently',
  'Réinitialisation faite ✓': 'Reset done ✓',
  // CGU : volontairement NON traduites (décision Vincent) — seul cet
  // avertissement l'est, pour qu'un lecteur anglophone comprenne.
  "Conditions d'utilisation": 'Terms of use',
  'Ces conditions ne sont disponibles qu’en français pour le moment — la version française fait foi.':
    'These terms are currently available in French only — the French version is the binding one.',
  // Tableau de bord fondateur (b160)
  "Il faut être connecté.":
    "You need to be signed in.",
  "Tableau de bord indisponible — nécessite la version en ligne.":
    "Dashboard unavailable — requires the online version.",
  "Impossible de charger les chiffres.":
    "Couldn't load the figures.",
  "Rechargement noté ✓":
    "Top-up recorded ✓",
  "Tableau de bord":
    "Dashboard",
  "Réessayer":
    "Try again",
  "Chargement des chiffres…":
    "Loading the figures…",
  "Comptes créés":
    "Accounts created",
  "Actifs (30 j)":
    "Active (30 d)",
  "Connectés (7 j)":
    "Signed in (7 d)",
  "Abonnements : {free} gratuits · {musicien} musicien · {scene} scène · {admin} fondateurs":
    "Plans: {free} free · {musicien} musician · {scene} stage · {admin} founders",
  // b485 — vue par utilisateur et lives en cours (demande de Marco)
  "En live maintenant": "Live right now",
  "depuis {heure}": "since {heure}",
  "{n} spectateur": "{n} viewer",
  "Utilisateurs": "Users",
  "Morceaux et synchro par compte indisponibles — exécute supabase/admin.sql dans le SQL Editor (fonction admin_user_songs).":
    "Per-account songs and sync unavailable — run supabase/admin.sql in the SQL Editor (admin_user_songs function).",
  "connexion {q}": "signed in {q}",
  "synchro {q}": "sync {q}",
  "morceaux : —": "songs: —",
  "{n} lives": "{n} lives",
  "{n} live": "{n} live",
  "dernier {q}": "last {q}",
  "pic {n}": "peak {n}",
  "🔴 salle pleine": "🔴 room full",
  "Aucun compte pour l’instant.": "No account yet.",
  "gratuit": "free",
  "Plan…": "Plan…",
  "Changer le plan de ce compte": "Change this account's plan",
  "Plan de {email}": "Plan for {email}",
  "Plan changé ✓": "Plan changed ✓",
  "Le plan n'a pas pu être changé.": "The plan could not be changed.",
  "musicien": "musician",
  "scène": "stage",
  "fondateur": "founder",
  "Usage":
    "Usage",
  "Lives lancés":
    "Lives started",
  "Partitions (uniques)":
    "Charts (unique)",
  "{total} partitions en comptant les copies des répertoires de groupe.":
    "{total} charts counting band-repertoire copies.",
  "Compteur de partitions indisponible — exécute supabase/admin.sql dans le SQL Editor (fonction admin_song_stats).":
    "Chart counter unavailable — run supabase/admin.sql in the SQL Editor (admin_song_stats function).",
  "Coût des IA (30 derniers jours)":
    "AI cost (last 30 days)",
  "Total":
    "Total",
  "Appels":
    "Calls",
  "Aucun appel IA sur la période — rien à facturer.":
    "No AI calls in this period — nothing billed.",
  "Crédit restant (estimé)":
    "Remaining credit (estimated)",
  "Ni Anthropic ni OpenAI ne publient le solde restant. Il est reconstitué ici : ce que tu as rechargé, moins ce que l’app a réellement consommé.":
    "Neither Anthropic nor OpenAI publish the remaining balance. It is reconstructed here: what you topped up, minus what the app actually consumed.",
  "à recharger":
    "top up soon",
  "Rechargé {paid} · consommé {used}":
    "Topped up {paid} · used {used}",
  "+ Recharge":
    "+ Top up",
  "Chiffre d’affaires":
    "Revenue",
  "En attente du modèle économique (Licence Scène). Rien n’est affiché tant que les montants ne sont pas arrêtés.":
    "Waiting on the business model (Stage Licence). Nothing is shown until the amounts are settled.",
  "Chiffres au {heure} — actualisés chaque minute.":
    "Figures as of {heure} — refreshed every minute.",
  "Recharge Anthropic":
    "Anthropic top-up",
  "Recharge OpenAI":
    "OpenAI top-up",
  "Montant en dollars, tel que tu viens de le payer.":
    "Amount in dollars, as you just paid it.",
  "Noter le rechargement":
    "Record the top-up",
  "Le rechargement n'a pas pu être noté.":
    "The top-up couldn't be recorded.",
  "Pilotage":
    "Operations",
  "📊 Tableau de bord":
    "📊 Dashboard",
  "Comptes, usage, coût des IA, crédit restant":
    "Accounts, usage, AI cost, remaining credit",
  'Réponse inattendue du serveur — chiffres indisponibles.':
    'Unexpected server response — figures unavailable.',
  'La mesure des coûts n’est pas active.': 'Cost measurement is not active.',
  'Les tables de mesure sont absentes : exécute supabase/admin.sql dans le SQL Editor de Supabase. Tant qu’elles manquent, la dépense reste à zéro et les rechargements ne peuvent pas être notés.':
    'The measurement tables are missing: run supabase/admin.sql in the Supabase SQL Editor. Until they exist, spending stays at zero and top-ups cannot be recorded.',
  'La mesure vient de démarrer : seuls les appels IA passés à partir de maintenant sont comptés. Ce que tu as consommé avant n’apparaît que dans les consoles Anthropic et OpenAI.':
    'Measurement has just started: only AI calls made from now on are counted. What you used before only appears in the Anthropic and OpenAI consoles.',
  'À ce rythme : environ {mois} par mois pour 100 appels.':
    'At this rate: about {mois} per month for 100 calls.',
  'Montant en euros, tel que tu viens de le payer.':
    'Amount in euros, as you just paid it.',
};
