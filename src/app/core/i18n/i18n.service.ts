import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type AppLanguage = 'pt-BR' | 'es' | 'en' | 'fr';

export interface LanguageOption {
  code: AppLanguage;
  label: string;
}

type Translation = [source: string, es: string, en: string, fr: string];

const STORAGE_KEY = 'mfe-runner.language';

const TRANSLATIONS: Translation[] = [
  ['Idioma', 'Idioma', 'Language', 'Langue'],
  ['Projetos', 'Proyectos', 'Projects', 'Projets'],
  ['Workspaces', 'Espacios de trabajo', 'Workspaces', 'Espaces de travail'],
  ['Logs', 'Registros', 'Logs', 'Journaux'],
  ['Configurações', 'Configuración', 'Settings', 'Paramètres'],
  ['Gerencie aplicações, projetos, bibliotecas e processos locais em um único lugar.', 'Administre aplicaciones, proyectos, bibliotecas y procesos locales en un solo lugar.', 'Manage local applications, projects, libraries, and processes in one place.', 'Gérez les applications, projets, bibliothèques et processus locaux au même endroit.'],
  ['Nova workspace', 'Nuevo espacio', 'New workspace', 'Nouvel espace'],
  ['Ambiente', 'Entorno', 'Environment', 'Environnement'],
  ['Desenvolvimento', 'Desarrollo', 'Development', 'Développement'],
  ['Homologação', 'Preproducción', 'Staging', 'Préproduction'],
  ['Produção', 'Producción', 'Production', 'Production'],
  ['Supervisor local', 'Supervisor local', 'Local supervisor', 'Superviseur local'],
  ['Conectado', 'Conectado', 'Connected', 'Connecté'],
  ['Indisponível', 'No disponible', 'Unavailable', 'Indisponible'],
  ['Plataforma', 'Plataforma', 'Platform', 'Plateforme'],
  ['Aplicações e projetos descobertos', 'Aplicaciones y proyectos detectados', 'Discovered applications and projects', 'Applications et projets détectés'],
  ['Iniciar todos', 'Iniciar todos', 'Start all', 'Tout démarrer'],
  ['Parar todos', 'Detener todos', 'Stop all', 'Tout arrêter'],
  ['Reiniciar', 'Reiniciar', 'Restart', 'Redémarrer'],
  ['Redescobrir', 'Redetectar', 'Rediscover', 'Redécouvrir'],
  ['Vincular todas', 'Vincular todas', 'Link all', 'Tout lier'],
  ['Atualizar Git', 'Actualizar Git', 'Refresh Git', 'Actualiser Git'],
  ['Configurar workspace', 'Configurar espacio', 'Configure workspace', 'Configurer l’espace'],
  ['Processos locais', 'Procesos locales', 'Local processes', 'Processus locaux'],
  ['Projeto', 'Proyecto', 'Project', 'Projet'],
  ['Porta', 'Puerto', 'Port', 'Port'],
  ['Comando', 'Comando', 'Command', 'Commande'],
  ['Estado', 'Estado', 'Status', 'État'],
  ['Tempo', 'Tiempo', 'Time', 'Durée'],
  ['Ações', 'Acciones', 'Actions', 'Actions'],
  ['Todos', 'Todos', 'All', 'Tous'],
  ['Em execução', 'En ejecución', 'Running', 'En cours'],
  ['Com atenção', 'Con atención', 'Needs attention', 'À surveiller'],
  ['Manifests', 'Manifiestos', 'Manifests', 'Manifestes'],
  ['Fontes somente leitura', 'Fuentes de solo lectura', 'Read-only sources', 'Sources en lecture seule'],
  ['Parado', 'Detenido', 'Stopped', 'Arrêté'],
  ['Iniciando', 'Iniciando', 'Starting', 'Démarrage'],
  ['Vinculando', 'Vinculando', 'Linking', 'Liaison'],
  ['Executando', 'Ejecutando', 'Running', 'En cours'],
  ['Saudável', 'Saludable', 'Healthy', 'Sain'],
  ['Degradado', 'Degradado', 'Degraded', 'Dégradé'],
  ['Parando', 'Deteniendo', 'Stopping', 'Arrêt'],
  ['Falhou', 'Falló', 'Failed', 'Échec'],
  ['Conflito', 'Conflicto', 'Conflict', 'Conflit'],
  ['Biblioteca', 'Biblioteca', 'Library', 'Bibliothèque'],
  ['Aplicação', 'Aplicación', 'Application', 'Application'],
  ['Não associado a um manifest', 'No asociado a un manifiesto', 'Not associated with a manifest', 'Non associé à un manifeste'],
  ['Nenhuma workspace configurada', 'Ningún espacio configurado', 'No workspace configured', 'Aucun espace configuré'],
  ['Crie sua primeira workspace', 'Cree su primer espacio', 'Create your first workspace', 'Créez votre premier espace'],
  ['Informe a aplicação principal e uma ou mais raízes de projetos para começar.', 'Indique la aplicación principal y una o más raíces de proyectos para comenzar.', 'Provide the main application and one or more project roots to get started.', 'Indiquez l’application principale et une ou plusieurs racines de projets pour commencer.'],
  ['Logs dos processos', 'Registros de procesos', 'Process logs', 'Journaux des processus'],
  ['Saída consolidada', 'Salida consolidada', 'Consolidated output', 'Sortie consolidée'],
  ['Voltar', 'Volver', 'Back', 'Retour'],
  ['Limpar', 'Limpiar', 'Clear', 'Effacer'],
  ['Acompanhar', 'Seguir', 'Follow', 'Suivre'],
  ['Abrir em Logs', 'Abrir en registros', 'Open in Logs', 'Ouvrir dans les journaux'],
  ['Pesquisar logs...', 'Buscar registros...', 'Search logs...', 'Rechercher dans les journaux...'],
  ['Pausar', 'Pausar', 'Pause', 'Pause'],
  ['Marcados', 'Marcados', 'Bookmarked', 'Marqués'],
  ['Intervalo', 'Intervalo', 'Range', 'Plage'],
  ['Exportar', 'Exportar', 'Export', 'Exporter'],
  ['Preferências globais', 'Preferencias globales', 'Global preferences', 'Préférences globales'],
  ['Versão global do Node', 'Versión global de Node', 'Global Node version', 'Version globale de Node'],
  ['Detectar .nvmrc', 'Detectar .nvmrc', 'Detect .nvmrc', 'Détecter .nvmrc'],
  ['Versão específica', 'Versión específica', 'Specific version', 'Version spécifique'],
  ['Salvar versão', 'Guardar versión', 'Save version', 'Enregistrer la version'],
  ['Atualizações do MFE Runner', 'Actualizaciones de MFE Runner', 'MFE Runner updates', 'Mises à jour de MFE Runner'],
  ['Versão instalada', 'Versión instalada', 'Installed version', 'Version installée'],
  ['Versão disponível', 'Versión disponible', 'Available version', 'Version disponible'],
  ['Buscando…', 'Buscando…', 'Checking…', 'Recherche…'],
  ['Buscar atualizações', 'Buscar actualizaciones', 'Check for updates', 'Rechercher des mises à jour'],
  ['Baixar atualização', 'Descargar actualización', 'Download update', 'Télécharger la mise à jour'],
  ['Reiniciar e atualizar', 'Reiniciar y actualizar', 'Restart and update', 'Redémarrer et mettre à jour'],
  ['Você já está usando a versão mais recente.', 'Ya está usando la versión más reciente.', 'You are already using the latest version.', 'Vous utilisez déjà la dernière version.'],
  ['Limite de logs', 'Límite de registros', 'Log limit', 'Limite des journaux'],
  ['Fronteira de escrita', 'Límite de escritura', 'Write boundary', 'Limite d’écriture'],
  ['IDE para projetos', 'IDE para proyectos', 'Project IDE', 'IDE des projets'],
  ['Nenhuma IDE detectada', 'No se detectó ningún IDE', 'No IDE detected', 'Aucun IDE détecté'],
  ['Escolher executável…', 'Elegir ejecutable…', 'Choose executable…', 'Choisir un exécutable…'],
  ['Redetectar', 'Volver a detectar', 'Detect again', 'Détecter à nouveau'],
  ['Nome', 'Nombre', 'Name', 'Nom'],
  ['Projeto shell', 'Proyecto shell', 'Shell project', 'Projet shell'],
  ['Escolher…', 'Elegir…', 'Choose…', 'Choisir…'],
  ['Paths de MFEs', 'Rutas de MFEs', 'MFE paths', 'Chemins des MFE'],
  ['Adicionar path', 'Agregar ruta', 'Add path', 'Ajouter un chemin'],
  ['Bibliotecas locais', 'Bibliotecas locales', 'Local libraries', 'Bibliothèques locales'],
  ['Adicionar biblioteca', 'Agregar biblioteca', 'Add library', 'Ajouter une bibliothèque'],
  ['Script de desenvolvimento', 'Script de desarrollo', 'Development script', 'Script de développement'],
  ['Artefato relativo', 'Artefacto relativo', 'Relative artifact', 'Artefact relatif'],
  ['Script de vínculo preferido', 'Script de vínculo preferido', 'Preferred link script', 'Script de liaison préféré'],
  ['Política de Node', 'Política de Node', 'Node policy', 'Politique Node'],
  ['Herdar global', 'Heredar global', 'Inherit global', 'Hériter du global'],
  ['Cancelar', 'Cancelar', 'Cancel', 'Annuler'],
  ['Salvar e redescobrir', 'Guardar y redescubrir', 'Save and rediscover', 'Enregistrer et redécouvrir'],
  ['Criar workspace', 'Crear espacio de trabajo', 'Create workspace', 'Créer l’espace de travail'],
  ['Configuração do projeto', 'Configuración del proyecto', 'Project settings', 'Configuration du projet'],
  ['Execução', 'Ejecución', 'Execution', 'Exécution'],
  ['Comando padrão', 'Comando predeterminado', 'Default command', 'Commande par défaut'],
  ['Nenhum comando disponível', 'Ningún comando disponible', 'No command available', 'Aucune commande disponible'],
  ['Runtime Node', 'Runtime Node', 'Node runtime', 'Runtime Node'],
  ['Herdar configuração da workspace', 'Heredar configuración del espacio', 'Inherit workspace settings', 'Hériter de la configuration de l’espace'],
  ['Detectar pelo .nvmrc', 'Detectar mediante .nvmrc', 'Detect from .nvmrc', 'Détecter via .nvmrc'],
  ['Usar versão específica', 'Usar una versión específica', 'Use a specific version', 'Utiliser une version spécifique'],
  ['Resolução atual', 'Resolución actual', 'Current resolution', 'Résolution actuelle'],
  ['Salvando…', 'Guardando…', 'Saving…', 'Enregistrement…'],
  ['Salvar configurações', 'Guardar configuración', 'Save settings', 'Enregistrer les paramètres'],
];

