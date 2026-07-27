# MFE Runner

Aplicação desktop Angular + Electron para descobrir, executar e supervisionar
aplicações, projetos, bibliotecas, processos e logs locais sem alterar os
workspaces gerenciados.

O Runner pode organizar desde uma aplicação monolítica ou SPA isolada até
workspaces com vários projetos relacionados, shells, micro front-ends e
bibliotecas compartilhadas. Micro front-end é um dos cenários suportados, não
um requisito para aproveitar a supervisão de processos, Node, Git, logs e
atalhos de desenvolvimento.

O ícone nativo da janela, Dock e launchers usa a mesma identidade visual
exibida na sidebar. O SVG-fonte e os formatos de empacotamento ficam em
`electron/assets/`; os tamanhos usados pelos temas de ícones do Linux ficam em
`electron/assets/linux-icons/`.

## Requisitos

- Node `24.15.0` recomendado para desenvolver o Runner;
- npm `11` recomendado;
- macOS é a plataforma validada no MVP;
- NVM (`nvm-sh`) para resolver versões declaradas em `.nvmrc`.

## Executar

```bash
npm install
npm start
```

## Idiomas

O aplicativo e a landing page suportam Português do Brasil, Espanhol, Inglês
e Francês. Na primeira execução, o idioma é resolvido pelas preferências do
sistema/navegador, com fallback para Português do Brasil. A seleção feita no
seletor **Idioma** é salva localmente sob a chave `mfe-runner.language` e pode
ser alterada a qualquer momento, sem reiniciar o Runner.

Textos técnicos, comandos, paths e a saída dos processos não são traduzidos.
Isso preserva logs e diagnósticos exatamente como foram emitidos pelas
ferramentas de desenvolvimento. A landing page em
`docker-server/landing-page` usa a mesma lista de idiomas e preferência local.

`npm start` compila o renderer Angular e abre o Electron. Para desenvolvimento
com reload do renderer:

```bash
npm run dev
```

## Fluxo

1. Adicione uma workspace informando nome, o path exato do shell, um ou mais
   paths de MFEs e, opcionalmente, workspaces Angular de bibliotecas locais.
   Cada path de MFE pode apontar para um projeto exato ou para uma raiz
   contendo vários projetos.
2. O Runner percorre somente os paths configurados e ignora `node_modules`,
   `dist`, `.angular`, `.git`, symlinks e diretórios fora dessas raízes.
3. O shell e os projetos descobertos aparecem juntos na tela Projetos, com o
   shell sempre na primeira linha.
4. Scripts, portas, Native Federation, manifests e `.nvmrc` são lidos sem
   modificar os projetos.
5. Os processos são iniciados apenas a partir de scripts existentes no
   `package.json`. `start` é o padrão quando está disponível; uma escolha
   individual posterior é preservada como override privado.
6. Um MFE pode ser ocultado do catálogo. Essa ação registra somente seu ID
   estável na configuração privada; nenhum arquivo da workspace é removido.
7. Cada projeto oferece atalhos para a IDE configurada, pasta, terminal,
   clipboard e endereço local. Os launchers recebem o path como argumento
   separado e nunca executam templates de comandos livres.
8. O contexto Git é consultado somente pelas referências locais. Branch,
   commit, alterações e ahead/behind são informativos; o Runner nunca executa
   `fetch`, checkout, commit ou outra mutação no repositório.
9. Bibliotecas aparecem logo após o shell e podem ser vinculadas a um
   consumidor, a todos os consumidores ou em lote. O Runner executa somente um
   script `link:*` já declarado pelo consumidor, preserva os processos ativos e
   atualiza o status pelo destino real em `node_modules`.

## Bibliotecas locais

Cada biblioteca configurada deve ser um workspace Angular exato com
`package.json`, `angular.json` e exatamente um projeto `library`. O Runner:

- seleciona `watch` como script de desenvolvimento, com fallback para `build`;
- infere o artefato por `ng-package.json` e impede que ele escape da raiz;
- usa um ID estável `library:<id>` e a mesma resolução de Node e Git dos demais
  projetos;
