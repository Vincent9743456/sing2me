# DodoSongs — Règles permanentes du projet

## Design & interface (obligatoire)

1. **Lire `DESIGN_SYSTEM.md` avant toute modification d'interface.**
2. Aucune nouvelle couleur hors design tokens (`:root` de theme.css) —
   si un token manque, l'ajouter au design system d'abord.
3. Aucune nouvelle valeur arbitraire d'espacement — utiliser `--sp-*`.
4. Réutiliser les composants existants (`COMPONENT_INVENTORY.md`) avant
   d'en créer ; un composant par fonction.
5. Ne pas multiplier les cartes : la hiérarchie passe par les titres,
   l'espacement et les séparations discrètes.
6. Préserver la lisibilité des paroles et accords : aucun effet ne doit
   coûter du contraste ou de la place au contenu musical.
7. Le mode scène est une interface spécifique : pas de navigation
   générale, cibles ≥ 48px, sortie protégée, priorité lire → naviguer →
   défiler → réagir.
8. Après chaque changement d'interface : contrôler responsive (360px,
   tablette, sidebar ≥ 900px) et accessibilité
   (`DESIGN_QA_CHECKLIST.md`, `ACCESSIBILITY_CHECKLIST.md`).
9. Aucune régression fonctionnelle pour une amélioration esthétique —
   en cas de doute, on n'expédie pas le lot.
10. Pas de `alert()/confirm()/prompt()` natifs : utiliser
    ConfirmSheet/PromptSheet/Toast (composants Feedback).
11. **Toute bannière a une sortie** (b212, étendu b218) : un message qui
    réclame une action doit pouvoir être écarté d'un geste, et ce choix se
    garde (préférence locale, unie à la synchro). Marco est resté avec une
    bannière « à réinviter » impossible à fermer ; Vincent avec un
    « 🔎 À vérifier » qui survivait au remplacement de la partition. Une
    mention de ce genre se lève donc AUTOMATIQUEMENT quand son motif
    disparaît, et À LA MAIN dans tous les cas. Corollaire : **une pastille
    compte EXACTEMENT ce que l'écran montrera** — elle se calcule au rendu,
    jamais au sondage, sinon elle appelle vers un écran vide.
12. **Deux thèmes, un seul jeu de règles** (b233) : l'app est SOMBRE par
    défaut — c'est son identité de scène — et le mode clair est une SORTIE
    pour le plein jour, réglée depuis la BIBLIOTHÈQUE (barre d'outils de
    l'onglet Morceaux, `prefs.theme` ; jamais depuis la partition —
    arbitrage de Vincent en b234), qui s'applique à TOUTE l'app. Conséquence sur tout code d'interface :
    `:root[data-theme='clair']` ne redéfinit que des TOKENS, jamais un
    composant. Une couleur écrite en dur dans un composant est un bug de
    thème — même un `#fff` posé sur ce qu'on croit être un fond coloré :
    le fond d'un `.livebadge` n'est qu'un rouge à 24 %, en clair le texte
    devenait blanc sur blanc. Le sombre n'écrit AUCUN attribut : si le
    module de thème ne s'exécutait pas, l'app resterait sombre. Le thème
    est posé AVANT React (`main.tsx`, copie locale `sing2me/theme`), sinon
    l'app clignote à chaque lancement ; `prefs.theme` fait foi et recale
    ensuite. Les pages PUBLIQUES ne suivent pas ce réglage : le spectateur
    n'a pas à hériter du confort de l'artiste.
    **Le MODE SCÈNE est sombre, et c'est la seule option** (b235, décision
    de Vincent) : y entrer bascule TOUTE l'app en sombre, et ça ne se défait
    pas en sortant — « repasser en mode clair, même hors mode scène, doit
    faire l'objet d'une nouvelle action de l'utilisateur ». On ne mémorise
    donc rien pour restaurer le clair : le bouton de la bibliothèque est le
    seul chemin du retour. Corollaire dans le CSS : les tokens `--stage-*`
    n'ont PAS de valeur claire, sinon un pupitre blanc pourrait apparaître
    en plein concert.

## Marque — DodoSongs (charte d'août 2026)

- **Le nom du produit est DodoSongs**, et son icône est le dodo à la
  guitare. Charte fournie par Vincent (PDF), appliquée en b236 **sur la
  LANDING uniquement** (`public/site/index.html`) — voir la réserve plus
  bas.
- **L'icône est un bloc complet** : le dodo et sa guitare sont posés sur le
  fond nuit, dans un carré aux angles arrondis (22,5 % du côté). On n'en
  extrait ni l'oiseau seul ni la guitare seule ; jamais dans un cercle,
  jamais recolorée, jamais d'ombre portée, jamais sur un fond autre que le
  nuit. Fichier : `public/dodosongs.png` (512 px, coins transparents,
  extrait du PDF de la charte).
- **Deux règles qui ne souffrent aucune exception** :
  1. **le CYAN est réservé aux ACCORDS** — dans le logo il ne sert qu'aux
     mécaniques de la guitare, dans l'app qu'à ce qui se joue. Un
     utilisateur apprend en trois secondes que « bleu = accord » ; une seule
     exception et la règle ne vaut plus rien. Corollaire : la page du
     PUBLIC est la seule surface où le cyan n'apparaît pas (elle ne montre
     aucun accord) ;
  2. **un seul bouton ambre par écran** : celui qui fait avancer.
- Rappel compatible avec la règle 12 : le direct se signale par un mot ET un
  mouvement, jamais par la couleur seule.
- Jetons de la charte (déjà en place dans la landing) : `--nuit #0A0F1D`,
  `--nuit-2 #121A2E`, `--nuit-3 #1B2540`, `--creme #F4F0E9`,
  `--creme-2 #A7AFC2`, `--creme-3 #69728A`, `--ambre #FCA711`,
  `--ambre-fonce #DE8F00`, `--cyan #5BD0E8`, `--vert #5BD8A6`,
  `--rouge #F4677E` ; rayons 10 / 14 / 20 / 28 px. Typographie : DEUX
  familles, pas plus — une sans-serif pour l'interface, une monospace pour
  ce qui doit s'aligner (les accords, et rien d'autre).
- **RÉSERVE LEVÉE en b237** (« le site et l'app sont modifiés. Le nouveau
  nom est DodoSongs pour tout ») : l'application est migrée — jetons de
  `theme.css` dans les DEUX thèmes, nom dans toute l'interface et les
  dictionnaires, manifeste, icônes, cache du service worker, CGU, docs et
  commentaires SQL. Plus une seule occurrence de l'ancien nom à l'écran.
- **CE QUI NE SE RENOMME JAMAIS** : les clés `localStorage` (`sing2me/web/v1`
  et les 48 autres). Elles ne sont vues par personne, et les renommer
  EFFACERAIT la bibliothèque, la session et les préférences de chaque
  utilisateur déjà installé. Même raisonnement pour les tables Supabase.
  Le préfixe du cache du service worker, lui, a bien changé
  (`dodosongs-…`) — mais le nettoyage continue de reconnaître les anciens
  `sing2me-…`, sinon ils resteraient sur les téléphones pour toujours.
- **La marque se VOIT sur un téléphone** (b238, constat de Vincent : « le
  logo n'apparaît pas sur le téléphone »). Elle ne vivait que dans la barre
  latérale, qui n'existe qu'à partir de 900 px : une fois connecté, sur un
  téléphone, le dodo n'était affiché nulle part — ni bogue ni asset
  manquant, simplement aucun endroit pour le montrer. Il occupe désormais la
  gouttière gauche de la barre du haut, celle déjà réservée au bouton
  Retour : rien ne bouge, il s'efface dès qu'on entre dans un écran d'où
  l'on revient, et il disparaît à partir de 900 px pour ne pas doubler la
  barre latérale. Décoratif et NON cliquable — l'onglet Morceaux mène déjà à
  l'accueil, et on n'ouvre pas un deuxième chemin vers une action existante
  (règle 3). **Taille doublée en b241** (« double la taille si ça entre dans
  le format ») : 56 px dans la barre du haut — 60 l'aurait poussée au-delà
  de 86 px, 56 la garde à 83 et tient dans la gouttière de 64 déjà réservée.
  `LogoMark` sert `dodosongs-128.png` jusqu'à 64 px d'affichage et
  `dodosongs-256.png` au-delà : sinon l'icône se pixelise sur un écran à
  haute densité, et la page du spectateur n'a pas à charger la grande.
- **Reste à faire un jour** : l'adresse de déploiement est encore
  `sing2me-three.vercel.app` (c'est celle de Vercel, elle se change dans
  leur console, pas dans le code).

## Déploiement & versions (pipeline actuel)

- Source de vérité : ce dépôt GitHub (`Vincent9743456/sing2me`).
  **Tout push sur `main` déclenche un déploiement Vercel automatique**
  vers https://sing2me-three.vercel.app — pas de `vercel --prod` manuel.
- **À chaque livraison, incrémenter la version aux DEUX endroits** :
  - `src/version.ts` → `APP_BUILD = 'J mois AAAA · bN'` (affiché en bas
    de l'onglet Artiste) ;
  - `public/version.txt` → `bN` seul (permet de vérifier le déploiement
    depuis l'extérieur : GET /version.txt).
- Un seul commit par livraison, message en français :
  « bN : résumé des changements ».
- **Le quota de déploiements n'est plus la contrainte** (abonnement Vercel
  Pro pris par Vincent, 10 août 2026). Tout ce qui suit en découlait et
  N'A PLUS LIEU D'ÊTRE :
  - les commits de la branche de travail ne portent plus `[skip ci]` ;
  - **on repousse la branche après un merge**, au lieu de la remettre à
    niveau en local en silence (ça éteint aussi le crochet git qui
    réclamait ce push à chaque fin de lot) ;
  - une prévisualisation ne « vole » plus rien : elle redevient utile.
  **Ce qu'on en fait, maintenant** : chaque lot poussé sur la branche
  produit une PRÉVISUALISATION, que Vincent peut essayer AVANT la mise en
  production. Le va-et-vient « je livre / il constate un défaut / je
  relivre » se règle donc avant que la production bouge. Une PR sans
  prévisualisation essayée reste une PR livrée à l'aveugle.
  **Ce qui reste vrai malgré le Pro** : un lot doit rester COHÉRENT (un
  sujet, un numéro de version, un message qui se lit) — non plus pour
  économiser des créneaux, mais parce qu'un lot fourre-tout ne se teste
  ni ne se raconte. Regrouper trois retours liés : oui. Empiler dix
  changements sans rapport : non.
  *Historique, à garder pour comprendre le code existant* : le plan
  gratuit plafonnait à 100 déploiements par jour (`api-deployments-
  free-per-day`), compteur remis à zéro à minuit UTC — épuisé le 8 août
  2026, la production est restée neuf versions en arrière. C'est de là que
  venaient les `[skip ci]` et l'interdiction de sonder le quota avec une
  prévisualisation.
- **`vercel.json` ne se bricole PAS** (9 août 2026, toujours valable) : y
  ajouter `git.deploymentEnabled` a fait échouer la mise en production —
  un déploiement gâché et la correction de Marco retardée d'autant. Ce
  fichier est validé strictement par Vercel : une clé inconnue, même un
  commentaire `_comment`, casse le déploiement. Rien à voir avec le
  quota — on n'y touche que pour une raison qui le vaut, jamais en pleine
  livraison urgente.
- **LA MISE EN PRODUCTION N'A PLUS À ÊTRE DEMANDÉE** (Vincent, 10 août
  2026 : « envoie. Ne me demande plus »). Un lot vérifié se fusionne et part
  en production sans attendre un feu vert. Ne plus finir un lot par
  « dis-moi si je fusionne » : c'est une friction que Vincent a explicitement
  retirée.
  **Ce que ça ne change PAS** : le lot doit être VÉRIFIÉ avant de partir
  (typecheck strict, i18n, build, contrôles de la fonction livrée) — l'accord
  porte sur la permission, pas sur la rigueur. La prévisualisation reste
  produite à chaque push de branche : elle sert quand un lot demande un avis
  humain (rendu, formulation, choix produit), et on le DIT alors, sans
  bloquer la livraison. Et ce qui touche à la base (`supabase/*.sql`) reste
  à annoncer : c'est Vincent qui l'exécute.
- Après push : vérifier https://sing2me-three.vercel.app/version.txt.
- Supabase : projet `zssnwjtfzbymtsiccvao` ; après modification d'un
  fichier `supabase/*.sql`, demander à Vincent de le ré-exécuter dans le
  SQL Editor (les fichiers sont idempotents) —
  https://supabase.com/dashboard/project/zssnwjtfzbymtsiccvao/sql/new.
  **Le contenu n'est pas une colonne parmi d'autres** (b197) : filtrer un
  payload sur les colonnes existantes est juste, MAIS jamais au point
  d'écrire une ligne amputée de ce qu'elle transporte. Le livre d'or a
  ainsi enregistré quatre mots du public SANS leur texte — le spectateur
  lisait « Message transmis », l'artiste recevait une coquille. Écrire
  dans la colonne qui existe vraiment (`body`, ou `content` sur les bases
  anciennes) et REFUSER s'il n'y en a aucune.
  **`create table if not exists` NE CORRIGE PAS une table existante**
  (b195) : `live_messages` avait été créée avant ce fichier, sans colonne
  `author` — toutes les lectures la demandaient et échouaient en 400,
  pendant que l'écriture (qui interroge le schéma réel) continuait
  d'enregistrer. Quatre messages en base, zéro à l'écran. Toute cascade de
  replis doit donc se terminer par un `select=*`, qui ne peut pas échouer
  sur une colonne inconnue.
  **État : `live.sql` rejoué INTÉGRALEMENT le 8 août 2026** — toutes les
  colonnes accumulées depuis b121 sont en place (`performer`,
  `setlist_name`, `live_id`, `band_id`, `session_id`, `owner_id`). Ne
  jamais redonner un bloc PARTIEL : une colonne oubliée ne casse rien
  bruyamment, elle fait retomber la fonction sur un repli silencieux. Variables d'environnement
  (Vercel) : VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_URL,
  SUPABASE_SERVICE_KEY, LIVE_KEY, ANTHROPIC_API_KEY.

## Architecture — les 3 règles d'ergonomie (obligatoires)

Simplification actée (spec ergonomie) — s'appliquent à tout nouveau code :

1. **Chaque objet a une seule maison.** Les morceaux vivent dans l'onglet
   Morceaux ; setlists et groupes y *font référence*, jamais de « deuxième
   bibliothèque ». Toute liste de morceaux ailleurs est une **vue filtrée**.
2. **Une action = un geste unique appris une fois.** Affecter des morceaux
   (à une setlist ou à un groupe) passe TOUJOURS par le **même composant
   sélecteur** (`src/components/SongPicker.tsx`), dans les deux sens :
   depuis le morceau (`AssignSheet` — feuille « Ajouter à… »), depuis la
   cible (`SongCollector` — plein écran, recherche + multi-sélection).
   Ne jamais recréer un picker ad hoc.
3. **Un écran = une mission, une action principale.** L'avancé (plan de
   scène, sono, régie, stats, versions) vit derrière des plis ou « ⋯ » et
   ne coûte rien à qui ne le cherche pas. Jamais de nouvel écran si un
   existant peut accueillir la fonction ; jamais de deuxième chemin vers
   une action existante.

