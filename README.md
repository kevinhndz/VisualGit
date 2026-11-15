# Git Visual

Git Visual enseña cómo pasan los cambios de tus archivos a staging, commits, ramas y GitHub. El agente se ejecuta en tu computadora y la interfaz está en español. No usa IA, no envía telemetría y los archivos de la interfaz vienen dentro del ejecutable.

Las fuentes DM Sans y Space Grotesk se incluyen localmente. Sus licencias OFL están en `frontend/fonts/`.

## Instalar

Lee [install.sh](install.sh) o [install.ps1](install.ps1) antes de ejecutarlo. Ambos muestran lo que harán y piden confirmación. Descargan la versión publicada y comprueban su SHA-256 antes de instalarla en tu cuenta de usuario.

Linux o macOS, en una terminal:

```sh
curl -fsSLO https://github.com/kevinhndz/VisualGit/releases/latest/download/install.sh && sh install.sh
```

Windows, en PowerShell:

```powershell
Invoke-WebRequest https://github.com/kevinhndz/VisualGit/releases/latest/download/install.ps1 -OutFile install.ps1; .\install.ps1
```

Si Windows muestra SmartScreen, el ejecutable todavía no está firmado. Revisa el archivo y su SHA-256 antes de aceptar la advertencia.

**Alternativa manual:** descarga el ejecutable de tu sistema y `SHA256SUMS` desde la página de Releases, comprueba el hash y pon el ejecutable en una carpeta de tu `PATH` con el nombre `git-visual` (o `git-visual.exe`). Si trabajas desde el código fuente, instala Bun y ejecuta `bun build --compile agent/desktop.mjs --asset ./frontend --outfile git-visual`.

## Usar

Dentro de un repositorio, ejecuta `git visual`. Git busca el ejecutable `git-visual` en tu `PATH`. Se abre una ventana del navegador local. En la terminal aparece un código de seis dígitos; escríbelo en la pantalla **Setup**. El código dura cinco minutos y solo sirve una vez. Tras cinco intentos fallidos se genera otro código. El agente solo escucha en `127.0.0.1`.

```sh
git visual                  # abre el agente y la interfaz
git visual --no-abrir       # solo inicia el agente
git visual --port 43800     # usa un puerto concreto
git visual codigo           # muestra el código actual
git visual estado           # muestra la URL del agente de este repositorio
git visual detener          # detiene ese agente
git visual desinstalar      # retira la instalación del usuario
```

Si inicias la aplicación fuera de un repositorio, Setup permite escribir la ruta de la carpeta que quieres observar. Cada repositorio tiene su propio agente, puerto y código. Las acciones de Git siguen funcionando sin conexión a Internet.

En **Setup** puedes instalar los avisos de Git de este repositorio. Los hooks nuevos llaman primero a tus hooks anteriores; al quitarlos, se restaura su configuración. También puedes añadir o quitar la integración de bash o zsh. Cada botón explica el archivo que cambia. La pantalla **Flujo** conserva las seis escenas; **PR/CI** muestra los datos que conoce el agente; **Commits y ramas** muestra el historial.

## Estado de las fases

La versión de código fuente sigue incluyendo `gitviz`, el antiguo control por Node, para desarrollo. El ejecutable nuevo usa Bun solo al compilar; quien lo descarga no necesita Bun ni Node. La interfaz y sus ilustraciones están incluidas en el binario.

Las pantallas de PR/CI y la terminal visual todavía usan la presentación existente. Los PR locales, CI local, terminal sincronizada, el grafo de página completa y la animación detallada por archivo se desarrollarán en las fases posteriores. La compilación y apertura del ejecutable se comprobaron en Linux x64; los otros sistemas se compilan en el workflow de versiones y necesitan validación en sus equipos respectivos.

## Desarrollo

```sh
npm ci
npm test
npm run format:check
```

La CI existente ejecuta las pruebas en Node 18, 20 y 22. Un tag `v*` activa el workflow que crea ejecutables para Linux x64/arm64, macOS Intel/Apple Silicon y Windows x64, y publica `SHA256SUMS` junto a ellos. El sitio de GitHub Pages sigue disponible para desarrollo; el uso local no lo necesita.