- resolve o vínculo por override do consumidor, script preferido,
  `link:web-common` ou um único `link:*` disponível;
- inicia o watch quando o artefato ainda não existe, aguarda seu
  `package.json`, executa os vínculos sequencialmente e restaura os consumidores
  que estavam ativos.

Bibliotecas e templates nunca são consumidores. Projetos sem script compatível
são ignorados e relatados; sucessos não são desfeitos quando outro vínculo
falha. Remover a biblioteca do Runner não apaga arquivos nem desfaz links
existentes.

A configuração privada usa o formato v4 com `workspaces[]`. Na primeira abertura
após uma versão anterior, o arquivo legado é preservado como
`runner-config.v3.backup.json` (ou variante com timestamp) e o Runner inicia
sem workspaces, evitando inferir associações entre configurações antigas.

## Supervisor persistente

O controle dos processos é executado por um supervisor Node separado da
interface Electron. Ele é iniciado sob demanda com o runtime embutido no
Electron, sem instalar `launchd`, `systemd`, Windows Service ou autostart.

Em **Configurações → Encerramento seguro** há duas políticas:

- **Manter processos executando — recomendado**: fecha completamente a
  interface e mantém somente o supervisor leve. Ao abrir novamente, o Runner
  reconecta e recupera PIDs, estados, tempos e o buffer de logs;
- **Encerrar todos os processos**: o fechamento aguarda a parada segura de
  todos os processos. Se ela falhar, a interface permanece aberta e informa o
  erro.

A comunicação usa socket local por usuário (Unix Domain Socket no macOS/Linux
e Named Pipe no Windows), protocolo versionado e token aleatório privado no
`userData`. O token não é exposto ao renderer nem passado pela linha de
comando. Sem processos ou clientes conectados, o supervisor encerra
automaticamente após 15 segundos.

Essa continuidade cobre o fechamento normal da interface. Reinício da máquina,
logout e falha do próprio supervisor não restauram processos. Empacotamentos
futuros precisam manter habilitado o suporte do Electron a
`ELECTRON_RUN_AS_NODE`.

## Resolução do Node

Cada escopo possui uma política `inherit`, `auto` ou `explicit`:

```text
projeto → workspace → configuração global
```

O modo `auto` procura o `.nvmrc` mais próximo sem sair da raiz aplicável da
workspace. Para
versões exatas, o Runner localiza diretamente o `node` e o `npm` instalados no
NVM e prefixa o `PATH` do processo. Ele não concatena `nvm use` ou comandos
fornecidos pelo usuário em um shell.

No modo `explicit`, o Runner lista as versões já instaladas no `nvm-sh` ou no
NVM for Windows para seleção. A entrada manual permanece disponível para
versões que não apareçam na lista. A consulta lê somente o layout local do NVM:
ela não executa scripts de inicialização, não troca a versão do terminal e não
instala Node.

A política e o comando padrão de cada projeto são editados pela ação
`Configurar projeto` na própria linha. A lista mostra apenas o runtime
efetivamente resolvido; os overrides individuais não ocupam uma segunda tabela.

Uma versão ausente bloqueia o start com diagnóstico. O Runner não instala Node
automaticamente.

## Segurança e isolamento

- renderer Electron com sandbox, `contextIsolation` e sem Node integration;
- preload expõe apenas IPCs específicos e o main valida remetente e payload;
- execução usa `spawn(executable, args, { shell: false })`;
- apenas scripts declarados no `package.json` podem ser iniciados;
- conflito de porta nunca encerra um processo externo automaticamente; a ação
  manual exige inspeção do PID, confirmação nativa e, quando necessário,
  autorização do próprio sistema operacional;
- abertura no navegador aceita somente uma porta local válida e o processo
  principal monta `http://127.0.0.1:<porta>`; o renderer não envia URLs livres;
