import { catalogFromGitHubReleases } from './download-catalog.js';

const RELEASES_API_URL = '/api/releases';
const LANGUAGE_KEY = 'mfe-runner.language';
const SUPPORTED_LANGUAGES = ['pt-BR', 'es', 'en', 'fr'];

const SITE_TRANSLATIONS = [
  ['Ir para o conteúdo', 'Ir al contenido', 'Skip to content', 'Aller au contenu'],
  ['MFE Runner — início', 'MFE Runner — inicio', 'MFE Runner — home', 'MFE Runner — accueil'],
  ['Navegação principal', 'Navegación principal', 'Main navigation', 'Navigation principale'],
  ['Idioma', 'Idioma', 'Language', 'Langue'],
  ['Recursos', 'Funciones', 'Features', 'Fonctionnalités'],
  ['Como funciona', 'Cómo funciona', 'How it works', 'Fonctionnement'],
  ['Baixar agora', 'Descargar ahora', 'Download now', 'Télécharger'],
  ['Feito para qualquer ambiente de desenvolvimento local', 'Creado para cualquier entorno de desarrollo local', 'Built for any local development environment', 'Conçu pour tout environnement de développement local'],
  ['Pare de gerenciar', 'Deje de administrar', 'Stop managing', 'Arrêtez de gérer'],
  ['terminais. Gerencie fluxos.', 'terminales. Administre flujos.', 'terminals. Manage workflows.', 'les terminaux. Gérez les flux.'],
  ['Aplicações, serviços, monólitos, monorepos, SPAs, MFEs e bibliotecas locais em uma interface única. Adicione paths, revise a descoberta, organize projetos e mantenha toda a workspace sob controle.', 'Aplicaciones, servicios, monolitos, monorepos, SPAs, MFEs y bibliotecas locales en una única interfaz. Añada rutas, revise el descubrimiento, organice proyectos y mantenga todo el espacio de trabajo bajo control.', 'Applications, services, monoliths, monorepos, SPAs, MFEs, and local libraries in one interface. Add paths, review discovery, organize projects, and keep the entire workspace under control.', 'Applications, services, monolithes, monorepos, SPA, MFE et bibliothèques locales dans une seule interface. Ajoutez des chemins, vérifiez la découverte, organisez les projets et gardez le contrôle de l’espace de travail.'],
  ['Baixar MFE Runner', 'Descargar MFE Runner', 'Download MFE Runner', 'Télécharger MFE Runner'],
  ['Conhecer recursos', 'Conocer las funciones', 'Explore features', 'Découvrir les fonctionnalités'],
  ['Supervisor local persistente', 'Supervisor local persistente', 'Persistent local supervisor', 'Superviseur local persistant'],
  ['Fontes somente leitura', 'Fuentes de solo lectura', 'Read-only sources', 'Sources en lecture seule'],
  ['3 processos ativos', '3 procesos activos', '3 active processes', '3 processus actifs'],
  ['Processos saudáveis', 'Procesos saludables', 'Healthy processes', 'Processus sains'],
  ['Monitoramento em tempo real', 'Supervisión en tiempo real', 'Real-time monitoring', 'Surveillance en temps réel'],
  ['Logs consolidados', 'Registros consolidados', 'Consolidated logs', 'Journaux consolidés'],
  ['Filtros, busca e diagnóstico', 'Filtros, búsqueda y diagnóstico', 'Filters, search, and diagnostics', 'Filtres, recherche et diagnostic'],
  ['workspace unificada', 'espacio unificado', 'unified workspace', 'espace unifié'],
  ['projetos, serviços', 'proyectos, servicios', 'projects, services', 'projets, services'],
  ['e bibliotecas', 'y bibliotecas', 'and libraries', 'et bibliothèques'],
  ['sistemas operacionais', 'sistemas operativos', 'operating systems', 'systèmes d’exploitation'],
  ['arquivos de fonte alterados', 'archivos fuente modificados', 'source files changed', 'fichiers source modifiés'],
  ['Controle de ponta a ponta', 'Control de extremo a extremo', 'End-to-end control', 'Contrôle de bout en bout'],
  ['Tudo o que você precisa para desenvolver sem dispersão', 'Todo lo que necesita para desarrollar sin dispersión', 'Everything you need to develop without fragmentation', 'Tout ce dont vous avez besoin pour développer sans dispersion'],
  ['Uma visão operacional do ambiente local, do primeiro comando ao diagnóstico compartilhável.', 'Una visión operativa del entorno local, desde el primer comando hasta el diagnóstico compartible.', 'An operational view of the local environment, from the first command to shareable diagnostics.', 'Une vue opérationnelle de l’environnement local, de la première commande au diagnostic partageable.'],
  ['Qualquer estrutura, uma única workspace', 'Cualquier estructura, un único espacio de trabajo', 'Any structure, one workspace', 'Toute structure, un seul espace de travail'],
  ['Processos sob controle', 'Procesos bajo control', 'Processes under control', 'Processus sous contrôle'],
  ['Logs que ajudam de verdade', 'Registros realmente útiles', 'Logs that truly help', 'Des journaux vraiment utiles'],
  ['Git somente leitura', 'Git de solo lectura', 'Read-only Git', 'Git en lecture seule'],
  ['Bibliotecas locais vinculadas', 'Bibliotecas locales vinculadas', 'Linked local libraries', 'Bibliothèques locales liées'],
  ['Integração com seu ambiente', 'Integración con su entorno', 'Integration with your environment', 'Intégration à votre environnement'],
  ['Runtime certo para cada projeto', 'Runtime correcto para cada proyecto', 'The right runtime for every project', 'Le bon runtime pour chaque projet'],
  ['Catálogo do seu jeito', 'Catálogo a su manera', 'A catalog organized your way', 'Un catalogue à votre façon'],
  ['Adicione projetos exatos, raízes ou monorepos. O Runner mostra o progresso da análise, sugere Projeto ou Biblioteca e deixa você revisar cada resultado antes de salvar.', 'Añada proyectos exactos, raíces o monorepos. Runner muestra el progreso del análisis, sugiere Proyecto o Biblioteca y permite revisar cada resultado antes de guardar.', 'Add exact projects, roots, or monorepos. Runner shows scan progress, suggests Project or Library, and lets you review every result before saving.', 'Ajoutez des projets exacts, des racines ou des monorepos. Runner affiche la progression, suggère Projet ou Bibliothèque et vous permet de vérifier chaque résultat avant l’enregistrement.'],
  ['Inicie, pare e reinicie individualmente ou em lote. O supervisor pode continuar leve em segundo plano mesmo com a interface fechada.', 'Inicie, detenga y reinicie de forma individual o por lotes. El supervisor puede seguir ejecutándose en segundo plano aunque la interfaz esté cerrada.', 'Start, stop, and restart individually or in batches. The lightweight supervisor can keep running in the background after the interface closes.', 'Démarrez, arrêtez et redémarrez individuellement ou par lot. Le superviseur léger peut continuer en arrière-plan lorsque l’interface est fermée.'],
  ['Busque por texto ou regex, filtre níveis e projetos, marque linhas, acompanhe erros e exporte diagnósticos sanitizados.', 'Busque por texto o regex, filtre niveles y proyectos, marque líneas, siga errores y exporte diagnósticos sanitizados.', 'Search by text or regex, filter levels and projects, bookmark lines, track errors, and export sanitized diagnostics.', 'Recherchez par texte ou expression régulière, filtrez les niveaux et projets, marquez des lignes, suivez les erreurs et exportez des diagnostics nettoyés.'],
  ['Visualize branch, commit, alterações e divergências entre projetos relacionados, sem executar fetch, checkout ou qualquer mutação.', 'Visualice la rama, el commit, los cambios y las divergencias entre proyectos relacionados sin ejecutar fetch, checkout ni ninguna mutación.', 'View branches, commits, changes, and differences across related projects without fetch, checkout, or any mutation.', 'Consultez les branches, commits, modifications et divergences entre projets liés sans fetch, checkout ni aucune mutation.'],
  ['Rode o watch da biblioteca e vincule-a a um ou a todos os consumidores usando os scripts já declarados pelos projetos.', 'Ejecute el watch de la biblioteca y vincúlela a uno o todos los consumidores mediante los scripts ya declarados por los proyectos.', 'Run the library watch and link it to one or all consumers using scripts already declared by the projects.', 'Exécutez le watch de la bibliothèque et liez-la à un ou tous les consommateurs avec les scripts déjà déclarés par les projets.'],
  ['Abra o projeto na IDE, pasta, terminal ou navegador. Copie paths e endereços sem perder o contexto da workspace.', 'Abra el proyecto en el IDE, la carpeta, el terminal o el navegador. Copie rutas y direcciones sin perder el contexto del espacio de trabajo.', 'Open the project in the IDE, folder, terminal, or browser. Copy paths and addresses without losing workspace context.', 'Ouvrez le projet dans l’IDE, le dossier, le terminal ou le navigateur. Copiez les chemins et adresses sans perdre le contexte de l’espace.'],
  ['Selecione runtimes e ferramentas globalmente, por workspace ou projeto. O Runner detecta instalações locais e nunca instala SDKs.', 'Seleccione runtimes y herramientas globalmente, por espacio o proyecto. Runner detecta instalaciones locales y nunca instala SDKs.', 'Select runtimes and tools globally, per workspace, or per project. Runner detects local installations and never installs SDKs.', 'Sélectionnez les runtimes et outils globalement, par espace ou projet. Runner détecte les installations locales et n’installe jamais de SDK.'],
  ['Vários ecossistemas, o mesmo fluxo', 'Varios ecosistemas, el mismo flujo', 'Multiple ecosystems, one workflow', 'Plusieurs écosystèmes, un même flux'],
  ['Da aplicação Node ao backend Java', 'De la aplicación Node al backend Java', 'From a Node application to a Java backend', 'De l’application Node au backend Java'],
  ['Node.js permanece estável. As novas integrações começam em Beta, com descoberta estática, comandos estruturados e diagnósticos de runtime.', 'Node.js permanece estable. Las nuevas integraciones comienzan en Beta, con detección estática, comandos estructurados y diagnósticos de runtime.', 'Node.js remains stable. New integrations start in Beta with static discovery, structured commands, and runtime diagnostics.', 'Node.js reste stable. Les nouvelles intégrations commencent en bêta avec découverte statique, commandes structurées et diagnostics de runtime.'],
  ['Estável', 'Estable', 'Stable', 'Stable'],
  ['Beta', 'Beta', 'Beta', 'Bêta'],
  ['npm scripts · .nvmrc · NVM · bibliotecas locais', 'scripts npm · .nvmrc · NVM · bibliotecas locales', 'npm scripts · .nvmrc · NVM · local libraries', 'scripts npm · .nvmrc · NVM · bibliothèques locales'],
  ['Wrapper · Spring Boot · Quarkus · módulos', 'Wrapper · Spring Boot · Quarkus · módulos', 'Wrapper · Spring Boot · Quarkus · modules', 'Wrapper · Spring Boot · Quarkus · modules'],
  ['Groovy/Kotlin DSL · bootRun · multiprojeto', 'Groovy/Kotlin DSL · bootRun · multiproyecto', 'Groovy/Kotlin DSL · bootRun · multiproject', 'Groovy/Kotlin DSL · bootRun · multiprojet'],
  ['venv · Poetry · uv · Django · Flask · FastAPI', 'venv · Poetry · uv · Django · Flask · FastAPI', 'venv · Poetry · uv · Django · Flask · FastAPI', 'venv · Poetry · uv · Django · Flask · FastAPI'],
  ['Cargo · workspaces · toolchains', 'Cargo · espacios · toolchains', 'Cargo · workspaces · toolchains', 'Cargo · espaces · toolchains'],
  ['go.mod · go.work · sem download automático', 'go.mod · go.work · sin descarga automática', 'go.mod · go.work · no automatic downloads', 'go.mod · go.work · aucun téléchargement automatique'],
  ['As integrações Beta precisam de mais testes multiplataforma. Issues, fixtures e pull requests são bem-vindos.', 'Las integraciones Beta necesitan más pruebas multiplataforma. Issues, fixtures y pull requests son bienvenidos.', 'Beta integrations need more cross-platform testing. Issues, fixtures, and pull requests are welcome.', 'Les intégrations bêta nécessitent davantage de tests multiplateformes. Issues, fixtures et pull requests sont les bienvenus.'],
  ['Reordene os projetos e mantenha a posição salva por workspace. Novas descobertas entram no fim sem desfazer sua organização.', 'Reordene los proyectos y guarde la posición por espacio de trabajo. Los nuevos proyectos se añaden al final sin alterar su organización.', 'Reorder projects and keep positions saved per workspace. New discoveries are appended without undoing your organization.', 'Réorganisez les projets et enregistrez leur position par espace. Les nouvelles découvertes sont ajoutées à la fin sans modifier votre organisation.'],
  ['Comece em minutos', 'Empiece en minutos', 'Get started in minutes', 'Commencez en quelques minutes'],
  ['Do path ao ambiente rodando em três passos', 'De la ruta al entorno en ejecución en tres pasos', 'From path to running environment in three steps', 'Du chemin à l’environnement actif en trois étapes'],
  ['Crie uma workspace', 'Cree un espacio de trabajo', 'Create a workspace', 'Créez un espace de travail'],
  ['Adicione um ou mais paths de projetos, raízes ou monorepos.', 'Añada una o más rutas de proyectos, raíces o monorepos.', 'Add one or more paths for projects, roots, or monorepos.', 'Ajoutez un ou plusieurs chemins de projets, racines ou monorepos.'],
  ['Revise a descoberta', 'Revise el descubrimiento', 'Review discovery', 'Vérifiez la découverte'],
  ['Acompanhe o scan e confirme ou altere a classificação de cada projeto.', 'Siga el análisis y confirme o cambie la clasificación de cada proyecto.', 'Follow the scan and confirm or change each project classification.', 'Suivez l’analyse et confirmez ou modifiez la classification de chaque projet.'],
  ['Organize, execute e acompanhe', 'Organice, ejecute y supervise', 'Organize, run, and monitor', 'Organisez, exécutez et surveillez'],
  ['Defina a ordem visual, controle processos e concentre os logs em uma tela.', 'Defina el orden visual, controle procesos y reúna los registros en una pantalla.', 'Set the visual order, control processes, and consolidate logs on one screen.', 'Définissez l’ordre visuel, contrôlez les processus et centralisez les journaux sur un seul écran.'],
  ['Seu ambiente, detectado.', 'Su entorno, detectado.', 'Your environment, detected.', 'Votre environnement, détecté.'],
  ['Sistema detectado', 'Sistema detectado', 'Detected system', 'Système détecté'],
  ['Detectando…', 'Detectando…', 'Detecting…', 'Détection…'],
  ['Verificando a melhor versão disponível', 'Buscando la mejor versión disponible', 'Checking the best available version', 'Recherche de la meilleure version disponible'],
  ['Recomendado para você', 'Recomendado para usted', 'Recommended for you', 'Recommandé pour vous'],
  ['Selecionando o instalador compatível…', 'Seleccionando el instalador compatible…', 'Selecting a compatible installer…', 'Sélection du programme d’installation compatible…'],
  ['Baixar instalador', 'Descargar instalador', 'Download installer', 'Télécharger l’installateur'],
  ['Consultando versão…', 'Consultando versión…', 'Checking version…', 'Vérification de la version…'],
  ['Todas as versões disponíveis', 'Todas las versiones disponibles', 'All available versions', 'Toutes les versions disponibles'],
  ['Escolha manualmente o sistema operacional e a arquitetura.', 'Elija manualmente el sistema operativo y la arquitectura.', 'Manually choose the operating system and architecture.', 'Choisissez manuellement le système d’exploitation et l’architecture.'],
  ['Preparamos o instalador recomendado para este dispositivo. Você também pode escolher outra plataforma ou arquitetura.', 'Preparamos el instalador recomendado para este dispositivo. También puede elegir otra plataforma o arquitectura.', 'We selected the recommended installer for this device. You can also choose another platform or architecture.', 'Nous avons sélectionné l’installateur recommandé pour cet appareil. Vous pouvez aussi choisir une autre plateforme ou architecture.'],
  ['Release', 'Versión', 'Release', 'Version'],
  ['Carregando instaladores disponíveis…', 'Cargando instaladores disponibles…', 'Loading available installers…', 'Chargement des installateurs disponibles…'],
  ['Menos terminais. Mais contexto.', 'Menos terminales. Más contexto.', 'Fewer terminals. More context.', 'Moins de terminaux. Plus de contexte.'],
  ['Todo o seu ambiente de desenvolvimento em um único lugar.', 'Todo su entorno de desarrollo en un solo lugar.', 'Your entire development environment in one place.', 'Tout votre environnement de développement au même endroit.'],
  ['Baixe o MFE Runner e simplifique o desenvolvimento local da sua equipe.', 'Descargue MFE Runner y simplifique el desarrollo local de su equipo.', 'Download MFE Runner and simplify local development for your team.', 'Téléchargez MFE Runner et simplifiez le développement local de votre équipe.'],
  ['Escolher meu instalador', 'Elegir mi instalador', 'Choose my installer', 'Choisir mon installateur'],
  ['Ferramenta desktop para executar e supervisionar aplicações e projetos locais.', 'Herramienta de escritorio para ejecutar y supervisar aplicaciones y proyectos locales.', 'Desktop tool to run and supervise local applications and projects.', 'Outil de bureau pour exécuter et superviser les applications et projets locaux.'],
  ['Selecionar versão do MFE Runner', 'Seleccionar versión de MFE Runner', 'Select MFE Runner version', 'Sélectionner la version de MFE Runner'],
  ['Carregando…', 'Cargando…', 'Loading…', 'Chargement…'],
  ['Intel 64 bits', 'Intel de 64 bits', 'Intel 64-bit', 'Intel 64 bits'],
  ['x86 32 bits', 'x86 de 32 bits', 'x86 32-bit', 'x86 32 bits'],
  ['Instalador automático', 'Instalador automático', 'Automatic installer', 'Installateur automatique'],
  ['Debian / Ubuntu', 'Debian / Ubuntu', 'Debian / Ubuntu', 'Debian / Ubuntu'],
  ['Fedora / RHEL', 'Fedora / RHEL', 'Fedora / RHEL', 'Fedora / RHEL'],
  ['Sistema não identificado', 'Sistema no identificado', 'System not identified', 'Système non identifié'],
  ['Arquitetura não informada pelo navegador', 'Arquitectura no informada por el navegador', 'Architecture not reported by the browser', 'Architecture non indiquée par le navigateur'],
  ['Versão {version} · atualização automática disponível', 'Versión {version} · actualización automática disponible', 'Version {version} · automatic update available', 'Version {version} · mise à jour automatique disponible'],
  ['Instalador indisponível', 'Instalador no disponible', 'Installer unavailable', 'Installateur indisponible'],
  ['Escolha outra release ou plataforma na lista abaixo.', 'Elija otra versión o plataforma en la lista siguiente.', 'Choose another release or platform from the list below.', 'Choisissez une autre version ou plateforme dans la liste ci-dessous.'],
  ['MFE Runner para {platform}', 'MFE Runner para {platform}', 'MFE Runner for {platform}', 'MFE Runner pour {platform}'],
  ['Baixar para {platform}', 'Descargar para {platform}', 'Download for {platform}', 'Télécharger pour {platform}'],
  ['Nenhum instalador disponível nesta release.', 'No hay instaladores disponibles para esta versión.', 'No installer is available for this release.', 'Aucun installateur n’est disponible pour cette version.'],
  ['Baixar MFE Runner {version} para {platform}', 'Descargar MFE Runner {version} para {platform}', 'Download MFE Runner {version} for {platform}', 'Télécharger MFE Runner {version} pour {platform}'],
  ['Não foi possível consultar os downloads agora. Tente novamente em alguns instantes.', 'No fue posible consultar las descargas. Inténtelo de nuevo en unos instantes.', 'Downloads could not be retrieved. Try again in a moment.', 'Impossible de consulter les téléchargements. Réessayez dans quelques instants.'],
  ['O catálogo de instaladores está temporariamente indisponível.', 'El catálogo de instaladores no está disponible temporalmente.', 'The installer catalog is temporarily unavailable.', 'Le catalogue des installateurs est temporairement indisponible.'],
  ['Falha ao carregar', 'Error al cargar', 'Failed to load', 'Échec du chargement'],
];