const CATALOGS = Object.fromEntries(
  (['es', 'en', 'fr'] as const).map((language, languageIndex) => [
    language,
    new Map(TRANSLATIONS.map((entry) => [entry[0], entry[languageIndex + 1]])),
  ]),
) as Record<Exclude<AppLanguage, 'pt-BR'>, Map<string, string>>;

export function normalizeLanguage(value?: string | null): AppLanguage | null {
  const language = value?.toLowerCase().replace('_', '-');
  if (!language) return null;
  if (language.startsWith('pt')) return 'pt-BR';
  if (language.startsWith('es')) return 'es';
  if (language.startsWith('en')) return 'en';
  if (language.startsWith('fr')) return 'fr';
  return null;
}

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly document = inject(DOCUMENT);
  readonly options: LanguageOption[] = [
    { code: 'pt-BR', label: 'Português (Brasil)' },
    { code: 'es', label: 'Español' },
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'Français' },
  ];
  readonly language = signal<AppLanguage>(this.initialLanguage());

  constructor() {
    this.document.documentElement.lang = this.language();
  }

  setLanguage(language: AppLanguage): void {
    if (!this.options.some((option) => option.code === language)) return;
    this.language.set(language);
    this.document.documentElement.lang = language;
    globalThis.localStorage?.setItem(STORAGE_KEY, language);
  }

  translate(source: string, language = this.language()): string {
    if (language === 'pt-BR') return source;
    return CATALOGS[language].get(source) ?? source;
  }

  private initialLanguage(): AppLanguage {
    const stored = normalizeLanguage(globalThis.localStorage?.getItem(STORAGE_KEY));
    if (stored) return stored;
    for (const language of globalThis.navigator?.languages ?? []) {
      const normalized = normalizeLanguage(language);
      if (normalized) return normalized;
    }
    return 'pt-BR';
  }
}