- stop encerra somente árvores de processos iniciadas pelo Runner;
- logs passam por redação de tokens e campos sensíveis conhecidos;
- pacotes de diagnóstico aplicam uma segunda redação e removem paths absolutos
  por padrão;
- configurações ficam no `userData` privado do Electron;
- nenhum manifest, `.nvmrc`, `package.json`, `.env` ou fonte gerenciada é
  editado diretamente pelo Runner. A única mutação solicitada em um consumidor
  é aquela realizada pelo seu próprio script `link:*`, normalmente em
  `node_modules`.

## Validação

```bash
npm test
npm run lint
npm run build
```

Os testes de descoberta comparam o conteúdo do workspace antes e depois da
varredura para proteger a fronteira de leitura.

Os pacotes para validação nativa são sempre gerados no host macOS:

```bash
npm run dist:mac:arm64
npm run dist:mac:x64
npm run dist:mac:arm64:installer
npm run dist:mac:x64:installer
npm run dist:win:arm64
npm run dist:win:arm64:installer
npm run dist:win:arm64:unpacked
npm run dist:win:ia32
npm run dist:win:ia32:installer
npm run dist:win:ia32:unpacked
npm run dist:linux:arm64
npm run dist:linux:arm64:installer
npm run dist:linux:x64
npm run dist:linux:x64:installer
```

Os instaladores são os artefatos recomendados para distribuição:

- macOS ARM64/Intel: imagens DMG assinadas com o Developer ID disponível no
  Chaves do macOS;
- Windows 11 ARM64 e Windows x86 de 32 bits: instalador NSIS assistido, com
  escolha do diretório, atalhos e desinstalador;
- Ubuntu/Debian ARM64 e x86_64/AMD64: pacotes DEB com integração ao menu de
  aplicativos.

`npm run dist:installers` gera todos esses instaladores sequencialmente no host
macOS. O comando não publica os artefatos.

Todos os comandos `dist:*` começam removendo integralmente as saídas geradas
em `dist/` e `release/`. Isso impede que instaladores, metadados, caches ou
diretórios unpacked de versões anteriores sejam misturados à nova distribuição.
Para executar somente essa limpeza, use `npm run clean:artifacts`.

O comando `npm run publish:update` não executa a limpeza, pois publica os
artefatos que já existem em `release/`.

O comando alternativo `dist:win:arm64` gera
`MFE-Runner-<versão>-windows-arm64.zip`. Copie o ZIP para o Windows, extraia
todo o conteúdo e execute o `MFE Runner.exe` dentro da pasta extraída. Esse
executável não é autocontido: ele depende dos arquivos `icudtl.dat`,
`resources.pak`, DLLs, `locales/` e `resources/` adjacentes. Copiar somente o
`.exe` causa falha do runtime Chromium antes da abertura da interface.

O alvo experimental `dist:win:arm64:portable` continua disponível para
investigação, mas não é o artefato de distribuição validado no Windows 11
ARM64.

O alvo `dist:win:ia32:installer` gera o instalador para Windows x86 de 32 bits.
O Electron 43 é a última série que fornece binários Windows `ia32`; portanto,
essa edição é de compatibilidade legada e não poderá acompanhar uma futura
atualização para Electron 44 ou superior. O comando agregado gera instaladores
NSIS separados para ARM64 e `ia32`. Os scripts de empacotamento fixam o filtro
7z em BCJ porque o extrator embarcado do NSIS não reconhece o filtro ARM64
selecionado automaticamente pelo 7-Zip; sem essa compatibilidade, executável e
DLLs nativas não são instalados.

Os demais diretórios prontos para execução são gravados em
`release/mac-arm64`, `release/mac`, `release/linux-arm64-unpacked` e
`release/linux-unpacked`. Windows e Linux recebem somente artefatos já
construídos no host macOS; não é necessário executar Angular CLI, npm install
ou electron-builder nas máquinas de destino.