## État actuel & backlog (août 2026)

- Version en production : voir `src/version.ts` (b17 au 5 août 2026 :
  onglet 👥 Groupes dédié, groupe affiché sur les setlists, espace de
  discussion de groupe `band_messages`).
- Décisions produit actées (ne pas revenir dessus sans Vincent) :
  - plus de vues par musicien (tout le monde voit la partition
    complète ; la vue « paroles » ne sert qu'au public/QR) ;
  - « Structure » = notes libres (`structureNotes`), plus de sections
    avec accords par partie ;
  - modifier une partition ne change jamais la version active par
    défaut d'un morceau ; la tonalité/capo de la version principale se
    propage aux versions qui suivaient les mêmes valeurs ;
  - **transposer MODIFIE la version** (décision Vincent, b169) : les
    accords écrits sont réécrits et la tonalité suit
    (`transposeSong`) ; poser un capo modifie la version
    (`setSongCapo`). Ce n'est plus un réglage d'écran mémorisé sur
    l'appareil — c'est la seule façon pour que le mode scène, le direct
    et le suivi de groupe voient la même chose que le musicien.
    Transposer est sa propre annulation. **Exception** : dans une
    setlist, les boutons règlent la tonalité de CE concert
    (`keyOverride` de l'item), jamais la version — le repli le dit
    (« Tonalité de ce concert »). La tonalité annoncée aux autres
    musiciens vient du morceau (`playedKey`), jamais de la clé de
    rafraîchissement de la diffusion ;
  - **invariant « originale maîtresse »** (assoupli b135) : la 1ʳᵉ version
    (`versions[0]`) est TOUJOURS une version personnelle (`bandId ''`) —
    elle reste dans la bibliothèque perso, pilote les autres, n'est jamais
    absorbée par un groupe. Depuis b135 (décisions Vincent + feedback
    Marco) elle EST supprimable et remplaçable : « ⭐ En faire la version
    de référence » promeut le contenu d'une autre version dans
    l'originale, et supprimer l'originale fait monter la version suivante
    en référence (une secondaire personnelle monte telle quelle ; sinon la
    première version de contexte est clonée en personnelle). Jamais de
    morceau sans version personnelle en tête. **Modèle simplifié (b113,
    ramené au minimum b211)** : un morceau = l'originale + AU PLUS une
    version par groupe qui l'a au répertoire — rien d'autre (plus de
    « versions setlist » ; les ajustements d'un concert passent par la
    tonalité de l'item de setlist). La **« version Solo » de b115 est
    SUPPRIMÉE** (arbitrage Vincent, b211) : elle faisait doublon avec
    l'originale, qui EST ma façon de le jouer seul. Les setlists et
    lectures en contexte solo utilisent donc l'originale. Ce qui avait
    été écrit dans une version Solo n'est pas jeté : `retireVersionSolo`
    (appelée au chargement) la rend PERSONNELLE (`bandId ''`), elle reste
    dans la liste des versions du morceau. Garanti par `ensureOriginalVersion` +
    `dedupeBandVersions` (réparations au chargement), `duplicateVersion`
    idempotente par contexte, et la garde dans `removeVersion` ;
  - retirer un morceau du répertoire d'un groupe est un acte de niveau
    groupe propagé à tous (chacun garde sa copie personnelle) ;
  - **quitter un groupe ne détruit rien, mais ne laisse rien d'orphelin**
    (b185) : mes morceaux restent (les versions du groupe redeviennent
    personnelles ou disparaissent au profit de mon originale — jamais de
    version rattachée à un groupe qui n'existe plus), et mes setlists sont
    seulement DÉTACHÉES. En cas de RETOUR dans le groupe, l'adhésion crée un
    nouvel identifiant local : la synchro doit donc rattacher une setlist
    déjà présente mais détachée, et regarnir une setlist vide — sans quoi le
    groupe paraît n'avoir aucune setlist (constat de Marco). Le contenu
    qu'un membre a modifié lui-même n'est jamais écrasé ;
  - **un groupe se TRANSMET** (b213, demande de Vincent) : les réglages du
    groupe nomment son créateur (« Créateur : Toi » / le nom de l'autre), et
    le créateur peut confier le groupe à un MEMBRE avec compte
    (`transfer_band`). Le serveur fait autorité — `band_owner` ; le drapeau
    local `owned` n'en est qu'un reflet, recalé à l'ouverture de la fiche,
    c'est ainsi que le nouveau créateur l'apprend. L'ancien créateur RESTE
    dans le groupe comme musicien (sans quoi il perdrait l'accès au
    répertoire : les politiques RLS ne connaissent que le propriétaire et
    les membres), et le nouveau GARDE sa ligne de membre (la retirer ferait
    croire à son application qu'il a été exclu — elle effacerait le groupe).
    Corollaire : ne jamais appeler `ensureCloudBand` pour un groupe déjà
    publié qui ne m'appartient plus, sinon j'en crée un DEUXIÈME, vide, avec
    le même identifiant local ;
  - **on ne QUITTE pas un groupe qu'on a créé** (b212) : on le supprime ou
    on le transmet. `leave_band` le refusait en commentaire mais pas en
    code : réinitialiser son application appelait `leaveBand` sur TOUS ses
    groupes, le créateur inscrivait donc son propre départ, et son onglet
    Groupes lui demandait ensuite de **se réinviter lui-même**, sans
    pouvoir fermer le message (signalement de Marco). Trois verrous, parce
    qu'un seul aurait laissé les lignes déjà écrites : la réinitialisation
    saute les groupes `owned`, `leave_band` ne fait rien pour le
    propriétaire, `my_band_departures` n'en renvoie jamais un qui me
    désigne, et le client filtre par `departuresToShow` (jamais moi, jamais
    un groupe que je n'ai plus, jamais un départ écarté) ;
  - un morceau ajouté au répertoire d'un groupe arrive chez les autres
    membres **dans les Idées** de leur bibliothèque (décision Vincent,
    b174 — remplace les « limbes » séparées) : `idea: true` +
    `pendingBandId` qui ne dit plus que la PROVENANCE. Il ne se mélange
    donc pas aux morceaux qu'on joue, mais il a une vraie place chez soi.
    **Le programmer dans une setlist entérine son inscription définitive
    en bibliothèque** (`idea: false`, `pendingBandId` effacé) — appliqué
    dans `store.saveSetlist`, donc par TOUS les chemins d'ajout. Le
    bouton « ✓ Accepter » reste disponible sans passer par une setlist,
    et le chip « 📥 Propositions » n'est plus qu'une vue filtrée ;
  - **supprimer un morceau du répertoire d'un GROUPE ne l'efface pas** (b239,
    demande de Vincent) : il RETOURNE dans les Idées, en proposition du
    groupe d'où il vient — « pour pouvoir restaurer si c'était nécessaire ».
    Un morceau du répertoire n'est pas seulement à moi : quelqu'un l'y a mis
    et le groupe continue de l'avoir, donc l'effacer chez moi n'a pas à le
    perdre. Aucune pierre tombale dans ce cas — elle l'empêcherait de
    revenir. Et **s'il est PROGRAMMÉ dans une setlist du groupe, on REFUSE**
    la suppression : le programme engage les autres musiciens. La sortie
    existe déjà (retirer le morceau du répertoire du groupe, ce qui enlève
    la version de groupe), après quoi il se supprime comme n'importe quel
    morceau perso. Une IDÉE, elle, se supprime pour de bon : c'est la seule
    façon de décliner une proposition, et la règle ne doit pas la
    confisquer. La décision vit à UN endroit (`src/lib/deletesong.ts`) : le
    store l'applique, la feuille `SongDeleteSheet` l'ANNONCE — les quatre
    chemins de suppression (fiche, ligne, aperçu, éditeur) passent par elle,
    sinon un écran finirait par promettre « supprimé » là où l'app garde une
    proposition ;
  - **une PROPOSITION de groupe s'ÉCARTE, elle ne se supprime pas** (b240,
    demande de Vincent : « qu'un morceau proposé dans le répertoire du
    Groupe, s'il n'est pas accepté par un membre, puisse être récupéré
    facilement »). C'était le dernier cul-de-sac : décliner posait une
    pierre tombale, et le groupe — dont les données n'ont pas bougé d'un
    pouce — n'avait AUCUN moyen de reproposer le morceau. La porte se
    fermait des deux côtés à la fois. Écarter (`Song.declined`) la sort des
    Idées et de partout ailleurs, SAUF du répertoire du groupe qui l'a
    proposée : elle y attend, marquée « ↩ Écarté », avec un « ↩ Reprendre »
    qui la ramène « à valider » (reprendre n'est pas accepter). Aucune
    pierre tombale — c'est elle qui rendrait la reprise impossible. Une idée
    SANS groupe, elle, se supprime pour de bon. Corollaires : la pastille
    « 💡 Idées » ne compte pas les écartées (règle 11), et le bouton de la
    fiche dit « Écarter cette proposition » — le mot doit annoncer l'effet,
    sinon on croit avoir supprimé ;
  - **PLUS D'« IDÉES » : DES PROPOSITIONS, ET RIEN D'AUTRE** (b274, arbitrage
    de Vincent : « on abandonne le concept d'idée à tous les niveaux »). Le
    mot recouvrait deux choses sans rapport : une BOÎTE DE RÉCEPTION (ce qui
    arrive du dehors et attend une décision — avec ses boutons, sa pastille,
    sa fin) et une ÉTAGÈRE personnelle (« à travailler »), qui n'avait, elle,
    aucune fin. La pastille comptait donc « 3 choses à traiter » ET « 12
    morceaux que je jouerai peut-être un jour » — exactement ce que la règle
    11 interdit. Il ne reste que la boîte, et elle n'a que DEUX entrées : le
    répertoire d'un GROUPE (`pendingBandId`) et un morceau gardé à un BŒUF
    (`keptAtJam`, posé par `keepSong`). L'option « garder comme idée » de
    l'import a disparu — un morceau qu'on importe entre dans la bibliothèque.
    Le CHAMP `Song.idea` garde son nom (il vit dans le localStorage de tous
    les installés) mais change de sens : « proposition en attente ». Migration
    au chargement : une attente sans groupe ni bœuf redevient un morceau
    ordinaire — le drapeau tombe, jamais le morceau. Les copies de bœuf
    d'AVANT b274 n'ayant pas encore `keptAtJam` sont libérées elles aussi :
    c'est le bon sens de l'erreur, un morceau retrouvé dans sa bibliothèque
    ne se perd pas, alors qu'un morceau resté en attente d'une décision qui
    ne viendra jamais, si.
  - un morceau supprimé n'est jamais réimporté par l'import en masse
    (tombstones) ;
  - navigation : les boutons ← des pages vont vers un parent explicite
    (`navigate('/xxx')`), pas `history.back()`.
  - **on ne QUITTE jamais l'app pour montrer quelque chose qu'on peut
    afficher dedans** (b187) : dans l'app installée sur iPhone, ni un lien
    ordinaire ni `window.open(_blank)` ne laissent de retour — la vue
    s'ouvre sans barre de navigation et l'utilisateur est bloqué (signalé
    deux fois par Vincent, sur la fiche d'un membre du groupe). Une page
    publique se RECOPIE dans l'écran courant, ou son adresse se copie ;
    elle ne se visite pas. La page publique porte quand même un « ← Retour »
    quand le référent est de notre origine (jamais après un QR scanné).
  - **une partition ne circule QUE par deux canaux** (décision Vincent,
    b110, amendée b121) : poussée dans le répertoire d'un groupe
    (« Ajouter à… », synchro auto) ou diffusée en mode ON AIR (QR **ou code
    de salon à 6 chiffres**) ; un musicien présent au bœuf peut en garder
    une **copie personnelle** (« Garder ce morceau » → Idée, jamais
    partagée ni synchronisée). Aucun partage de morceau ni de setlist par
    lien (les boutons « Partager au groupe / au public » ont été retirés ;
    la page de réception /s/… des anciens liens reste) ;
  - **multi-live (b121)** : plusieurs directs simultanés — table `lives`
    (une ligne par direct, `join_code` + `write_token` du lanceur), plus de
    scène globale unique ; l'ancienne ligne `live_state` n'est lue qu'en
    repli pour les vieux bundles ;
  - **le spectateur suit une IDENTITÉ, pas une session** (décision Vincent,
    b170 — annule le code de salon visible de b121) : le QR mène à
    `/sonnom`, le public y RESTE, et la page résout le direct par le NOM de
    l'artiste (`/api/live?artist=`) en boucle. Trois états sur cette même
    adresse : pas de direct → la fiche de l'artiste ; direct sans partition
    → « Le concert commence dans un instant… » ; partition diffusée → les
    paroles. Un concert coupé puis relancé crée une nouvelle session : avec
    un code, l'ancienne adresse mourait et il fallait rescanner ; avec le
    nom, la page le retrouve seule. Le `join_code` reste un identifiant
    INTERNE (jamais affiché, jamais saisi) et `?c=` n'est plus lu que pour
    honorer un lien déjà en circulation. Le direct d'un GROUPE porte le nom
    du GROUPE : `/api/live?artist=` cherche donc aussi sur `started_by`,
    sinon la page perso de celui qui a lancé restait muette (b182) ;
  - **un live = un appui sur GO LIVE** (décision Vincent, b182 — annule le
    regroupement au temps écoulé de b179) : le lancement crée la ligne
    `lives`, l'arrêt la clôt. La clôture CONSERVE `started_at`, `artist`,
    `band_id`, `setlist_name` et `concert` — cette ligne EST la trace du
    concert. Ne jamais redevenir malin en devinant les frontières au temps
    écoulé : c'est réservé aux morceaux d'avant b182, dont les bornes ont
    été effacées. La définition vit à UN seul endroit,
    `src/lib/pastlives.ts` (historique de l'onglet Live et compteur de la
    fiche Artiste : même fonction, même chiffre). **Un morceau appartient à
    SA séance** (`live_stats.session_id`) et un mot du public à SON direct
    (`live_messages.live_id`), jamais à l'heure qu'il est (b186) : la clé ON
    AIR étant commune à l'installation, un recoupement horaire faisait
    entrer chez soi le morceau d'un autre musicien. Le rattachement au temps
    n'existe QUE pour les lignes sans identifiant (archives anciennes), avec
    une tolérance de 2 minutes ;
  - **à qui appartient un live — la règle, et rien d'autre** (b188,
    question de Vincent) : un live est SOLO (il appartient à celui qui l'a
    lancé) ou DE GROUPE (il appartient à TOUS les membres du groupe). Rien
    d'autre n'entre en ligne de compte — ni le nom affiché, ni l'heure. La
    table `lives` porte déjà `band_id` et `started_by` ; c'est le SERVEUR
    qui établit la liste de mes lives (le client lui envoie ses noms et les
    cloudId de ses groupes), puis ne renvoie que les morceaux et les
    séances de CES lives. Les heuristiques par nom ou par créneau horaire
    (b138 → b186) ne survivent que pour les archives sans séance.
  - **l'appelant s'identifie par son COMPTE, plus par une clé** (b192,
    décision Vincent) : tout ce qui est réservé à l'artiste (statistiques,
    mots du public, séances, diagnostic, pilotage du direct) accepte le
    jeton Supabase, envoyé en `Authorization: Bearer`. `lives.owner_id`
    porte l'identifiant du compte qui a lancé — il ne change JAMAIS,
    contrairement à un nom d'artiste ; `live_stats` et `live_messages` en
    héritent. Plus aucun tri par nom pour les lignes récentes.
    **La clé reste acceptée en transition** (les applications installées
    ne se mettent pas à jour au même instant, et un direct ne doit jamais
    se couper) ; `LIVE_KEY_LEGACY=0` sur Vercel ferme cette porte le jour
    voulu, sans toucher au code. `VITE_LIVE_KEY` étant une variable de
    BUILD, la clé était de toute façon lisible dans le JavaScript livré au
    navigateur : elle n'a jamais rien protégé. Le PUBLIC reste ouvert —
    un spectateur n'a pas de compte, cœurs, mots et présence passent sans
    identité, par construction.
  - **le concert préparé et le direct se rejoignent par CONFIRMATION**
    (b207, décision Vincent) : au GO LIVE, les concerts du JOUR sont
    proposés, jamais imposés — l'ancien code prenait en silence le premier
    de la journée. Le temps SUGGÈRE, il ne conclut jamais (b138 → b188 :
    trois lots perdus à deviner un rattachement à l'heure). Le filtre reprend
    la règle des lives : un live solo ne porte qu'un concert solo, un live
    de groupe qu'un concert de CE groupe. Qui a CRÉÉ le concert n'entre pas
    en compte — c'est l'APPARTENANCE qui décide, sinon le concert créé par
    Marco empêcherait de rattacher le live que je lance pour le même groupe.
    Deux membres qui lancent chacun un direct pour le même concert : ce
    n'est PAS une erreur, les chiffres s'additionnent (refuser le second
    couperait un direct en pleine soirée). Le live prend alors le nom du
    concert dans l'historique, et le concert affiche en retour ce qu'il a
    produit. Récupération et calcul mis en commun dans
    `src/components/usePastLives.ts` : trois écrans allaient chercher les
    mêmes chiffres chacun de leur côté, d'où le « 0 spectateurs » de b203.
  - **à qui appartient un live** (b183) : je l'ai lancé → il est à moi ; il
    est tagué d'un groupe → il appartient aux MEMBRES de ce groupe (un
    concert de groupe est un acte collectif) ; lancé en solo par quelqu'un
    d'autre → il ne me regarde pas. JAMAIS de « oui » par défaut : une
    ligne sans identité n'appartient à personne (avant b183, elle tombait
    chez tout le monde). Même filtre sur les morceaux archivés du repli.
    **Supprimer un live est LOCAL** (`prefs.hiddenLives`) : rien n'est
    effacé côté serveur, les autres membres gardent le leur ;
  - **une adresse publique, un COMPTE — et le groupe est un MIROIR** (b227,
    décisions de Vincent). Le nom de PROFIL reste libre (cinq Vincent peuvent
    tous s'appeler Vincent : on n'impose à personne de changer de nom
    d'artiste). L'ADRESSE, elle, est unique : `public_pages.name` est unique
    EN BASE, le premier arrivé garde le nom nu, les suivants reçoivent
    `vincent2`, `vincent3`… et peuvent en choisir un autre — jamais un déjà
    pris. **Un groupe n'a PAS de QR à lui** : le QR est celui de l'artiste,
    et c'est l'artiste qui décide au lancement si le public voit son nom ou
    celui du groupe — on ne revient pas là-dessus. Mais le groupe a une
    ADRESSE MIROIR (`band_pages`), qui montre la page de son DÉTENTEUR, lu à
    la volée sur `cloud_bands.owner` : transmettre le groupe déplace le
    miroir tout seul, sans aucune donnée à recopier — donc rien qui puisse se
    désynchroniser. Les deux adresses vivent dans le MÊME espace de noms
    (déclencheur SQL croisé) : un nom pris par un artiste ne peut pas être
    repris par un groupe.
    **Et le direct se résout par le COMPTE, plus par le nom affiché** : le
    nom d'affichage n'est pas unique, donc cinq Vincent avaient bien cinq
    adresses distinctes mais tombaient tous sur le même concert — la promesse
    « une adresse, la tienne » se brisait une couche plus bas.
    `/api/live?page=` remonte l'adresse jusqu'au compte (`lives.owner_id`,
    b192) ; la recherche par nom ne survit qu'en repli, pour les directs
    d'avant b192. Cas d'usage validé : un direct de Zakoustiks lancé par
    Vincent se trouve depuis `/zakoustiks` (miroir) COMME depuis `/vincent`
    (QR) — c'est le même `owner_id`.
  - **un groupe a sa PROPRE page — le miroir ne concerne plus que le
    DIRECT** (b232, correction de Vincent : « ça devrait renvoyer vers la
    page Zakoustiks, pas la mienne »). Ce qui NE CHANGE PAS : le QR est
    unique, c'est celui de l'artiste, et ce que voit le public pendant un
    concert dépend de la façon dont le live a été paramétré. Ce qui change :
    `/zakoustiks` ouvre la fiche DU GROUPE — sa photo, sa présentation, ses
    liens, son pourboire, ses musiciens — écrite par son détenteur dans
    `band_pages.profile`, au même format qu'une fiche d'artiste
    (`publicMembers` en plus). « La page du Groupe ou de l'artiste doivent
    rester consultables. »
    **Corollaire dans `/api/live?page=`** : une adresse de GROUPE ne trouve
    que le direct DE CE GROUPE (`lives.band_id`), plus celui de son
    détenteur. Sans quoi, Vincent jouant en solo, `/zakoustiks` montrait le
    concert solo et la page du groupe devenait inatteignable — exactement le
    cas d'usage de Vincent. Effet de bord bienvenu : un direct de groupe
    lancé par un AUTRE membre est trouvé lui aussi (c'est le groupe qui joue,
    pas le détenteur de l'adresse).
    Repli conservé : tant que le détenteur n'a rien publié, l'adresse retombe
    sur SA fiche — comme avant b232, jamais d'adresse qui n'ouvre rien.
  - **« Page publique / QR » MONTRE la page** (b242, retour de Vincent :
    « ça devrait afficher ma page telle que le public doit la voir »). Ce
    bouton n'ouvrait qu'un QR et des raccourcis d'envoi : impossible de
    vérifier ce qu'un spectateur voit — la seule chose qui compte quand on
    donne son adresse. L'aperçu relit la page PUBLIÉE (après l'avoir
    rafraîchie) et la rend avec `PublicPageView`, le composant de la VRAIE
    page : l'aperçu et la page ne peuvent donc pas diverger. Le QR reste, en
    grand, enregistrable en image (pour l'imprimer) et partageable par la
    feuille du système ; les raccourcis e-mail et WhatsApp sont retirés —
    ils ne faisaient rien que « Copier le lien » ou la feuille de partage ne
    fassent déjà ;
  - **la page publique d'un groupe se consulte DEPUIS SA FICHE** (b230,
    demande de Vincent) — et sans quitter l'app (règle b187) : elle se
    RECOPIE dans une fenêtre, son adresse se copie. Depuis b232 c'est bien la
    fiche DU GROUPE qui s'y affiche, republiée à l'ouverture de l'aperçu :
    ce qu'on regarde est ce que verra un visiteur, à l'instant présent.
  - **l'onglet Artiste distingue ce que le public verra** (b230) : les
    groupes masqués y sont en TRANSPARENCE (opacité + niveaux de gris +
    bordure pointillée), avec la raison écrite en dessous. Cet écran donne
    l'identité publique de l'artiste : y afficher à l'identique un groupe
    qui n'en fait pas partie, c'était mentir par omission.
    (Réserve levée en b231 : la page publique liste désormais les groupes.)
  - **la page publique de l'artiste NOMME ses groupes, et réciproquement**
    (b231, décision de Vincent). Les groupes NON masqués voyagent avec le
    profil (`ArtistProfile.publicBands`) : nom du groupe, noms des musiciens,
    et l'adresse du groupe s'il en a une. Publié PAR l'artiste au même moment
    que sa fiche — donc c'est son choix par construction, et un groupe masqué
    n'y entre jamais.
    **La réciprocité est SYMÉTRIQUE depuis b232** : la page de l'artiste
    nomme ses groupes, celle du groupe nomme ses musiciens, et chaque nom est
    un LIEN vers la page de l'autre quand elle existe — un seul composant
    pour les deux sens (`src/components/PublicBands.tsx`).
    **Photos comprises** (b232 : « le mieux est de mettre la photo présente
    sur la fiche du Groupe ou du musicien, et un lien cliquable ») — réduites
    en vignettes (`miniature`) avec un budget par fiche, parce qu'une fiche
    part au serveur en UN objet JSON republié à chaque profil enregistré et à
    chaque GO LIVE. Sans photo : les initiales, jamais une silhouette
    anonyme. Ne sortent JAMAIS de l'app : un e-mail, un identifiant de
    compte, et un musicien seulement INVITÉ (il n'a rien accepté). Un nom qui
    désigne deux pages publiques n'est pas lié — mieux vaut pas de lien qu'un
    lien vers un homonyme. La sortie reste le masquage du groupe.
    **Ces listes vivent AUSSI dans la fiche ouverte pendant un concert**
    (`live/ArtistSheet`, alimentée par l'état du live) : « un spectateur
    flashe, atterrit sur la page de Vincent, et veut consulter le profil du
    Groupe Zakoustiks ». Pendant un direct, cette fiche EST la page de
    l'artiste — sans ce bloc, la porte se refermait au coup d'envoi.
    La liste se rafraîchit à chaque publication de la fiche (enregistrement
    du profil, passage ON AIR, réservation d'adresse) : un musicien qui
    rejoint le groupe n'apparaît donc pas dans la seconde, mais au prochain
    de ces gestes.
  - **un groupe peut être MASQUÉ au public** (b227, demande de Vincent) :
    « un groupe que je fais à l'occasion avec un pote n'a pas vocation à être
    exposé ». Masqué (`Band.hiddenFromPublic`), il disparaît des identités
    publiques, son adresse miroir est RETIRÉE, et **on ne peut plus lancer de
    direct à son nom** — sans cette dernière règle, masquer ne servirait à
    rien : un seul concert suffirait à l'exposer. C'est un choix PERSONNEL
    (c'est ma page publique), jamais partagé avec les autres membres.
  - **mon QR est unique, mon choix au lancement décide de ce que voit le
    public** (b183) : le passage en direct réserve/rafraîchit ma fiche
    publique avec MON profil, jamais celui du groupe (sinon un concert de
    groupe remplaçait définitivement ma fiche perso). L'identité du
    concert (solo ou groupe) voyage dans l'état du live (`artist`) et ne
    vaut que pendant le direct ;
  - **le risque juridique d'ON AIR est ASSUMÉ** (arbitrage Vincent, août
    2026) : afficher les paroles au public pendant un concert est une
    communication au public, distincte de l'exécution des œuvres déjà
    couverte par la SACEM au niveau du lieu. Vincent connaît la question et
    prend le risque. **Ne plus la soulever** — ni dans une réflexion, ni
    dans une recommandation, ni comme réserve en marge d'un autre sujet.
    Cela ne change rien aux autres garde-fous, qui restent en vigueur : la
    page de signalement, le cloisonnement par compte, l'absence de
    catalogue mutualisé.
  - **ligne rouge « outil, pas catalogue »** (§A.4 du mémo fondateurs) :
    aucune recherche de morceaux côté serveur, aucune base mutualisée entre
    comptes, aucun préremplissage de bibliothèque ; un morceau ne circule
    que d'un membre vers SON groupe. Import déclenché par l'utilisateur,
    page par page, vers SA bibliothèque.
  - **ne jamais nommer la plateforme source des tabs** (§A.5) dans
    l'interface, l'aide, la landing ou le README public. Formulations
    neutres : « colle le lien d'une page de partition », « reprends ta
    collection ».
    **Règle NUANCÉE** (arbitrage Vincent, août 2026) : l'interdiction vise
    la plateforme D'OÙ NOUS RÉCUPÉRONS les partitions — la nommer
    reviendrait à afficher « on pompe chez eux », et c'est là qu'est le
    risque. Nommer une application de recueil que l'utilisateur a
    lui-même achetée, pour lui expliquer comment exporter SES PROPRES
    fichiers, est d'une autre nature : c'est de la portabilité, pas de la
    captation — et c'est autorisé (le code le fait déjà : « ChordPro /
    OnSong » dans l'aide de l'import, `.onsong` dans les formats admis).
    Le test à appliquer : est-ce que je nomme une source de contenu, ou
    l'outil dont l'utilisateur sort ses données ? Le premier, jamais ; le
    second, oui quand c'est la seule façon de donner une consigne utile.
    En pratique, on préfère quand même RECONNAÎTRE le format déposé
    plutôt que de demander à l'utilisateur quelle application il utilise :
    la procédure s'adapte sans qu'aucune liste de marques ne s'affiche.
- **Modèle économique — « Licence Scène »** (arbitrage fondateurs, août
  2026 ; remplace TOUT modèle antérieur, dont le Premium individuel à
  2,99 € désormais abandonné ; pas encore implémenté) :
  - Tout est **gratuit, pour tout le monde, pour toujours** : bibliothèque,
    import, groupes **illimités**, partage, setlists, notes, mode scène.
  - Seul **ON AIR** est monétisé : gratuit jusqu'à ~10 spectateurs
    connectés par session et sans la récolte (cœurs/stats/messages) ; la
    **Licence Scène** (annuelle, attachée au **compte artiste** qui lance
    les sessions — pas au groupe, pas aux membres) débloque audience
    illimitée + engagement complet.
  - Garde-fous intangibles : **JAMAIS de coupure en plein concert** ; le
    **lien de pourboire de l'artiste reste visible même en gratuit** ; la
    licence se vend sur l'engagement (audience, cœurs, stats, fanbase),
    **jamais** sur « plus de paroles ».
  - **Pourboires** : lien de paiement personnel de l'artiste, l'argent ne
    transite **jamais** par nous, **AUCUNE commission** (position
    définitive — l'ancienne commission ~7 % est abandonnée).
  - Aucun chiffre (prix, seuil de spectateurs) n'est arrêté : ne jamais en
    afficher tant que les fondateurs ne les ont pas fixés.
- **Dictée (b157)** : deux chemins, choisis automatiquement — la
  reconnaissance du navigateur (gratuite, texte en direct) quand elle
  marche, sinon l'ENREGISTREMENT + transcription serveur
  (`/api/ai?fn=transcribe`, `server/ai-transcribe.js`). L'app installée
  sur iPhone part directement au serveur (Apple y bride la
  reconnaissance) ; un échec du chemin natif bascule et se mémorise
  (`sing2me/dictationPath`). L'audio n'est jamais conservé. Variables
  Vercel : `TRANSCRIBE_API_KEY` (obligatoire), `TRANSCRIBE_URL` et
  `TRANSCRIBE_MODEL` (facultatives, dialecte OpenAI par défaut) — Claude
  ne transcrit pas l'audio, d'où un service tiers.
- **Diagnostic ON AIR** : `#/concerts?diag=1` — noms de tables, nombre de
  lignes, tri côté serveur. Réservé au dépannage : il ne s'affiche PAS
  dans l'app (décision Vincent, b198 — un musicien n'a pas à lire des
  messages d'erreur SQL). C'est lui qui a fini par livrer la cause du
  livre d'or muet ; le garder, mais hors de vue.
- **Tableau de bord fondateur (b160)** : `#/tableau-de-bord`, réservé aux
  e-mails de `ADMIN_EMAILS` (variable Vercel) — le SERVEUR tranche,
  l'app ne fait qu'afficher. Chiffres : comptes, activité, coût des IA.
  Le coût est mesuré PAR NOUS à chaque appel (`server/meter.js` →
  table `ai_usage`) : ni Anthropic ni OpenAI n'exposent le solde restant
  par API. Le restant = rechargements saisis (`billing_topups`) moins la
  dépense mesurée. Tarifs dans `server/meter.js`, à ajuster là et nulle
  part ailleurs. Après modification : ré-exécuter `supabase/admin.sql`.
- **Connexions sociales (b165)** : Google, Apple et Facebook, activées
  par `VITE_OAUTH_ENABLED=1` UNE FOIS les fournisseurs configurés dans
  Supabase (Authentication → Providers). Deux pièges Apple : le nom
  n'est transmis qu'à la PREMIÈRE autorisation (capté par
  `takeProviderName`, posé seulement si le profil est vide) et « Masquer
  mon e-mail » donne une adresse relais `@privaterelay.appleid.com`
  (elle fonctionne pour écrire, mais ce n'est pas la vraie). Le
  consentement aux communications NON transactionnelles est une case
  jamais pré-cochée, stockée sur le compte
  (`user_metadata.marketing_consent`) — les messages de service n'en
  dépendent pas.
- Backlog connu : remplacer les `alert/confirm/prompt` natifs restants
  par les composants Feedback (règle 10 — dette existante) ; OAuth
  Google/Facebook à configurer ; OCR des PDF scannés ; app native
  Capacitor (v3) ; parseurs OnSong Archive / SongbookPro .SBPBackup ;
  MusicXML.

## Techniques (rappels du projet)

- Local-first : localStorage est la source ; le cloud est une copie.
  Jamais de fonctionnalité qui exige le réseau pour jouer.
- **DEUX COMPTES NE FUSIONNENT PAS** (b259, question de Vincent : « j'ai créé
  2 comptes avec 2 mails différents… j'ai l'impression qu'ils fusionnent.
  Comment empêcher cela ? »). Il avait raison, et c'était STRUCTUREL :
  `localStorage` appartient à l'APPAREIL, pas à un compte. Se déconnecter
  n'effaçait que la session ; la bibliothèque restait. La synchro suivante
  faisait alors ce qu'elle sait faire — une FUSION entre le local et le cloud
  du compte qui arrive — puis elle POUSSAIT le résultat. Au bout d'un
  aller-retour A → B → A, les deux comptes contenaient tout, définitivement.
  On note donc à QUI appartiennent les données de l'appareil
  (`sing2me/compte`, `src/lib/compte.ts`), et trois cas se présentent à la
  connexion : rien de noté → on adopte le compte qui arrive (installations
  existantes, app essayée avant de créer son compte) ; même compte → fusion
  normale, c'est le multi-appareil ; AUTRE compte → on repart de `etatVide()`,
  on ne pousse rien du précédent, et on efface les caches qui appartiennent
  au compte (adresse publique, direct en cours, repères de notification) —
  pas ceux de l'appareil (`deviceId`, thème, langue, police du mode scène).
  Deux garde-fous : le marqueur n'est posé qu'APRÈS un envoi réussi (sans
  quoi on marquerait un compte dont le cloud n'a jamais reçu ces données, et
  le changement suivant les perdrait), et la ceinture « une synchro ne vide
  jamais une bibliothèque remplie » ne s'applique PAS au changement de compte
  — arriver sur un compte neuf, c'est légitimement une bibliothèque vide.
  Ce qui est déjà mélangé ne se démêle pas tout seul : rien ne dit de quel
  compte vient un morceau. La sortie est la réinitialisation partielle des
  Réglages, sur le compte à nettoyer.
- **UN COMPTE SE SUPPRIME DEPUIS L'APP** (b261, demande de Vincent : « c'est
  important pour les utilisateurs de pouvoir supprimer toutes les données »).
  Réglages → tout en bas. Quatre règles, parce qu'une suppression ratée est
  pire qu'une suppression absente :
  1. **l'appelant EST son compte** : le serveur (`server/account.js`) lit le
     jeton (b192), en tire l'identifiant, et n'efface QUE ce qui le porte —
     la vieille clé partagée ne suffit pas pour un acte irréversible ;
  2. **on efface AVANT de fermer la porte** : le compte d'authentification
     part en DERNIER, et seulement si tout le reste a réussi. S'il partait
     d'abord, un échec au milieu laisserait des données que plus personne,
     pas même leur propriétaire, ne pourrait retrouver ni effacer ;
  3. **on annonce des CHIFFRES, pas « toutes tes données »** : le nombre et
     le nom des groupes qui seront DISSOUS pour les autres, l'adresse
     publique qui sera libérée (les QR imprimés meurent avec). L'inventaire
     vient du serveur : ce qu'il annonce est ce qu'il effacera ;
  4. **on confirme en tapant son ADRESSE**, pas par un « oui » — avec deux
     comptes sur le même téléphone, c'est la seule barrière contre
     l'effacement du mauvais. Et l'export de sauvegarde est rappelé
     juste au-dessus : partir ne doit pas obliger à tout perdre.
  Côté appareil, le ménage se fait AU DÉMARRAGE (drapeau `sessionStorage`
  lu dans `main.tsx`) : effacer puis recharger dans la même foulée laisse
  les composants encore montés réécrire des clés (le store enregistre en
  différé). Aucun SQL à exécuter — tout passe par les cascades existantes.
- **UNE PAGE INVISIBLE N'EST PAS UNE PAGE CACHÉE** (b262, demande de
  Vincent). Le réglage « Rendre ma page publique invisible » (Réglages,
  `prefs.pagePubliqueMasquee`, décoché par défaut) ne masque RIEN à
  l'affichage : il republie une fiche VIDE (`ficheMasquee`), marquée
  `masquee`. Photo, bio, liens, pourboire ne sont alors nulle part en ligne
  — sinon n'importe qui lisant la réponse du serveur récupérerait tout. La
  LIGNE reste : elle réserve l'adresse (sinon un autre la prendrait) et
  laisse le QR retrouver un direct en cours — un concert ne s'arrête pas
  parce que la fiche est privée, ce que voit le public pendant le direct
  venant de l'état du live. Le réglage AGIT tout de suite (republication
  immédiate) et ne se coche pas si le serveur n'a pas suivi : une case
  cochée qui n'aurait rien retiré serait un mensonge sur une question de
  vie privée.
  **Et la fiche publiée SUIT le profil effacé** (même constat de Vincent :
  après une réinitialisation, sa page contenait encore photo, liens et
  pourboire — c'est même ce que la bannière de récupération lui proposait de
  rendre). Le filet de b243 protège d'une perte ACCIDENTELLE ; une
  réinitialisation est délibérée. Réinitialiser « Profil artiste » vide donc
  aussi la fiche en ligne, en gardant l'adresse.
- **UN BROUILLON D'ÉCRAN NE DOIT JAMAIS SURVIVRE À SA SOURCE** (b243, perte
  de données signalée par Vincent : « je me suis déconnecté et reconnecté,
  j'ai perdu les informations de profil, photo, liens… »). L'écran Artiste
  copiait `artist` dans un `draft` au MONTAGE et ne le resynchronisait
  jamais. La synchro de connexion arrive APRÈS : le store recevait le vrai
  profil, le brouillon gardait l'ancien, et le premier `saveArtist(draft)` le
  réécrivait par-dessus — avec un horodatage tout neuf, donc il gagnait la
  fusion suivante et partait écraser le cloud. La perte devenait définitive,
  sur tous les appareils. Deux règles qui en découlent, valables pour TOUT
  écran à brouillon : le brouillon se resynchronise dès que sa source change
  sous lui (jamais pendant qu'on édite), et **un bouton qui CONSULTE n'écrit
  rien** — « Page publique / QR » enregistrait au passage, ce qui suffisait à
  déclencher la perte sans qu'on ait rien modifié.
  **Filet** : la fiche PUBLIÉE (`public_pages.profile`) garde une copie
  complète du profil et n'est jamais touchée par la synchro entre appareils.
  `ProfilRestore` compare et propose de rendre ce qui manque — uniquement les
  champs VIDES, jamais par-dessus ce qui est là, et la bannière se lève seule
  quand il n'y a plus rien à rendre (règle 11).
  **DEUXIÈME CAUSE, même famille** (b244, constat sur la capture de Vincent :
  son nom d'artiste était devenu « tessier vincent ») : le nom donné par le
  compte s'écrivait AU MONTAGE, donc AVANT la fusion de connexion. Comme
  `saveArtist` horodate, un profil local vide se retrouvait estampillé à
  l'instant, battait la copie du cloud à la fusion suivante et partait
  l'écraser. Règle générale : **AUCUNE écriture automatique avant la fusion
  initiale** (`readyRef`) — un remplissage par défaut ne doit s'appliquer
  qu'une fois qu'on sait ce que le cloud contient, et seulement si le champ
  est TOUJOURS vide à ce moment-là. Cela vaut pour le nom d'artiste comme
  pour `prefs.userName`.
  **TROISIÈME CAUSE — le filet lui-même** (b245, écran envoyé par Vincent :
  « Ta page publique n'est pas encore réservée », alors qu'elle l'était).
  `sing2me/publicName` est un CACHE, pas une vérité : il se vide (nouvelle
  installation, données du site effacées, autre appareil) sans que l'adresse
  ait bougé côté serveur. Deux écrans le prenaient au mot — l'aperçu
  « Page publique / QR », et `ProfilRestore`, qui n'avait alors AUCUNE fiche
  publiée à comparer. Le sauvetage de b243 devenait impossible exactement le
  jour où il servait. Règle : **un cache local ne conclut jamais à l'absence**
  — il accélère la réponse quand il est plein, et on demande au serveur quand
  il est vide (`monAdressePublique`, qui le recale au passage : le QR du
  panneau ON AIR et la carte du lien public en profitent).
  **Et « consulter n'écrit rien » vaut AUSSI pour les écritures indirectes** :
  l'aperçu de la page d'artiste republiait la fiche « pour montrer l'état du
  jour ». Or cette fiche EST le filet — la republier avec un profil qu'on
  vient justement de perdre écraserait la dernière copie qui restait. Un
  simple coup d'œil ne publie donc plus rien ; enregistrer le profil et
  passer ON AIR le font, eux, parce que ce sont des actes. (L'aperçu d'un
  GROUPE republie toujours : une fiche de groupe ne sauvegarde rien.)
  **QUATRIÈME CAUSE — le compte lui-même** (b246, même écran renvoyé par
  Vincent après b245). Une reconnexion avec une AUTRE adresse e-mail crée un
  AUTRE compte : il n'a jamais rien réservé, donc `public_pages` ne rend
  aucune ligne pour son `user_id` — et l'app conclut, à tort, qu'il n'y a
  rien. La fiche existe pourtant, photo et liens dedans. `maFichePubliee`
  cherche donc par COMPTE d'abord, puis par NOM D'ARTISTE
  (`findPublicPageByArtist`, qui refuse net si deux pages portent le nom :
  jamais le profil d'un homonyme). Deux conséquences d'écriture : la
  bannière dit « une page publique À TON NOM » quand elle vient de ce
  second chemin — on n'appelle pas « ta page » une page dont on n'est pas
  sûr —, et l'aperçu ARRÊTE de dire « pas encore réservée » quand c'est
  faux : il nomme l'adresse trouvée et explique le décalage de compte.
  Règle générale : **un identifiant qui ne trouve rien n'est pas une preuve
  d'absence** — c'est la version « compte » de la règle du cache ci-dessus.
- **ON NE SE RECONNAÎT PAS À UNE ÉGALITÉ DE CHAÎNES** (b247, constat de
  Vincent : « dans le groupe je ne vois pas ma photo à côté de celle de
  Marco »). Sa ligne de musicien disait « Vincent », son profil « tessier
  vincent » : l'app ne savait plus laquelle des lignes était la sienne — ni
  photo, ni accès à sa fiche, et le ⭐ créateur tombait à côté. Un nom
  d'artiste qui change suffit. On se reconnaît donc par son COMPTE quand la
  ligne a un pendant côté cloud (et une ligne qui appartient à QUELQU'UN
  D'AUTRE n'est jamais moi, même si les noms se ressemblent), sinon par les
  MOTS du nom (`memePersonne`, `src/lib/model.ts`) — pas par `sameMusician`,
  dont le rapprochement par sous-chaîne ferait de « Marc » un « Marco » : se
  prendre pour quelqu'un d'autre coûte bien plus cher que de ne pas se
  reconnaître.
  **Et une COPIE se recale à l'acte, jamais à la consultation** : la photo de
  ma ligne de musicien était figée à la création du groupe, donc les autres
  membres voyaient une pastille grise longtemps après. `majMaPhotoDansGroupes`
  la recale à l'enregistrement du PROFIL (idempotente — sans quoi chaque
  enregistrement retamponnerait tous les groupes) ; sur MON écran, mon profil
  passe devant la copie, parce que ma photo n'a qu'une maison (règle 1).
- **UN DOUBLON MASQUÉ À L'ÉCRAN RESTE UN DOUBLON DANS LA DONNÉE** (b248,
  constat de Vincent : « Marco apparaît 2 fois dans le groupe… alors que le
  menu d'avant on n'est que 2 »). Sa fiche portait « Marco » ET
  « marco.bosio » — la même personne, inscrite à la main puis par son compte.
  b141 fusionnait à l'AFFICHAGE, donc le groupe semblait sain ; il a suffi
  d'un écran qui ne fusionnait pas — la page publique — pour annoncer au
  public un musicien de plus que le groupe n'en compte. Deux conséquences :
  on répare à la SOURCE (`dedupeBandMembers`, au chargement, sans toucher
  `updatedAt` : une réparation silencieuse n'a pas à gagner la fusion de
  synchro), et la publication dédoublonne elle aussi, avec `memePersonne` et
  jamais `sameMusician` — sur une page publique, fusionner deux musiciens en
  EFFACERAIT un.
- **UN MUSICIEN EST SON COMPTE, PAS SON NOM** (b249, proposition de Vincent :
  « un identifiant réseau unique par artiste qui s'inscrit, et c'est cet
  identifiant qui est utilisé partout »). `BandMember.userId` fait autorité
  dans les DEUX sens (`memeMusicien`) : même identifiant → la même personne
  quels que soient les noms ; identifiants différents → jamais la même, même
  nom identique (deux Vincent existent). Les noms ne servent plus qu'à ce qui
  est irréductible : un musicien noté à la main, qui n'a pas de compte.
  **C'est là qu'était la SOURCE du doublon de b248** : `mergeCloudMembers`
  (sondage des notifications) rapprochait par NOM EXACT — « marco.bosio » ne
  retrouvait pas « Marco », donc une deuxième ligne était créée à chaque
  sondage, chez tout le monde. b248 réparait en aval ; b249 tarit la source.
  Trois règles pour l'attachement (`stampMemberIds`) : on ne réécrit jamais
  une ligne qui porte déjà un identifiant, un nom qui désigne DEUX comptes
  n'est attribué à aucun, et `updatedAt` n'est pas retouché (chaque appareil
  refait l'attachement depuis `cloud_band_members`, qui fait autorité — rien
  à propager, donc rien à désynchroniser). À la création d'un groupe, ma
  ligne porte mon identifiant tout de suite (`creatorMember`, `monId()`) :
  aucun rapprochement par le nom n'aura jamais à être tenté dessus. Le
  créateur n'étant jamais dans `cloud_band_members`, sa propre ligne est le
  seul cas qui demande encore un dernier rapprochement par le nom.
  **Une ligne de musicien n'est pas un accès** (b250, précision de Vincent :
  « un musicien que j'invite n'a pas accès à l'app tant qu'il n'est pas
  inscrit »). Elle sert d'abord à MOI — décompte, plan de scène, matériel —
  et elle peut donc exister sans compte, par trois chemins : « ＋ Ajouter un
  musicien », une invitation pas encore acceptée, une carte de musicien
  reçue. Le nom n'est donc pas l'identité d'un utilisateur, c'est l'étiquette
  d'une ligne EN ATTENTE de son compte. Corollaire : quand on connaît le
  compte dès l'invitation (annuaire, `DirectoryPerson.user_id`), on pose
  l'identifiant TOUT DE SUITE sur la ligne « en attente » — l'adhésion la
  retrouve alors même sous un nom d'artiste sans aucun rapport, et le
  doublon de b248 ne peut plus naître. Il ne reste que l'invitation par LIEN
  (on ne sait pas qui viendra) et la saisie à la main. Un musicien de BŒUF,
  lui, n'entre jamais dans `band.members` : il repart avec une copie
  personnelle du morceau (b110), pas avec une adhésion.
- **UNE INVITATION PAR LIEN EST NOMINATIVE ET À USAGE UNIQUE** (b251, demande
  de Vincent). Ce qui existait était l'inverse : le lien portait
  `cloud_bands.invite_token` — UN SEUL jeton par groupe, permanent,
  réutilisable à l'infini, rattaché à personne. Un message transféré, une
  capture d'écran, et un inconnu entrait dans le répertoire partagé, pour
  toujours. Une ligne PAR INVITATION (`band_invite_links`) porte désormais le
  nom de la personne visée, expire à 30 jours, et se referme sur le PREMIER
  compte qui l'utilise — celui-là peut y revenir (réinstallation, deuxième
  appareil), personne d'autre ne le peut. Réinviter la même personne révoque
  le lien précédent, sinon deux liens vivraient en parallèle et en révoquer
  un laisserait l'autre ouvert. Trois règles à ne pas défaire : le jeton ne
  se LIT jamais en table (RLS : seul le créateur voit ses invitations, la
  vérification passe par `join_band` en `security definer`) ; les jetons de
  groupe déjà distribués sont NEUTRALISÉS par le SQL, parce qu'un lien qui
  paraît valable est pire qu'un lien mort ; et si le serveur ne sait pas
  créer l'invitation, le client REFUSE — produire un lien ouvert de secours
  reviendrait à contourner la règle en silence.
- **UNE ADHÉSION EN ATTENTE NE DOIT PAS DÉPENDRE D'UN COMPTE NEUF** (b252,
  signalement de Vincent : « j'ai accepté une invitation… mais je ne vois pas
  le groupe. Je pense que vu que j'ai déjà un compte ça a dû ne pas
  fonctionner » — diagnostic exact). L'adhésion automatique était accrochée
  au CHANGEMENT de compte (`session?.userId`) : parfaite au retour du lien
  magique, elle ne partait JAMAIS pour quelqu'un qui avait déjà un compte,
  puisque la navigation ne remonte pas le composant. L'invitation restait
  dans `sing2me/pendingInvite` indéfiniment, sans un mot. `savePendingInvite`
  émet donc un ÉVÉNEMENT (`INVITE_EVENT`), écouté par `AccountProvider` avec
  le retour au premier plan. Règle générale : **un traitement en attente
  s'accroche à l'arrivée du TRAVAIL, jamais à un changement d'identité qui
  n'aura peut-être pas lieu.**
  **Et un bouton qui ne fait rien n'existe pas** : « Partager sans noter de
  prénom » produisait un lien SANS invitation — depuis b251, un lien dont le
  bouton « Rejoindre » rendait la main en silence. Le bouton est retiré
  (c'était aussi le dernier chemin vers un lien ouvert), et un lien sans
  jeton le DIT au lieu de ne rien faire.
- **L'INVITATION REGARDE D'ABORD SI LA PERSONNE EST DÉJÀ LÀ** (b252, demande
  de Vincent). Pendant qu'on tape le prénom, l'annuaire est interrogé : si la
  personne a un compte, l'invitation part DIRECTEMENT dans son application —
  rien à envoyer, et sa ligne porte son identifiant dès l'invitation (b250),
  donc aucun doublon possible à l'adhésion. Les membres déjà dans le groupe
  n'y apparaissent jamais (`memeMusicien`). Le lien nominatif ne sert plus
  qu'à qui n'a pas encore de compte — ce pour quoi il est fait.
- **L'ANNUAIRE MONTRE D'ABORD CEUX AVEC QUI JE JOUE DÉJÀ** (b253, demande de
  Vincent : « quand il y aura 126 Vincent, ce sera plus pratique pour Marco
  de créer un nouveau groupe avec moi »). Une recherche qui rend cent
  homonymes ne sert à rien : on invite presque toujours quelqu'un qu'on
  connaît d'un autre groupe. On le sait SANS RIEN DEMANDER AU RÉSEAU —
  `musiciensConnus` lit les identifiants de compte posés sur mes groupes
  (b249). `connusEnTete` remonte ces musiciens, en tri STABLE : l'ordre du
  serveur départage tout le reste, et aucun résultat n'est retiré. Et la
  raison est ÉCRITE sous le nom (« déjà avec toi dans Zakoustiks ») : un
  classement qu'on n'explique pas passe pour du hasard.
- **UNE ACTION DESTRUCTIVE SE RÉVÈLE, ELLE NE TRAÎNE PAS SUR LA LIGNE**
  (b254, demande de Vincent : « supprimer un groupe depuis ce menu, par un
  glisser vers la gauche qui montre une corbeille ou un appui long avec le
  même effet »). `SwipeRow` est le SEUL chemin pour ça. Trois règles à ne
  pas défaire : un balayage n'est pas un défilement (on ne prend la main que
  si le doigt part sur le côté, sinon la liste se bloque), un seul volet
  ouvert à la fois, et **l'appui long n'agit pas — il OUVRE** : la
  suppression demande un second geste, délibéré, plus la confirmation.
  Corollaire : la DÉCISION (dissoudre un groupe à moi / quitter un groupe
  rejoint) vit à UN endroit (`src/lib/deleteband.ts`), textes compris — la
  liste et la fiche du groupe l'appliquent, elles ne la réécrivent pas.
- **LE CRÉATEUR EST UN MUSICIEN, ET IL N'EST NULLE PART DANS LA TABLE**
  (b255, constat de Vincent : « affichage du nombre de musiciens différent
  chez Damien et chez moi »). `cloud_band_members` ne contient QUE ceux qui
  ont rejoint — le créateur est désigné à part (`cloud_bands.owner`). Un
  membre voyait donc « 1 musicien » pour un groupe qui en compte trois, alors
  que son écran nommait le créateur juste au-dessus (« créé par tessier
  vincent ») : il l'affichait sans le compter. `musiciensDuGroupe`
  (`src/lib/model.ts`) rassemble les TROIS sources dans cet ordre de
  confiance — comptes du serveur, créateur, lignes locales qu'aucun compte ne
  représente — et dédoublonne par `memeMusicien`. Utilisée par la fiche ET
  par la liste : deux écrans qui comptent chacun de leur côté finissent
  toujours par annoncer deux nombres.
  **Le total INCLUT les invités en attente** (« le groupe c'est 3 musiciens
  dont un en attente d'acceptation », Vincent) : annoncer 2 quand on en a
  invité 3 fait douter du compte. On dit donc le total, puis « dont N en
  attente », et l'invité figure dans la liste, marqué. Une ligne CONFIRMÉE
  l'emporte sur une invitation en attente quand les deux désignent la même
  personne.
  **Un écran qui se contredit doit s'expliquer** (b256, correction de
  Vincent : « non, c'est le groupe que j'ai créé moi »). Sa fiche affichait
  « créé par tessier vincent » — son nom d'artiste — ET « Membre du groupe ».
  Les deux étaient vrais : le groupe a bien été créé par un compte portant ce
  nom, mais pas par CELUI qui regardait. C'est b246 vu du côté des groupes.
  Quand le créateur porte l'un de mes noms sans porter mon identifiant, on le
  DIT, avec l'adresse e-mail en cours — c'est le seul fait qui permette de
  comprendre et d'agir. Le serveur reste l'autorité : `owned` se recale à
  l'ouverture, donc si c'est bien mon compte, le message n'apparaît jamais.
- **Une liste de champs écrite à la main finit TOUJOURS par en oublier
  un** (b202 ; troisième récidive après b195 et b197). Un réglage ajouté
  aujourd'hui n'existe pas dans la liste écrite hier : il s'enregistre
  bien, puis il est effacé plus tard et ailleurs — donc invisible au
  test. Vincent a renommé un live, la synchro a jeté le nom ; les lives
  retirés revenaient ; la réinitialisation des concerts s'annulait toute
  seule. La règle : **on ÉTALE (`{...cloud, ...local}`), on ne
  RECONSTRUIT pas** ; on parcourt les clés réellement présentes, jamais
  un tableau littéral. Une règle explicite ne se justifie que pour un
  champ qui demande VRAIMENT un arbitrage. Trois endroits doivent rester
  d'accord pour tout champ de `SyncState` : `mergeStates`
  (`src/lib/sync.ts`), `fromCloud` et l'objet poussé au cloud (les deux
  dans `src/components/Account.tsx`).
- **L'IDENTITÉ D'UN GROUPE VOYAGE AVEC SON RÉPERTOIRE** (b273, constat de
  Vincent : « Gaëlle que j'ai invitée ne voit pas la photo du groupe »). Elle
  n'était partagée NULLE PART : `cloud_bands` ne porte que le nom, et un
  membre n'a même pas le droit d'y lire (la politique RLS ne connaît que le
  propriétaire — d'où la fonction `band_owner`). La photo restait donc sur le
  téléphone de celui qui l'avait choisie. Elle passe désormais par le blob du
  répertoire partagé (`BandData.band`), le canal que les membres partagent
  déjà : aucune ligne de SQL à exécuter. Seul le CRÉATEUR l'exporte
  (`identiteDuGroupe`), les autres ne font que l'appliquer
  (`appliquerIdentite`) ; ce qui est PERSONNEL — `hiddenFromPublic` — n'en
  fait jamais partie, et un nom vide n'écrase jamais celui qu'on connaît.
  **Quatrième récidive de b202 au passage** : `sanitizeBand` RECONSTRUISAIT le
  blob champ par champ, donc `band`, ajoutée le jour même, était jetée en
  silence entre le serveur et la fusion — la photo partait bien et
  n'arrivait jamais. Cette fonction garantit les TABLEAUX, elle ne décide pas
  de ce qui a le droit d'exister : `{...r}` d'abord, gardes ensuite. Pour tout
  nouveau champ de `BandData`, quatre endroits doivent s'accorder :
  `exportBandData`, `mergeBandData`, `bandDataEqual` et `sanitizeBand`.
- **Compte obligatoire (décision Vincent, b120)** : sans session locale,
  l'app musicien n'affiche qu'un portail de connexion épuré (Welcome).
  Le test est LOCAL (session en localStorage) — un compte déjà connecté
  ouvre l'app même en mode avion ; les pages publiques (/live, /nom,
  /s/…, CGU, signalement) ne sont jamais bloquées ; si l'auth n'est pas
  configurée (déploiement sans cloud), pas de portail.
- Variables Vite : accès statique uniquement
  (`import.meta.env.VITE_X`) — jamais d'accès dynamique.
- Supabase côté client : clé anon + RLS uniquement ; service_role
  seulement dans `api/*.js` (Vercel).
- SQL : les fichiers `supabase/*.sql` restent idempotents
  (ré-exécutables sans risque).
- **Vérification avant livraison : `npm run typecheck`, et RIEN D'AUTRE
  comme garde-fou de types.** `tsconfig.verify.json` a `strict: false` :
  il ne voit AUCUNE erreur de nullité. C'est par ce trou qu'est passé le
  plantage de b201, qui a rendu la page du spectateur NOIRE pendant des
  heures — un crochet lisait `state.id` avant le garde `state === null`,
  et le tableau de dépendances d'un `useEffect` est évalué à chaque
  rendu, donc dès le premier. Le typecheck strict le signalait en une
  ligne ; le permissif, jamais. La config permissive ne sert que dans un
  environnement SANS node_modules, et alors on le dit dans le lot.
  Ensuite : tests node sur la logique pure, et `npm run build`.
- **Un crochet vit AVANT les gardes** : tout `useEffect`/`useMemo` écrit
  au-dessus d'un `if (x === null) return …` doit se lire comme si l'état
  n'existait pas encore (`x?.id ?? ''`), dépendances comprises.
- **LE CLAVIER EST UN FAIT DE L'APP, PAS UNE AFFAIRE D'ÉCRAN** (b264, constat
  de Vincent : « l'apparition instantanée du clavier empêche de scroller »).
  Sur iOS, le clavier ne rétrécit pas la fenêtre de mise en page : il la
  RECOUVRE. Une page ordinaire garde donc exactement la même hauteur à faire
  défiler — arrivé en bas, il ne reste plus rien à dérouler et le champ actif
  est coincé dessous. On avait déjà corrigé le symptôme DEUX fois, chaque fois
  pour un écran (b152 : translation sur les feuilles ; b210 : deux variables
  CSS pour le sélecteur plein écran) ; la troisième surface — la page elle-même
  — n'était traitée nulle part, et une quatrième était garantie. La mesure vit
  donc à UN endroit (`src/lib/clavier.ts`), démarrée avant React comme le
  thème, dans les DEUX entrées (le spectateur écrit aussi). Elle publie
  `--vv-h`, `--vv-t`, `--clavier` et la classe `clavier-ouvert`, que le CSS
  consomme : réserve de défilement sur `.app`, voiles arrêtés au-dessus du
  clavier (donc feuilles et modales bien nées, sans un mot dans les
  composants), barre d'onglets effacée pendant la saisie. Trois règles à ne
  pas défaire : une hauteur qu'on n'a pas ne s'invente pas (sans
  `visualViewport`, on ne pose RIEN et les valeurs de repli rendent le
  comportement d'avant) ; en dessous de 90 px ce n'est pas un clavier mais la
  barre d'adresse de Safari qui se replie ; et tout ce qui s'ancre en bas de
  l'écran passe par `--clavier`, jamais par une translation posée sur un
  élément — elle borne la hauteur sans donner de quoi faire défiler.
- **Local-first vaut aussi pour le CODE** (b221, constat de Vincent en mode
  avion) : les DONNÉES vivaient bien en localStorage, mais l'application était
  retéléchargée à chaque lancement — sans réseau, elle ne s'ouvrait pas du
  tout. Installée sur l'écran d'accueil, elle affichait une page d'erreur sans
  même une barre d'adresse. Un service worker (`scripts/build-sw.mjs`, généré
  après `vite build`, sans aucune dépendance) garde la coquille. Règles :
  `/api/*` et `version.txt` ne sont JAMAIS mis en cache (un direct périmé
  serait pire que pas de direct) ; la navigation va au réseau d'abord et
  retombe sur le cache ; les fichiers du build, dont le nom porte une
  empreinte, viennent du cache d'abord ; un nom de cache par livraison, donc
  l'ancien est effacé. **`ignoreVary: true` est OBLIGATOIRE** : les fichiers
  sont servis avec `Vary: Origin`, et un `<script crossorigin>` envoie un
  `Origin` que la mise en cache initiale n'avait pas — sans cette option
  RIEN ne correspond et l'app reste noire. Sortie de secours dans les
  Réglages (« ↻ Recharger l'application »), parce qu'un cache qui tourne mal
  ne se répare pas à distance.
- **Une modification hors ligne doit REPARTIR toute seule** (b221) : l'envoi
  au cloud ne se déclenchait qu'au changement d'état, donc trois morceaux
  corrigés dans l'avion restaient sur le téléphone jusqu'à la modification
  SUIVANTE. Un drapeau « à envoyer » est levé à chaque modification et
  rabaissé à l'envoi ; le retour du réseau (`online`) et le retour de l'app au
  premier plan le rejouent. La fusion, elle, ne change pas : dernier écrit
  gagne, PAR OBJET, sur `updatedAt` (`mergeById`) — à égalité le local gagne.
  Ne pas construire de résolution de conflit : il faudrait le MÊME objet
  modifié sur DEUX appareils pendant la même fenêtre hors ligne.
  **Ce qui attend se DIT** (b222) : « ↑ N modifications en attente » sur le
  bloc du compte, compté au rendu depuis le dernier envoi réussi (gardé dans
  `sing2me/dernierEnvoi`, sinon le compteur repartirait de zéro à chaque
  lancement et annoncerait toute la bibliothèque). Sans envoi réussi connu,
  on n'annonce RIEN plutôt qu'un chiffre faux.
- **L'IA met en forme CHAQUE import** (b220, décision Vincent) : ce qui
  était un bouton, à la main et seulement sur un import déjà cassé, est
  devenu automatique — à l'unité comme en masse. **Jamais bloquant** :
  l'aperçu s'affiche avec l'analyse LOCALE, le bouton d'ajout reste actif, et
  si l'IA n'aboutit pas on garde simplement ce qu'on avait. Le texte collé
  n'est jamais remplacé : il faut pouvoir y revenir.
  **Pas de vérification de JUSTESSE à l'import** (arbitrage Vincent — refus
  explicite de la comparaison mot à mot que je proposais) : savoir si la
  partition dit vrai est le métier de « Chercher une meilleure version ».
  Le **gros doute** est donc un constat de FORME et rien d'autre — du texte
  perdu, des accords disparus, une partition que `analyzeImport` juge encore
  bancale APRÈS le passage. Dans ce cas seulement, l'utilisateur choisit ; à
  l'unité tout de suite, en masse **plus tard depuis la bibliothèque** (un lot
  de trois cents fichiers ne s'arrête pas pour poser une question).
  Corollaire : la partition d'AVANT l'IA (`song.beforeAi`) n'est conservée
  QUE sur les morceaux marqués « à vérifier » — la garder partout doublerait
  le poids de la bibliothèque en localStorage.
- **Un correctif d'import doit pouvoir RATTRAPER l'existant** (b220, demande
  de Vincent : « appliquer ce correctif à mon répertoire comme s'il venait
  d'être importé »). Réglages → « Reprendre mes partitions », en DEUX passes
  séparées parce qu'elles n'ont ni le même coût ni le même risque : le
  **recalage** (`recalerAccordsEnLigne`) est du calcul pur — hors ligne,
  gratuit, rejouable, aucun modèle ne touche aux paroles — et il traite la
  moitié du problème ; la **mise en forme IA** ne sert qu'à ce que le calcul
  ne sait pas faire (retrouver des sections jamais marquées). Toujours
  proposer la passe gratuite en premier, avec son chiffre exact. Les deux ne
  touchent QUE paroles, structure, tonalité et capo.
- **Tout appel payant a un plafond** (b220, demande de Vincent) : un geste
  délibéré devenu automatique est un geste bouclable. `server/ratelimit.js`
  compte par appelant, par heure ET par jour, sur `/api/ai` comme sur
  `/api/tabs` ; l'appelant est son COMPTE quand il en a un (plafonds larges),
  sinon son adresse, HACHÉE — on n'enregistre ni identifiant ni IP en clair.
  Même règle que la mesure (`meter.js`) : ce garde-fou ne doit JAMAIS faire
  échouer une fonctionnalité — base injoignable ou RPC absente, on laisse
  passer. Après `supabase/admin.sql`, la table `ai_rate` et la fonction
  `bump_rate` doivent exister.
- **Ce qui est RECONNU doit être GARDÉ** (b219) : l'import repérait les
  sections (« Refrain », « [Couplet 2] »), s'en servait pour bâtir le résumé
  de structure… puis effaçait le mot des paroles. Comme « Structure » est
  devenu un bloc de notes libres, plus aucun écran ne le montrait : toute la
  bibliothèque était un pavé continu. Les en-têtes vivent maintenant DANS les
  paroles, en clair (« Refrain : »), **jamais entre crochets** — ici les
  crochets sont des accords, et `[Coda]`, `[Couplet 1]`, `[Final]`
  commencent par C, C et F : ils seraient transposés. Vocabulaire à UN seul
  endroit (`src/lib/sections.ts`), lu par l'import (tolérant : une ligne
  « Refrain » nue est un en-tête) et par l'affichage (exigeant : crochets,
  parenthèses ou deux-points obligatoires, sinon une parole qui dirait
  « Solo » deviendrait un titre).
- **Un accord se pose au DÉBUT d'un mot** (b219) : la fusion accords/paroles
  alignait à la colonne exacte, dans une police à chasse fixe que la
  partition d'origine ne respecte pas toujours — d'où « commen[C]t faire » et
  « un coup d[A7]'je t'aime ». On recale sur l'attaque de mot la plus proche :
  un mot de 8 lettres ou moins ramène TOUJOURS l'accord à son début (dedans,
  c'est un décalage de mise en page, jamais une intention) ; au-delà, on ne
  rattrape que 3 caractères d'écart — un vrai mélisme reste où il est.
  L'apostrophe et le trait d'union SÉPARENT (« d'[D]Amsterdam »), et un accord
  posé sur une espace appartient au mot qui SUIT, jamais à celui qu'on quitte.
  Le prompt de nettoyage IA porte la même règle.
- **Un en-tête NU qui suit une ligne d'accords est une PAROLE** (b219) : dans
  « Je marche solo dans la nuit / Am    F / Solo », le mot « Solo » est la
  parole que ces accords surmontent — pas un titre de section. L'import le
  prenait pour un en-tête, coupait le morceau en deux et EFFAÇAIT le mot.
  Un en-tête sans décoration (ni crochets, ni parenthèses, ni deux-points) ne
  compte donc pas quand la ligne du dessus est une ligne d'accords.
- **Le public lit, il ne déchiffre pas** (b219) : un seul composant
  (`PublicLyrics`) et une seule préparation (`stripChords`) pour les trois
  écrans où quelqu'un LIT des paroles. Une ligne qui n'était que des accords
  disparaît au lieu de laisser un blanc ; les espaces de fin de ligne partent
  (dans un texte centré, ils décalent le vers) ; un en-tête sans une seule
  parole en dessous ne s'affiche pas.
- **Ce que lit le public se REGARDE avant le concert, et se CORRIGE** (b223,
  demande de Vincent). La préparation de b219 ne s'exécutait qu'au moment de
  la diffusion : son résultat n'apparaissait nulle part dans l'app, l'artiste
  découvrait l'écran de ses spectateurs par-dessus une épaule, en plein
  concert, sans aucun moyen de corriger une ligne sans abîmer sa partition —
  celle qui porte ses accords. Un œil « 👁 Vue du public » vit dans la rangée
  d'actions de la fiche morceau — **visible sur la partition, jamais rangé
  dans un pli** (correction de Vincent : un aperçu qu'il faut dérouler sous
  les notes de répétition n'existe pas) — et il BASCULE la partition sur le
  rendu EXACT (même composant `PublicLyrics`), qu'on peut alors réécrire.
  L'œil porte lui-même l'état : ✏️ quand le texte est retouché, « à revoir »
  quand il a pris du retard. Hors mode scène et hors direct (arbitrage
  Vincent) : sur scène, l'écran ne sert qu'à jouer. Trois règles :
  1. **l'automatique reste la règle** — sans retouche, le public suit la
     partition tout seul, il n'y a rien à entretenir ;
  2. **une retouche fait autorité PARTOUT** (`song.publicLyrics`) et n'est
     jamais écrasée en silence — toute diffusion passe par l'unique
     `parolesPubliques` (`src/lib/publiclyrics.ts`) : direct, setlist
     parcourue par le spectateur, mode scène, télécommande, vue « paroles
     seules ». Un point de diffusion oublié montrerait autre chose que les
     autres, et c'est précisément ce qu'on ne peut pas vérifier depuis la
     scène ;
  3. **un texte retouché VIEILLIT et le dit** : `publicLyrics.from` garde le
     texte automatique du moment, donc l'écart se CONSTATE (comparaison
     exacte), jamais ne se devine à une date. Le repère se lève tout seul dès
     qu'il n'y a plus d'écart — « ↻ Reprendre ma partition » ou « Garder mon
     texte » (règle 11 : une mention se lève quand son motif disparaît).
  Corollaire : corriger le texte du public ne touche JAMAIS aux paroles ni aux
  accords du musicien, et un texte vide n'ouvre pas un écran blanc au public —
  il ramène à l'automatique.
- **Le texte du public appartient à la VERSION, pas au morceau** (b224,
  question de Vincent : « ça suit les versions ? et les morceaux partagés avec
  le groupe ? »). Posé sur le morceau (b223), il ne bougeait pas d'une version
  à l'autre et ne partait JAMAIS aux autres membres — celui qui prenait la
  peine de corriger était le seul à en profiter, et Marco diffusait autre
  chose que lui pour le même morceau du répertoire. Une version, c'est « comme
  on le joue dans ce contexte » : si la version du groupe raccourcit un
  couplet, le public doit lire le couplet raccourci. `SongVersion.publicLyrics`
  est donc la source ; `Song.publicLyrics` n'en est que le REFLET de la version
  active, exactement comme `Song.lyrics` (`syncActiveVersion` /
  `switchVersion` / `resolveVersion` le portent dans les deux sens), et le
  champ voyage dans le blob du groupe (`SharedVersion`).
  **Deux comparaisons devaient suivre**, sans quoi la correction ne serait
  jamais partie — cicatrice b202, quatrième récidive : `versionContentDiffers`
  (`model.ts`, qui retamponne la version) et `versionEqual` (`bandSync.ts`,
  qui décide qu'une version est inchangée). Toute nouvelle donnée de version
  doit être ajoutée à CES DEUX endroits en plus du type.
- **Un cœur = un spectateur, pour un morceau** (b225, demande de Vincent). Le
  public tape autant qu'il veut — le ❤ s'envole à chaque fois, c'est ce retour
  immédiat qui FAIT le geste — mais un seul cœur est COMPTABILISÉ par
  spectateur et par morceau. Sinon le chiffre ne dit plus « combien de gens
  ont aimé », il dit « qui a le doigt le plus rapide », et les statistiques de
  l'artiste ne veulent plus rien dire. Le spectateur n'a pas de compte : il
  est identifié par `sing2me/deviceId`, l'identifiant anonyme déjà utilisé
  pour les spectateurs uniques ; le MORCEAU est lu par le serveur sur la ligne
  du live, jamais annoncé par le client. Table `live_hearts` (clé primaire
  live + morceau + appareil). **Ce garde-fou ne doit JAMAIS faire perdre un
  cœur** : table absente, base injoignable, spectateur sans identifiant — on
  compte, comme avant. Un concert ne s'interrompt pas pour une statistique.
- **Un accord se consulte SANS quitter la partition** (b226, retour de
  Vincent) : la position s'ouvrait dans une boîte centrée sur fond noirci —
  une interruption, alors qu'on veut l'accord ET la suite du morceau sous les
  yeux (le suivant est déjà à l'écran). C'est une PASTILLE ancrée sous
  l'accord touché, sans voile, calée pour ne jamais sortir de l'écran
  (au-dessus quand il n'y a plus la place en bas), deux positions au plus.
  Elle disparaît au moindre toucher, N'IMPORTE OÙ — y compris sur la
  partition — et à Échap.
- **Un accord barre-oblique n'est PAS son accord de base** (b226, signalement
  de Marco : « il fait un la normal et il a pas mis la basse en do# »). La
  basse d'un `A/C#` était ignorée : doigté faux sous étiquette juste, le pire
  cas. On garde la forme et on descend chercher la basse sur la corde la plus
  GRAVE qui peut la produire, en étouffant tout ce qui est en dessous — sinon
  la vraie basse reste la plus grave et l'accord sonne comme avant. Une forme
  qui ne peut pas porter la basse (empan de main dépassé, moins de trois
  cordes qui sonnent) est ÉCARTÉE, jamais ramenée à l'accord de base.
- **Les positions d'accords sont LUES, jamais inventées** (b229, arbitrage de
  Vincent : « trop dangereux de les inventer »). b225 CALCULAIT les doigtés à
  partir de gabarits déplaçables : l'idée paraissait élégante, elle vérifiait
  l'harmonie — les bonnes notes — et jamais l'ergonomie. D'où un G6 barré
  case 3 qui demande quatre doigts au-dessus du barré alors qu'il n'en reste
  que trois (signalement de Vincent). b228 avait colmaté en refusant
  l'injouable ; c'était un pansement sur une méthode, pas une méthode.
  `src/lib/chorddb.ts` est désormais une table de positions RELEVÉES par des
  guitaristes — doigt par doigt, barré compris — tirée de `chords-db` (David
  Rubert, MIT), filtrée puis FIGÉE dans le dépôt (32 Ko, 629 accords).
  Régénération : `node scripts/build-chorddb.mjs guitar.json`, jamais au build.
  Trois choses à ne pas défaire :
  1. **la table reste commitée** — aucune dépendance, aucun réseau, l'app
     dessine un accord en mode avion ;
  2. **la source est filtrée, pas recopiée** : le générateur écarte les
     positions dont les notes ne font pas l'accord annoncé (7 entrées
     fausses, dont un « C#aug » qui sonne si-fa#-do#) et celles qui
     dépasseraient quatre doigts. Une donnée relevée par des humains a ses
     coquilles ; deux garde-fous indépendants valent mieux qu'une confiance
     aveugle ;
  3. **un accord absent de la table n'ouvre RIEN.** On ne complète pas les
     trous par du calcul — c'est exactement ce qui a produit le G6.
  La licence MIT et la ligne de copyright voyagent en tête du fichier généré :
  ne pas les retirer.
- **Un groupe se masque et se démasque DEPUIS LA LISTE** (b228, demande de
  Vincent) : un réglage rangé derrière « Modifier » n'existe pas. L'œil est
  sur la ligne du groupe (onglet Groupes), un appui dans chaque sens, et
  l'état se LIT sans rien ouvrir (« masqué au public » sous le nom).
- **Un doigté faux est pire que pas de doigté** (b225) : `src/lib/chordshapes.ts`
  calcule les positions de guitare HORS LIGNE (aucun service, aucune
  dépendance) — une table de positions ouvertes écrites à la main, puis deux
  gabarits déplaçables (forme de Mi, forme de La) pour les barrés. Un accord
  dont on ne sait rien renvoie un tableau VIDE et ne s'ouvre pas : on n'invente
  jamais une position. Le module ne parle AUCUNE langue — les libellés
  s'écrivent dans `ChordDiagram` avec `t()`.
- **Une migration de contenu se PROUVE avant de s'appliquer** (b219) : pour
  reposer les sections sur la bibliothèque déjà importée, on ne se contente
  pas de compter les blocs — on recalcule la suite d'accords de chaque bloc
  et on exige qu'elle retombe sur celle qui est enregistrée dans `structure`.
  Au moindre écart, on ne touche à rien : mieux vaut un pavé qu'un
  « Refrain » posé sur un couplet.
- **Un live CLOS ne se rallume pas** (b217) : la clôture efface son code de
  salon, donc rallumer la même ligne donne un direct que plus personne ne
  retrouve — le lanceur le premier, qui le sondait par ce code et lisait
  « éteint » (bouton rouge une seconde, puis vert). Le serveur refuse
  désormais (403), le client oublie sa référence périmée et ouvre un
  NOUVEAU live — un live = un appui sur GO LIVE (b182). Et le lanceur sonde
  le sien par son IDENTIFIANT, qui ne change jamais, jamais par le code.
- **Une action doit toujours pouvoir se terminer** (b216) : tout appel
  réseau déclenché par un bouton porte un délai maximum (`fetchAvecDelai`,
  12 s). Sans lui, `fetch` peut attendre indéfiniment sur un réseau qui
  traîne : Vincent est resté avec un « ⏳ Arrêt… » qui ne revenait jamais,
  incapable de fermer son direct. Et quand l'action rate quand même, on
  offre une SORTIE locale (« Arrêter quand même ») en disant la vérité :
  le téléphone sort du direct, l'app rappellera le serveur ensuite.
- **Toute racine React a un filet** (b215) : `ErrorBoundary` au montage,
  entrée publique comprise — elle en était dépourvue, d'où l'écran noir
  au lieu d'un message. Un spectateur en plein concert n'a aucun moyen de
  diagnostiquer quoi que ce soit.
- **LE DIRECT S'APPELLE « LIVE », PLUS « ON AIR »** (b257-b258, Vincent :
  « il n'y a plus de mode on air, maintenant c'est le mode live »). Le bouton
  dit GO LIVE, l'onglet dit Live : rien de ce que l'utilisateur lit ne peut
  porter un troisième nom. Plus AUCUNE occurrence visible — ni dans l'app
  (les deux langues), ni dans la landing, ni dans `robots.txt`. Le bloc de
  réglage « Mode ON AIR » du profil artiste a disparu avec : depuis b192 il
  n'y avait plus rien à saisir, donc plus rien à expliquer.
  Ce qui NE change PAS, et qu'on ne renomme pas : le code (`OnAir.tsx`,
  `prefs.liveKey`, `sing2me/onair`, la classe CSS `.onair`), les clés
  localStorage et les commentaires d'historique — renommer du code déjà
  écrit, c'est du bruit dans le diff, et les clés de stockage ne se
  renomment JAMAIS. Le mot reste donc dans les fichiers, jamais à l'écran.
  Test de non-régression : `b258.mjs` parcourt dix écrans, panneau du direct
  ouvert, en français ET en anglais — un audit du code ne prouve pas ce que
  l'utilisateur lit.
- Textes UI en français, ton chaleureux, tutoiement.
- **Bilingue (b156) — le français reste la langue SOURCE du code.**
  Toute chaîne d'INTERFACE s'écrit en français dans le code et passe par
  `t('…')` (`src/i18n.ts`) ; la chaîne française EST la clé. L'anglais
  vit dans les dictionnaires `src/i18n/en-*.ts` (un par domaine,
  assemblés dans `i18n.en.ts`). Une clé absente s'affiche en français —
  jamais de clé abstraite, jamais d'écran vide.
  - Variables : `t('Ajouter {n} morceaux', { n })`. Pluriels : deux
    chaînes distinctes (singulier / pluriel), pas de `${n>1?'x':''}`.
  - `t()` ne s'appelle JAMAIS au niveau module (la langue est fixée au
    rendu) : garder la constante en français, traduire au point de rendu.
  - **Le contenu utilisateur n'est JAMAIS traduit** : partitions,
    paroles, accords, titres, artistes, noms de groupes et de musiciens,
    notes de répétition, commentaires, messages. Seule l'interface change
    de langue.
  - Langue = `prefs.lang` ('' = automatique, suit le téléphone), réglable
    dans Réglages. En ajoutant un écran : enrichir le dictionnaire du
    domaine concerné dans le même lot.
  - **Chacun voit l'app dans SA langue** (décision Vincent) : les pages
    publiques (spectateur du QR, musicien invité à un bœuf) suivent la
    langue du téléphone du LECTEUR, jamais celle de l'artiste —
    `publicEntry.tsx` fait `setLang(detectLang())`.
  - Dictionnaire ENFICHABLE (`registerTranslations`) : l'app musicien
    charge tous les domaines, l'entrée publique légère ne charge que
    `en-public.ts` (budget de poids : ~25 Ko, à ne pas gonfler avec des
    traductions que le spectateur ne voit jamais).
  - **CGU en français uniquement** (décision Vincent, août 2026) : texte
    juridique non traduit ; en anglais, un avertissement dit que la
    version française fait foi.
  - Vérification : `node scripts/check-i18n.mjs` doit rester à
    « Couverture complète » avant toute livraison.
