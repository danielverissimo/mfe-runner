# Landing page do MFE Runner

O container Caddy publica somente a landing page:

```text
https://mferunner.com/
```

A página apresenta o MFE Runner como um gerenciador genérico de ambientes
locais. Ela cobre projetos exatos, raízes, monorepos, serviços, aplicações,
micro frontends e bibliotecas, além de descoberta revisável, ordenação por
workspace, processos persistentes, Node.js, Git, logs e ferramentas de
desenvolvimento.

O conteúdo está disponível em português do Brasil, espanhol, inglês e francês.
Todo novo texto visível deve ter uma entrada correspondente em
`landing-page/app.js`.

Os instaladores e metadados do atualizador ficam exclusivamente nos
[GitHub Releases](https://github.com/danielverissimo/mfe-runner/releases).
A landing page consulta a API pública do GitHub por um proxy de leitura em
`/api/releases` para listar as releases publicadas e recomendar o instalador
adequado ao sistema do visitante. O proxy não armazena binários; os downloads
apontam diretamente para `github.com`.

## Preparação do host

O servidor Ubuntu precisa ter Docker Engine e o plugin Docker Compose. O
usuário `forge` deve poder executar `docker`.

```bash
ssh forge@mferunner.com
docker --version
docker compose version
```

## Deploy da landing page

Execute no macOS, a partir da raiz do projeto:

```bash
npm run deploy:server
curl --fail https://mferunner.com/healthz
```

O comando sincroniza apenas Docker Compose, Caddy e os arquivos da landing
page. Nenhum binário é enviado para `mferunner.com`.

### Isolamento e segurança do deploy

O deploy é deliberadamente limitado ao projeto Compose
`mfe-runner-update-server` e ao serviço `update-server`:

- utiliza staging dentro de `/home/forge/mfe-runner-update-server`;
- valida `compose.yml` e `Caddyfile` antes de substituir os arquivos ativos;
- mantém backups datados em `.deploy-backups/`;
- recria somente `update-server`, sempre com `--no-deps`;
- aguarda o health check e restaura a versão anterior em caso de falha;
- nunca executa `docker compose down`, `docker stop`, `docker rm` ou comandos
  `prune`;
- não lê, altera ou remove containers, volumes, redes, projetos Compose ou
  arquivos do Caddy que estejam fora do diretório exclusivo do MFE Runner.

Não reutilize `MFE_RUNNER_UPDATE_REMOTE_DIR` para uma pasta compartilhada com
outro serviço. O diretório remoto precisa continuar exclusivo do MFE Runner.

Antes do deploy, valide localmente a estrutura estática:

```bash
node --check docker-server/landing-page/app.js
npm run test:deploy-server
```

## Publicação de uma versão

Autentique o GitHub CLI uma vez:

```bash
gh auth login --hostname github.com
gh auth status
```

Depois, gere e publique uma nova versão:

```bash
npm run dist:installers:publish
```

O comando exige uma árvore Git limpa e sincronizada, incrementa a versão patch,
cria e envia o commit da versão, limpa artefatos antigos, gera todos os
instaladores no host macOS e cria uma release pública em
`danielverissimo/mfe-runner`. A release permanece como rascunho enquanto os
arquivos são enviados e só é publicada depois do upload completo. Assim, a tag
da release sempre aponta para o código exato usado no build.

Para publicar os artefatos da versão atual sem executar outro build:

```bash
npm run publish:update
```

O repositório precisa ter uma branch padrão e a release da versão não pode
existir. Releases publicadas são imutáveis nesse fluxo; para corrigir uma
versão, incremente a versão e publique uma nova release.

O script envia:

- `latest*.yml`, usados pelo `electron-updater`;
- DMGs e ZIPs do macOS;
- instaladores NSIS do Windows;
- pacotes DEB do Linux para Debian/Ubuntu;
- pacotes RPM do Linux para Fedora/RHEL;
- blockmaps gerados pelo electron-builder.

Releases em rascunho ou marcadas como pré-release não são oferecidas pelo app
nem pela landing page.
