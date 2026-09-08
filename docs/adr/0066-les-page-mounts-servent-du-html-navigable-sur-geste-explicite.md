# ADR-0066 — Les page mounts servent du HTML navigable à l'origine du daemon, sur geste explicite

> Statut : accepted (grilling #674). Amende ADR-0028 (l'interdiction « jamais de `text/html` » ne vise que les artefacts). Vocabulaire : CONTEXT.md § « Page mount ».

## Contexte

Le frontend est embarqué dans le binaire et la route de repli renvoie `index.html` pour tout chemin
inconnu : un agent (ou un opérateur) qui produit un prototype HTML, un rapport, un mockup, n'a aucun
moyen de le montrer via l'instance PDO. Mesuré sur #668 : le mockup de la Banque de skills a dû être
servi par un `python -m http.server` sur un port à part, hors tunnel, hors UI.

ADR-0028 interdit au daemon de servir un artefact en `text/html`, parce qu'un document navigable à
l'origine du daemon exécute du script écrit par un agent avec accès complet à une API sans auth.
Un **page mount** demande précisément cela.

## Décision

Un **page mount** lie un nom à un répertoire du disque ; le daemon le sert en lecture seule sous
`/pages/<nom>/`, en **vrai HTML** (type MIME deviné, scripts exécutés). L'exception à ADR-0028 tient
à la nature du geste : un mount est une **décision explicite** d'un opérateur ou d'un agent (`pdo page
mount`), pas le rendu automatique d'une sortie de node. Le daemon est mono-utilisateur et local
(hors périmètre : auth, upload).

Garde-fous qui restent non négociables :

- **Jamais de repli SPA sous `/pages/`** : un fichier absent est un vrai 404. Un prototype ne peut
  pas masquer l'app, et un test d'existence de route reste fiable.
- **Un artefact ne devient jamais une page par accident** : monter un répertoire situé sous le
  Blackboard (`.pdo/artifacts/`) est refusé. ADR-0028 reste vrai pour les ports `html`.
- **Confinement** : le chemin demandé est canonicalisé et doit rester dans le répertoire monté,
  sinon 404. Le contenu est celui du disque à l'instant de la requête (pas de rebuild pour itérer).
- **Nom** : `[a-z0-9_-]{1,64}` ; un nom déjà monté refuse (409) — on démonte avant de rediriger.
  Le préfixe `/pages` étant libre dans le routeur, aucune collision avec une route API n'existe ;
  la clause « 409 si le nom vaut `runs` » du ticket d'origine était sans cible.

## Cycle de vie

Un mount **persiste** (SQLite) et survit aux redémarrages. Monté depuis une session de node, il porte
le `run_id` du node et **tombe à l'archivage du Run** (`cleanup_run`) — le worktree disparaît, la page
pendrait. Monté depuis un shell d'opérateur, il est instance-level et ne tombe que sur `pdo page
unmount`. Dans les deux cas `unmount` reste disponible pour qu'un agent nettoie derrière lui. L'origine
est un `actor_hint` best-effort (ADR-0044) ; le mount/unmount hors-Run va dans l'`audit_log`, celui
d'un node dans l'event log du Run.

## Alternatives écartées

- **CSP sans script sur `/pages/`** : rend inutilisable le cas motivant (mockups React), pour un gain
  de sécurité que le modèle mono-utilisateur local ne réclame pas.
- **Seconde origine (second port)** : isole vraiment par same-origin, mais double le port à ouvrir
  dans les tunnels et l'allowlist d'origines WS, pour un bénéfice que personne n'a demandé.
- **Servir via le port `html` existant** : le port `html` est une surface de relecture sandboxée par
  design (ADR-0028) ; en faire une page navigable casserait cette garantie pour tous les Runs.

## Conséquences

- Le rail du run pourra lister les pages actives d'un Run (follow-up, hors du premier ticket).
- Tout nouveau préfixe racine doit aussi entrer dans la whitelist du proxy de dev Vite, sinon le
  mode dev répond la coquille SPA en 200 (piège documenté par le routeur et `fs_browse`).
