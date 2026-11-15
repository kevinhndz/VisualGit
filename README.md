# Git Visual

Git Visual convierte lo que haces con Git en una escena animada para explicar repositorios en clase. El agente corre en tu Ubuntu y observa un repositorio real. La pagina puede abrirse en localhost o desde GitHub Pages en **la misma computadora**. Una pagina publicada no puede leer el disco por si sola: siempre necesita el agente local.

## Requisitos

- Ubuntu con [Node.js 18 o superior](https://nodejs.org/en/download).
- Git instalado.
- [GitHub CLI](https://cli.github.com/) y `gh auth login` para mostrar Pull Requests y checks reales. Las funciones locales de Git sirven sin `gh`.

## Empezar en un comando

En este repositorio ejecuta:

```bash
bash install.sh
```

El instalador crea un codigo de emparejamiento, configura `trace2.eventTarget` en tu Git global y arranca el agente. Muestra la URL `http://127.0.0.1:43721`. Abre esa pagina, pega el codigo y pulsa **Conectar**. El agente solo escucha en `127.0.0.1`.

La instalacion tambien crea `~/.local/bin/gitviz` si esa ruta no existe. Si `gitviz` no aparece en tu terminal, usa `~/Documents/robot/gitviz` o agrega `~/.local/bin` a tu `PATH`.

Para observar otro repositorio, detiene el agente y arrancalo desde la carpeta que quieres explicar:

```bash
gitviz stop
cd ~/Documents/mi-clase-git
gitviz start
```

La carpeta puede estar vacia. Asi puedes iniciar el agente, ejecutar `git init` en esa terminal y ver la carpeta y la boveda reaccionar. Para clases en este mismo proyecto, no hace falta cambiar de carpeta.

## Demostracion rapida

Con el agente activo, escribe comandos reales en la terminal del repositorio:

```bash
git init
printf 'hola\n' > ejemplo.txt
git add ejemplo.txt
git restore --staged ejemplo.txt
git add ejemplo.txt
git commit -m "Primer cambio"
git switch -c tema
git push -u origin tema
```

La escena muestra archivos en rojo si Git aun no los sigue, ambar si cambiaron, verde si estan en stage, azul para commits locales y morado para referencias remotas. Cada rama es un cuaderno y cada commit aparece como una hoja. La linea de tiempo explica el resultado del comando. Si el comando falla, la escena muestra un aviso rojo y el codigo de salida.

Tambien se ven ediciones hechas con VS Code o nano porque el agente observa el arbol de archivos y compara snapshots de Git. Para narrar comandos que no son Git, como `cat`, `nano`, `ls` o `touch`, instala el hook opcional en una terminal nueva:

```bash
gitviz hook install zsh
# O: gitviz hook install bash
```

El hook de zsh recibe la linea de comando. El de bash usa `DEBUG` y `PROMPT_COMMAND`; puede interactuar con otras personalizaciones de shell que usan esas mismas funciones. Los archivos ignorados por Git no aparecen en la escena. Los contenidos de archivos y los diffs nunca se envian al navegador; solo nombres, estados, hashes y conteos de lineas. Los comandos que mencionan `.env` se ocultan en la linea de tiempo.

## Frontend desplegado

La pagina estatica se publica en [GitHub Pages](https://kevinhndz.github.io/VisualGit/) desde `frontend/` cuando pasan las pruebas de `main`. Tambien puedes subir solo la carpeta `frontend/` a Netlify, Vercel o Cloudflare Pages. No tiene build y usa rutas relativas.

Abre la pagina publicada en **el mismo Ubuntu donde corre el agente**. Deja la direccion `http://127.0.0.1:43721`, pega el mismo codigo y conecta. La pagina publicada usa HTTPS y el agente usa HTTP local; Chrome puede pedir permiso de acceso a la red local. Los navegadores y sus versiones cambian este comportamiento. [Chrome documenta Local Network Access](https://developer.chrome.com/blog/local-network-access/) y [WebKit documenta sus cambios para localhost](https://bugs.webkit.org/show_bug.cgi?id=171934). Si Safari bloquea la conexion, usa la pagina local o un navegador que permita la conexion en tu version. No se ha probado Safari en este proyecto.

Si publicas en otro dominio, autoriza su origen exacto y reinicia el agente:

```bash
gitviz allow-origin https://tu-dominio.example
gitviz stop
gitviz start
```

`127.0.0.1` siempre apunta a la computadora que abre la pagina. Si abres la pagina en otra computadora, no llegara al agente de tu Ubuntu. Esta version no incluye relay; para proyectar desde otra maquina usa el navegador del Ubuntu conectado por HDMI o duplicacion de pantalla.

## GitHub y CI

El agente consulta `gh pr list` cada cinco segundos. Muestra PR reales, checks reportados por GitHub y el estado de revision. El robot refleja esos checks; el mediador refleja aprobaciones y conflictos. La CI de este repositorio ejecuta pruebas en Node 18, 20 y 22 para cada push o PR a `main`, y despliega `frontend/` a GitHub Pages despues de aprobar los tests.

La consulta remota depende de la red y la API de GitHub; no tiene el objetivo de menos de un segundo de los comandos locales. Esta version muestra checks agregados, no el contenido de logs ni los pasos internos de cada job. Las acciones de crear o fusionar PR se hacen en tu terminal con `gh` o en GitHub.

## Comandos de control

| Comando                    | Uso                                                                            |
| -------------------------- | ------------------------------------------------------------------------------ |
| `gitviz start`             | Observa el directorio actual y sirve el frontend local.                        |
| `gitviz stop`              | Detiene el agente.                                                             |
| `gitviz status`            | Muestra si el agente esta activo.                                              |
| `gitviz token`             | Muestra el codigo de emparejamiento.                                           |
| `gitviz hook install zsh`  | Narra comandos de zsh.                                                         |
| `gitviz hook install bash` | Narra comandos de bash.                                                        |
| `gitviz hook uninstall`    | Retira los bloques agregados a los archivos rc.                                |
| `gitviz uninstall`         | Detiene el agente, retira los hooks, restaura Trace2 y borra su configuracion. |

El instalador guarda su configuracion en `~/.config/gitviz/` y archivos de ejecucion en `~/.local/state/gitviz/`. Si ya habia un valor global de `trace2.eventTarget`, lo guarda y lo restaura al desinstalar. Si ese valor cambia despues de instalar Git Visual, la desinstalacion no lo sobrescribe.

## Pruebas

```bash
npm ci
npm test
npm run format:check
```

Las pruebas crean repositorios temporales, verifican el estado real de Git, el parser porcelain v2, eventos semanticos, emparejamiento con otro origen, la latencia de `git add` y la instalacion reversible. La prueba de origen alojado simula el header del navegador; no equivale a una prueba visual en Chrome o Safari.

## Solucion de problemas

- **No conecta**: comprueba `gitviz status`, el codigo mostrado por `gitviz token` y la URL local.
- **Origen no autorizado**: ejecuta `gitviz allow-origin` con el origen exacto de la pagina y reinicia.
- **No veo comandos de cat o nano**: instala el hook opcional y abre una terminal nueva. Los cambios guardados en archivos se ven sin hook.
- **No veo PR ni CI**: ejecuta `gh auth login`, comprueba que el repositorio tenga remoto GitHub y espera unos segundos.
- **No aparecen archivos ignorados**: es intencional; Git Visual respeta `.gitignore`.
- **Puerto ocupado**: detiene otra instancia con `gitviz stop` o revisa `~/.local/state/gitviz/agent.log`.