O diretório Linux distribuído sem instalador exige que `chrome-sandbox`
preserve proprietário `root:root` e modo `4755`; por isso o pacote DEB é o
formato recomendado para o Ubuntu.

Os DMGs recebem assinatura Developer ID e notarização da Apple. Os scripts de
instalador macOS exigem o perfil `mfe-runner-notary` previamente configurado no
Keychain; o build falha em vez de publicar silenciosamente um aplicativo sem
notarização.
O instalador NSIS permanece sem assinatura até que um certificado de assinatura
de código Windows seja configurado; o Windows pode exibir um aviso do
SmartScreen.

## Atualizações automáticas

O MFE Runner consulta atualizações alguns segundos depois de abrir. A consulta
não baixa nem instala arquivos sem consentimento:

1. quando uma versão nova é encontrada, o usuário escolhe se deseja baixar;
2. o progresso fica visível na interface;
3. depois do download, o usuário confirma a reinicialização e instalação;
4. a política de encerramento seguro continua sendo respeitada.

No macOS, um relançador de contingência aguarda o encerramento da versão
anterior e a atualização do `Info.plist` antes de reabrir o aplicativo. Esse
fallback atua apenas quando necessário e não altera o fluxo de Linux ou
Windows.

A consulta também pode ser iniciada por **Ajuda → Buscar atualizações…** ou na
tela **Configurações → Atualizações do MFE Runner**. Em desenvolvimento, a
função permanece desabilitada para não substituir uma árvore de trabalho local.

Os pacotes usam `electron-updater` com o repositório público oficial no
GitHub:

```text
https://github.com/danielverissimo/mfe-runner/releases
```

O domínio `mferunner.com` publica somente a landing page. Ela consulta a API
pública do GitHub para oferecer downloads, sem manter cópias dos binários.
O Docker Compose, a configuração TLS e os scripts de deploy/publicação ficam
em `docker-server/`. Consulte `docker-server/README.md` antes de publicar.

O build gera, além dos instaladores, os metadados `latest.yml`,
`latest-mac.yml` e `latest-linux-<arquitetura>.yml`, o ZIP exigido pelo
atualizador do macOS e arquivos `blockmap`. O script `publish:update` cria uma
release em rascunho, envia o conjunto completo e somente então a publica como
release mais recente.

Cada atualização exige aumentar `version` no `package.json`. O macOS exige
assinatura e notarização válidas; no Windows, a assinatura Authenticode evita
alertas e impede que uma atualização não assinada substitua uma versão
assinada. O Linux usa o pacote DEB da arquitetura instalada.

Antes da primeira publicação, autentique o GitHub CLI com `gh auth login`.
O repositório deve ter uma branch padrão. O fluxo não sobrescreve releases
existentes: correções exigem uma nova versão.

## Escopo do MVP

Incluído:

- cadastro unificado de workspaces com um shell e múltiplas raízes de MFEs;
- bibliotecas locais opcionais, execução de watch e vínculo individual ou em
  lote por scripts `link:*` existentes;
- catálogo, execução e logs unificados por workspace;
- descoberta e diagnóstico de projetos, manifests, portas e Node;
- abertura do endereço local descoberto no navegador padrão;
- políticas de Node globais, por workspace e por projeto;
- start, stop e restart individual ou global, incluindo o shell;
- health check por porta, `remoteEntry.json`, `remoteEntry.js` ou shell;
- logs consolidados;
- pesquisa textual/regex, níveis, pausa visual, bookmarks, navegação de erros e
  seleção de intervalos nos logs;
- exportação ZIP sanitizada de logs, versões e diagnósticos;
- contexto Git somente leitura e comparação dos projetos com a branch do shell;
- atalhos seguros para IDE, gerenciador de arquivos e terminal;
- supervisor persistente com política configurável de encerramento.

Planejado para uma etapa posterior:

- variáveis personalizadas e segredos via armazenamento do sistema;
- assinatura Authenticode do instalador Windows;
- perfis de dependências configuráveis além da ordem automática
  biblioteca → MFE/aplicação → shell.