const SITE_CATALOGS = Object.fromEntries(
  ['es', 'en', 'fr'].map((language, languageIndex) => [
    language,
    new Map(SITE_TRANSLATIONS.map((entry) => [entry[0], entry[languageIndex + 1]])),
  ]),
);

function normalizeLanguage(value) {
  const language = String(value || '').toLowerCase().replace('_', '-');
  if (language.startsWith('pt')) return 'pt-BR';
  return SUPPORTED_LANGUAGES.find((candidate) => candidate === language) || null;
}

function detectLanguage() {
  const stored = normalizeLanguage(localStorage.getItem(LANGUAGE_KEY));
  if (stored) return stored;
  for (const language of navigator.languages || [navigator.language]) {
    const normalized = normalizeLanguage(language);
    if (normalized) return normalized;
  }
  return 'pt-BR';
}

let currentLanguage = detectLanguage();
let rerenderRelease = null;
const textSources = new WeakMap();
const attributeSources = new WeakMap();

function translate(source) {
  return currentLanguage === 'pt-BR'
    ? source
    : SITE_CATALOGS[currentLanguage]?.get(source) || source;
}

function translatePage() {
  document.documentElement.lang = currentLanguage;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (node.parentElement?.closest('script, style, code, pre, [data-i18n-ignore]')) continue;
    const rendered = node.textContent.replace(/\s+/g, ' ').trim();
    const previous = textSources.get(node);
    const source = previous?.rendered === rendered ? previous.source : rendered;
    if (!source || !SITE_TRANSLATIONS.some((entry) => entry[0] === source)) continue;
    const translation = translate(source);
    node.textContent = translation;
    textSources.set(node, { source, rendered: translation });
  }
  for (const element of document.querySelectorAll('[aria-label], [title], [alt]')) {
    for (const attribute of ['aria-label', 'title', 'alt']) {
      const rendered = element.getAttribute(attribute);
      if (!rendered) continue;
      let sources = attributeSources.get(element);
      if (!sources) {
        sources = new Map();
        attributeSources.set(element, sources);
      }
      const previous = sources.get(attribute);
      const source = previous?.rendered === rendered ? previous.source : rendered;
      const translation = translate(source);
      element.setAttribute(attribute, translation);
      sources.set(attribute, { source, rendered: translation });
    }
  }
}

