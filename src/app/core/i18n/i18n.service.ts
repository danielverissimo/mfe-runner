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
  ['Projeto · MFE', 'Proyecto · MFE', 'Project · MFE', 'Projet · MFE'],
  ['Projeto · Host', 'Proyecto · Host', 'Project · Host', 'Projet · Hôte'],
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
  ['Aparência', 'Apariencia', 'Appearance', 'Apparence'],
  ['Escolha o tema do aplicativo ou acompanhe automaticamente o sistema operacional.', 'Elija el tema de la aplicación o siga automáticamente el sistema operativo.', 'Choose the application theme or automatically follow the operating system.', 'Choisissez le thème de l’application ou suivez automatiquement le système d’exploitation.'],
  ['Sistema', 'Sistema', 'System', 'Système'],
  ['Acompanha a aparência do sistema operacional.', 'Sigue la apariencia del sistema operativo.', 'Follows the operating system appearance.', 'Suit l’apparence du système d’exploitation.'],
  ['Claro', 'Claro', 'Light', 'Clair'],
  ['Interface clara com contraste confortável.', 'Interfaz clara con un contraste cómodo.', 'Light interface with comfortable contrast.', 'Interface claire avec un contraste confortable.'],
  ['Escuro', 'Oscuro', 'Dark', 'Sombre'],
  ['Mantém a aparência escura original do Runner.', 'Mantiene la apariencia oscura original de Runner.', 'Keeps the Runner original dark appearance.', 'Conserve l’apparence sombre originale du Runner.'],
  ['Tema atualizado.', 'Tema actualizado.', 'Theme updated.', 'Thème mis à jour.'],
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
  ['Defina quantas linhas serão mantidas no buffer em memória de cada processo.', 'Defina cuántas líneas se conservarán en el búfer de memoria de cada proceso.', 'Set how many lines are kept in each process memory buffer.', 'Définissez le nombre de lignes conservées dans le tampon mémoire de chaque processus.'],
  ['Quantidade de linhas por processo', 'Cantidad de líneas por proceso', 'Lines per process', 'Nombre de lignes par processus'],
  ['Salvar limite', 'Guardar límite', 'Save limit', 'Enregistrer la limite'],
  ['Entre 200 e 10.000 linhas.', 'Entre 200 y 10.000 líneas.', 'Between 200 and 10,000 lines.', 'Entre 200 et 10 000 lignes.'],
  ['Limite de logs atualizado.', 'Límite de registros actualizado.', 'Log limit updated.', 'Limite des journaux mise à jour.'],
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
  ['Projetos e raízes', 'Proyectos y raíces', 'Projects and roots', 'Projets et racines'],
  ['O Runner analisa cada path e você confirma a classificação.', 'Runner analiza cada ruta y usted confirma la clasificación.', 'Runner analyzes each path and you confirm its classification.', 'Runner analyse chaque chemin et vous confirmez sa classification.'],
  ['Raiz', 'Raíz', 'Root', 'Racine'],
  ['Monorepo', 'Monorepo', 'Monorepo', 'Monorepo'],
  ['Tipo', 'Tipo', 'Type', 'Type'],
  ['Detectado', 'Detectado', 'Detected', 'Détecté'],
  ['Definido pelo usuário', 'Definido por el usuario', 'User-defined', 'Défini par l’utilisateur'],
  ['Projeto existente', 'Proyecto existente', 'Existing project', 'Projet existant'],
  ['Novo projeto', 'Nuevo proyecto', 'New project', 'Nouveau projet'],
  ['Permitir vínculo local', 'Permitir vínculo local', 'Enable local linking', 'Activer la liaison locale'],
  ['Revisar redescoberta', 'Revisar redetección', 'Review rediscovery', 'Examiner la redécouverte'],
  ['Confirmar redescoberta', 'Confirmar redetección', 'Confirm rediscovery', 'Confirmer la redécouverte'],
  ['Analisando projetos…', 'Analizando proyectos…', 'Analyzing projects…', 'Analyse des projets…'],
  ['Adicione projetos, raízes com vários projetos ou monorepos.', 'Agregue proyectos, raíces con varios proyectos o monorepos.', 'Add projects, roots with multiple projects, or monorepos.', 'Ajoutez des projets, des racines contenant plusieurs projets ou des monorepos.'],
  ['O que você pode adicionar', 'Qué puede agregar', 'What you can add', 'Ce que vous pouvez ajouter'],
  ['Selecione uma pasta; o Runner identifica como ela está organizada e apresenta os projetos encontrados para revisão.', 'Seleccione una carpeta; Runner identifica cómo está organizada y presenta los proyectos encontrados para su revisión.', 'Select a folder; Runner identifies how it is organized and presents the discovered projects for review.', 'Sélectionnez un dossier ; Runner identifie son organisation et présente les projets détectés pour révision.'],
  ['Projeto exato', 'Proyecto exacto', 'Exact project', 'Projet exact'],
  ['Uma pasta que representa uma única aplicação, serviço ou biblioteca.', 'Una carpeta que representa una única aplicación, servicio o biblioteca.', 'A folder that represents a single application, service, or library.', 'Un dossier représentant une seule application, un seul service ou une seule bibliothèque.'],
  ['Raiz com vários projetos', 'Raíz con varios proyectos', 'Root with multiple projects', 'Racine contenant plusieurs projets'],
  ['Uma pasta que contém vários projetos em diretórios internos.', 'Una carpeta que contiene varios proyectos en directorios internos.', 'A folder containing multiple projects in nested directories.', 'Un dossier contenant plusieurs projets dans des répertoires internes.'],
  ['Uma raiz que contém um projeto principal e outros projetos internos.', 'Una raíz que contiene un proyecto principal y otros proyectos internos.', 'A root containing a main project and other nested projects.', 'Une racine contenant un projet principal et d’autres projets internes.'],
  ['Como a análise funciona', 'Cómo funciona el análisis', 'How analysis works', 'Fonctionnement de l’analyse'],
  ['O Runner lê somente metadados reconhecidos, ignora dependências, builds e arquivos de controle de versão, identifica a tecnologia e sugere Projeto ou Biblioteca.', 'Runner solo lee metadatos reconocidos, ignora dependencias, compilaciones y archivos de control de versiones, identifica la tecnología y sugiere Proyecto o Biblioteca.', 'Runner reads only recognized metadata, ignores dependencies, build outputs, and version-control files, identifies the technology, and suggests Project or Library.', 'Runner lit uniquement les métadonnées reconnues, ignore les dépendances, les sorties de build et les fichiers de contrôle de version, identifie la technologie et suggère Projet ou Bibliothèque.'],
  ['Você revisa todas as sugestões antes de salvar. A análise não executa builds ou scripts, não acessa a rede e não altera os arquivos dos projetos.', 'Usted revisa todas las sugerencias antes de guardar. El análisis no ejecuta compilaciones ni scripts, no accede a la red ni modifica los archivos de los proyectos.', 'You review every suggestion before saving. Analysis does not run builds or scripts, access the network, or modify project files.', 'Vous examinez toutes les suggestions avant d’enregistrer. L’analyse n’exécute aucun build ni script, n’accède pas au réseau et ne modifie pas les fichiers des projets.'],
  ['Adicione ao menos um path para iniciar a análise.', 'Agregue al menos una ruta para iniciar el análisis.', 'Add at least one path to start the analysis.', 'Ajoutez au moins un chemin pour lancer l’analyse.'],
  ['Ordem de inicialização', 'Orden de inicio', 'Startup order', 'Ordre de démarrage'],
  ['Mover para cima', 'Mover hacia arriba', 'Move up', 'Déplacer vers le haut'],
  ['Mover para baixo', 'Mover hacia abajo', 'Move down', 'Déplacer vers le bas'],
  ['Mover projeto para cima', 'Mover proyecto hacia arriba', 'Move project up', 'Déplacer le projet vers le haut'],
  ['Mover projeto para baixo', 'Mover proyecto hacia abajo', 'Move project down', 'Déplacer le projet vers le bas'],
  ['Projetos ausentes na nova análise', 'Proyectos ausentes en el nuevo análisis', 'Projects missing from the new analysis', 'Projets absents de la nouvelle analyse'],
  ['Evidências', 'Evidencias', 'Evidence', 'Éléments détectés'],
  ['Pacote', 'Paquete', 'Package', 'Paquet'],
  ['Script de vínculo', 'Script de vínculo', 'Link script', 'Script de liaison'],
  ['Remover path', 'Eliminar ruta', 'Remove path', 'Supprimer le chemin'],
  ['Valores menores iniciam primeiro. A parada usa a ordem inversa.', 'Los valores menores comienzan primero. La detención usa el orden inverso.', 'Lower values start first. Stopping uses the reverse order.', 'Les valeurs inférieures démarrent en premier. L’arrêt utilise l’ordre inverse.'],
  ['Adicione projetos, raízes ou monorepos em uma única etapa.', 'Agregue proyectos, raíces o monorepos en un solo paso.', 'Add projects, roots, or monorepos in one step.', 'Ajoutez des projets, des racines ou des monorepos en une seule étape.'],
  ['Escolha o que acontece com os projetos ao fechar a interface.', 'Elija qué sucede con los proyectos al cerrar la interfaz.', 'Choose what happens to projects when the interface closes.', 'Choisissez ce qui arrive aux projets à la fermeture de l’interface.'],
  ['Estes projetos serão removidos do catálogo e seus processos serão encerrados somente após a confirmação.', 'Estos proyectos se quitarán del catálogo y sus procesos se cerrarán solo después de la confirmación.', 'These projects will be removed from the catalog and their processes will stop only after confirmation.', 'Ces projets seront retirés du catalogue et leurs processus ne seront arrêtés qu’après confirmation.'],
  ['Aguarde', 'Espere', 'Please wait', 'Veuillez patienter'],
  ['Removendo workspace', 'Eliminando espacio de trabajo', 'Removing workspace', 'Suppression de l’espace de travail'],
  ['Parando os projetos e removendo a configuração privada do Runner.', 'Deteniendo los proyectos y eliminando la configuración privada de Runner.', 'Stopping projects and removing the private Runner configuration.', 'Arrêt des projets et suppression de la configuration privée de Runner.'],
  ['Nenhum arquivo dos projetos será excluído.', 'No se eliminará ningún archivo de los proyectos.', 'No project files will be deleted.', 'Aucun fichier de projet ne sera supprimé.'],
  ['Runtimes e ferramentas', 'Runtimes y herramientas', 'Runtimes and tools', 'Runtimes et outils'],
  ['Estável', 'Estable', 'Stable', 'Stable'],
  ['Beta', 'Beta', 'Beta', 'Bêta'],
  ['Detectar automaticamente', 'Detectar automáticamente', 'Detect automatically', 'Détecter automatiquement'],
  ['Selecionar explicitamente', 'Seleccionar explícitamente', 'Select explicitly', 'Sélectionner explicitement'],
  ['Salvar versão do Node', 'Guardar versión de Node', 'Save Node version', 'Enregistrer la version de Node'],
  ['Obter Node.js', 'Obtener Node.js', 'Get Node.js', 'Obtenir Node.js'],
  ['Instalações detectadas', 'Instalaciones detectadas', 'Detected installations', 'Installations détectées'],
  ['Nenhuma instalação encontrada', 'No se encontró ninguna instalación', 'No installation found', 'Aucune installation trouvée'],
  ['Selecionar uma instalação detectada', 'Seleccionar una instalación detectada', 'Select a detected installation', 'Sélectionner une installation détectée'],
  ['Atualizar lista', 'Actualizar lista', 'Refresh list', 'Actualiser la liste'],
  ['Path do runtime ou diretório home', 'Ruta del runtime o directorio home', 'Runtime path or home directory', 'Chemin du runtime ou répertoire home'],
  ['Path do executável', 'Ruta del ejecutable', 'Executable path', 'Chemin de l’exécutable'],
  ['Obter / instalar', 'Obtener / instalar', 'Get / install', 'Obtenir / installer'],
  ['Salvar', 'Guardar', 'Save', 'Enregistrer'],
  ['Tecnologias Beta nesta workspace', 'Tecnologías Beta en este espacio', 'Beta technologies in this workspace', 'Technologies bêta dans cet espace'],
  ['Runtime resolvido', 'Runtime resuelto', 'Resolved runtime', 'Runtime résolu'],
  ['Origem', 'Origen', 'Source', 'Origine'],
  ['Comandos', 'Comandos', 'Commands', 'Commandes'],
  ['Comando usado pelas ações individuais e globais.', 'Comando utilizado por las acciones individuales y globales.', 'Command used by individual and global actions.', 'Commande utilisée par les actions individuelles et globales.'],
  ['O comando foi descoberto estaticamente pelo adaptador', 'El comando fue detectado estáticamente por el adaptador', 'The command was statically discovered by the adapter', 'La commande a été détectée statiquement par l’adaptateur'],
  ['Verificação de saúde', 'Comprobación de estado', 'Health check', 'Contrôle de santé'],
  ['Nenhuma', 'Ninguna', 'None', 'Aucune'],
  ['Processo ativo', 'Proceso activo', 'Active process', 'Processus actif'],
  ['Porta TCP', 'Puerto TCP', 'TCP port', 'Port TCP'],
  ['Endpoint HTTP', 'Endpoint HTTP', 'HTTP endpoint', 'Point de terminaison HTTP'],
  ['Porta do health check', 'Puerto del health check', 'Health check port', 'Port du contrôle de santé'],
  ['Path do endpoint HTTP', 'Ruta del endpoint HTTP', 'HTTP endpoint path', 'Chemin du point de terminaison HTTP'],
  ['O Runner consulta somente o host local e a porta configurada.', 'Runner consulta únicamente el host local y el puerto configurado.', 'Runner checks only the local host and configured port.', 'Runner interroge uniquement l’hôte local et le port configuré.'],
  ['Projeto → workspace → configuração global.', 'Proyecto → espacio → configuración global.', 'Project → workspace → global settings.', 'Projet → espace → paramètres globaux.'],
  ['Política de runtime', 'Política de runtime', 'Runtime policy', 'Politique de runtime'],
  ['Detectar automaticamente por projeto', 'Detectar automáticamente por proyecto', 'Detect automatically per project', 'Détecter automatiquement par projet'],
  ['Usar instalação específica', 'Usar una instalación específica', 'Use a specific installation', 'Utiliser une installation spécifique'],
  ['Executável ou diretório do runtime', 'Ejecutable o directorio del runtime', 'Runtime executable or directory', 'Exécutable ou répertoire du runtime'],
  ['Política da ferramenta de build', 'Política de la herramienta de build', 'Build tool policy', 'Politique de l’outil de build'],
  ['Wrapper ou instalação detectada', 'Wrapper o instalación detectada', 'Wrapper or detected installation', 'Wrapper ou installation détectée'],
  ['Ignorar wrapper e usar executável específico', 'Ignorar wrapper y usar un ejecutable específico', 'Ignore wrapper and use a specific executable', 'Ignorer le wrapper et utiliser un exécutable spécifique'],
  ['Runtimes e ferramentas da workspace', 'Runtimes y herramientas del espacio', 'Workspace runtimes and tools', 'Runtimes et outils de l’espace'],
  ['Somente os ecossistemas encontrados são exibidos.', 'Solo se muestran los ecosistemas encontrados.', 'Only detected ecosystems are shown.', 'Seuls les écosystèmes détectés sont affichés.'],
  ['Herdar configuração global', 'Heredar configuración global', 'Inherit global settings', 'Hériter des paramètres globaux'],
  ['Executável específico', 'Ejecutable específico', 'Specific executable', 'Exécutable spécifique'],
  ['Suporte Beta', 'Soporte Beta', 'Beta support', 'Support bêta'],
  ['Tecnologia', 'Tecnología', 'Technology', 'Technologie'],
  ['Compatibilidade', 'Compatibilidad', 'Compatibility', 'Compatibilité'],
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