function setLanguage(language, persist = true) {
  const normalized = normalizeLanguage(language);
  if (!normalized) return;
  currentLanguage = normalized;
  if (persist) localStorage.setItem(LANGUAGE_KEY, normalized);
  selectors.languageSelect.value = normalized;
  translatePage();
  rerenderRelease?.();
}

const selectors = {
  languageSelect: document.querySelector('[data-language-select]'),
  detectedSystem: document.querySelector('[data-detected-system]'),
  detectedDetail: document.querySelector('[data-detected-detail]'),
  detectedIcon: document.querySelector('[data-detected-icon]'),
  recommendedTitle: document.querySelector('[data-recommended-title]'),
  recommendedDescription: document.querySelector('[data-recommended-description]'),
  recommendedDownload: document.querySelector('[data-recommended-download]'),
  recommendedSize: document.querySelector('[data-recommended-size]'),
  recommendedLabel: document.querySelector('[data-recommended-label]'),
  currentVersion: document.querySelector('[data-current-version]'),
  footerVersion: document.querySelector('[data-footer-version]'),
  releaseSelect: document.querySelector('[data-release-select]'),
  downloadGrid: document.querySelector('[data-download-grid]'),
};

const platformMeta = {
  mac: { name: 'macOS', icon: '●', order: 1 },
  windows: { name: 'Windows', icon: '⊞', order: 2 },
  linux: { name: 'Linux', icon: '◆', order: 3 },
};

function detectPlatform() {
  const source = `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
  let os = 'unknown';
  if (source.includes('mac')) os = 'mac';
  else if (source.includes('win')) os = 'windows';
  else if (source.includes('linux')) os = 'linux';

  let arch = 'unknown';
  if (/arm64|aarch64/.test(source)) arch = 'arm64';
  else if (/i[3-6]86|x86/.test(source) && !/x86_64|win64|wow64/.test(source)) arch = 'ia32';
  else if (/x86_64|x64|win64|wow64|intel/.test(source)) arch = 'x64';

  return { os, arch };
}

async function enrichArchitecture(detected) {
  if (!navigator.userAgentData?.getHighEntropyValues) return detected;
  try {
    const values = await navigator.userAgentData.getHighEntropyValues([
      'architecture',
      'bitness',
    ]);
    const architecture = String(values.architecture || '').toLowerCase();
    const bitness = String(values.bitness || '');
    if (architecture.includes('arm')) detected.arch = 'arm64';
    else if (architecture.includes('x86') && bitness === '32') detected.arch = 'ia32';
    else if (architecture.includes('x86') && bitness === '64') detected.arch = 'x64';
  } catch {
    // A detecção básica continua válida quando o navegador restringe Client Hints.
  }
  return detected;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 100 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function architectureLabel(arch, os = 'unknown') {
  return {
    arm64: os === 'mac' ? 'ARM64 / Apple Silicon' : 'ARM64',
    x64: os === 'mac' ? translate('Intel 64 bits') : 'x86_64 / AMD64',
    ia32: translate('x86 32 bits'),
    universal: translate('Instalador automático'),
  }[arch] || arch.toUpperCase();
}

function platformLabel(download) {
  return [
    platformMeta[download.os]?.name || download.os,
    architectureLabel(download.arch, download.os),
    linuxDistributionLabel(download),
    download.extension?.toUpperCase(),
  ].filter(Boolean).join(' · ');
}

function linuxDistributionLabel(download) {
  if (download.os !== 'linux') return '';
  return translate(download.extension === 'rpm' ? 'Fedora / RHEL' : 'Debian / Ubuntu');
}

function chooseRecommended(downloads, detected) {
  const sameOs = downloads.filter((download) => download.os === detected.os);
  if (!sameOs.length) return downloads[0] || null;

  const exact = sameOs.find((download) => download.arch === detected.arch);
  if (exact) return exact;

  const universal = sameOs.find((download) => download.arch === 'universal');
  if (universal) return universal;

  if (detected.os === 'mac') {
    return sameOs.find((download) => download.arch === 'arm64') || sameOs[0];
  }
  return sameOs[0];
}

function renderDetectedPlatform(detected) {
  const meta = platformMeta[detected.os];
  selectors.detectedSystem.textContent = meta?.name || translate('Sistema não identificado');
  selectors.detectedIcon.textContent = meta?.icon || '◫';
  selectors.detectedDetail.textContent =
    detected.arch === 'unknown'
      ? translate('Arquitetura não informada pelo navegador')
      : architectureLabel(detected.arch, detected.os);
}

function renderRecommended(release, detected) {
  const download = chooseRecommended(release.downloads, detected);
  selectors.currentVersion.textContent = translate('Versão {version} · atualização automática disponível')
    .replace('{version}', release.version);
  selectors.footerVersion.textContent = `MFE Runner v${release.version}`;

  if (!download) {
    selectors.recommendedTitle.textContent = translate('Instalador indisponível');
    selectors.recommendedDescription.textContent =
      translate('Escolha outra release ou plataforma na lista abaixo.');
    return;
  }

  selectors.recommendedTitle.textContent = translate('MFE Runner para {platform}')
    .replace('{platform}', platformMeta[download.os]?.name || download.os);
  selectors.recommendedDescription.textContent = [
    architectureLabel(download.arch, download.os),
    linuxDistributionLabel(download),
  ].filter(Boolean).join(' · ');
  selectors.recommendedSize.textContent = [formatBytes(download.size), download.extension?.toUpperCase()]
    .filter(Boolean)
    .join(' · ');
  selectors.recommendedDownload.href = download.url;
  selectors.recommendedDownload.download = download.file;
  selectors.recommendedDownload.classList.remove('is-disabled');
  selectors.recommendedDownload.removeAttribute('aria-disabled');
  selectors.recommendedLabel.textContent = translate('Baixar para {platform}')
    .replace('{platform}', platformMeta[download.os]?.name || download.os);
}

function renderDownloads(release) {
  selectors.downloadGrid.replaceChildren();
  const sorted = [...release.downloads].sort((a, b) => {
    const platformDifference =
      (platformMeta[a.os]?.order || 99) - (platformMeta[b.os]?.order || 99);
    return platformDifference || a.label.localeCompare(b.label, 'pt-BR');
  });

  if (!sorted.length) {
    const empty = document.createElement('p');
    empty.className = 'download-empty';
    empty.textContent = translate('Nenhum instalador disponível nesta release.');
    selectors.downloadGrid.append(empty);
    return;
  }

  for (const download of sorted) {
    const card = document.createElement('a');
    card.className = 'download-card';
    card.href = download.url;
    card.download = download.file;
    card.setAttribute(
      'aria-label',
      translate('Baixar MFE Runner {version} para {platform}')
        .replace('{version}', release.version)
        .replace('{platform}', platformLabel(download)),
    );

    const icon = document.createElement('span');
    icon.className = 'download-card__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = platformMeta[download.os]?.icon || '◫';

    const text = document.createElement('span');
    const title = document.createElement('strong');
    const detail = document.createElement('small');
    title.textContent = platformMeta[download.os]?.name || download.os;
    detail.textContent = [
      architectureLabel(download.arch, download.os),
      linuxDistributionLabel(download),
      download.extension?.toUpperCase(),
      formatBytes(download.size),
    ].filter(Boolean).join(' · ');
    text.append(title, detail);

    const arrow = document.createElement('i');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↓';
    card.append(icon, text, arrow);
    selectors.downloadGrid.append(card);
  }
}

function renderReleaseOptions(catalog) {
  selectors.releaseSelect.replaceChildren();
  for (const release of catalog.releases) {
    const option = document.createElement('option');
    option.value = release.version;
    option.textContent = `v${release.version}`;
    selectors.releaseSelect.append(option);
  }
}

async function loadCatalog() {
  const response = await fetch(RELEASES_API_URL, {
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`Catálogo indisponível (${response.status})`);
  const releases = await response.json();
  const catalog = catalogFromGitHubReleases(Array.isArray(releases) ? releases : []);
  if (!Array.isArray(catalog.releases) || !catalog.releases.length) {
    throw new Error('Nenhuma release publicada');
  }
  return catalog;
}

async function init() {
  selectors.languageSelect.addEventListener('change', (event) => {
    setLanguage(event.target.value);
  });
  setLanguage(currentLanguage, false);

  const detected = await enrichArchitecture(detectPlatform());
  renderDetectedPlatform(detected);

  try {
    const catalog = await loadCatalog();
    renderReleaseOptions(catalog);
    const selectRelease = () => {
      const release =
        catalog.releases.find((item) => item.version === selectors.releaseSelect.value) ||
        catalog.releases[0];
      renderRecommended(release, detected);
      renderDownloads(release);
    };
    rerenderRelease = selectRelease;
    selectors.releaseSelect.addEventListener('change', selectRelease);
    selectRelease();
  } catch (error) {
    selectors.downloadGrid.innerHTML =
      `<p class="download-empty">${translate('Não foi possível consultar os downloads agora. Tente novamente em alguns instantes.')}</p>`;
    selectors.recommendedDescription.textContent =
      translate('O catálogo de instaladores está temporariamente indisponível.');
    selectors.currentVersion.textContent = error instanceof Error ? error.message : translate('Falha ao carregar');
  }
}

void init();
