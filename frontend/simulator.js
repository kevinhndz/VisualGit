export const demoSteps = [
  {
    command: "git init",
    type: "init",
    title: "Nuevo repositorio Git",
    explanation: "Se creo un repositorio Git nuevo en esta carpeta.",
    change: (s) => {
      s.repo = "mi-proyecto";
    },
  },
  {
    command: "nano app.js",
    type: "file",
    title: "Archivo editado",
    explanation:
      "app.js aparecio en tu carpeta de trabajo. Git aun no lo conoce.",
    change: (s) => {
      s.files = [
        { path: "app.js", index: "?", work: "?", added: 4, deleted: 0 },
      ];
    },
  },
  {
    command: "git add app.js",
    type: "add",
    title: "Archivo a la bandeja",
    explanation: "Git preparo app.js para el siguiente commit.",
    change: (s) => {
      s.files[0] = {
        path: "app.js",
        index: "A",
        work: ".",
        added: 4,
        deleted: 0,
      };
    },
  },
  {
    command: 'git commit -m "Primer cambio"',
    type: "commit",
    title: "Commit guardado",
    explanation: "La bandeja se guardo como una hoja del cuaderno main.",
    change: (s) => {
      s.files = [];
      s.head = "a1b2c3d";
      s.branches = [{ name: "main", hash: s.head }];
      s.commits = [{ hash: s.head, branch: "main", subject: "Primer cambio" }];
    },
  },
  {
    command: "git switch -c feature/pagina",
    type: "branch",
    title: "Cuaderno nuevo",
    explanation: "Se creo la rama feature/pagina y HEAD cambio a ella.",
    change: (s) => {
      s.branch = "feature/pagina";
      s.branches.push({ name: s.branch, hash: s.head });
    },
  },
  {
    command: "git push -u origin feature/pagina",
    type: "push",
    title: "Rama en GitHub",
    explanation: "El paquete subio a la nube y creo origin/feature/pagina.",
    change: (s) => {
      s.remotes.push({ name: "origin/feature/pagina", hash: s.head });
    },
  },
  {
    command: "gh pr create",
    type: "pr",
    title: "Pull Request abierto",
    explanation:
      "El robot inicia los checks. El mediador revisa antes de permitir el merge.",
    change: (s) => {
      s.github = {
        prs: [
          {
            number: 1,
            title: "Nueva pagina",
            state: "OPEN",
            headRefName: "feature/pagina",
            baseRefName: "main",
            reviewDecision: "REVIEW_REQUIRED",
            mergeStateStatus: "BLOCKED",
            checks: [{ name: "Unit tests", status: "IN_PROGRESS" }],
          },
        ],
      };
    },
  },
  {
    command: "GitHub Actions",
    type: "ci",
    title: "Pipeline terminado",
    explanation:
      "Las pruebas pasaron. El mediador puede completar la revision.",
    change: (s) => {
      s.github.prs[0].checks[0] = {
        name: "Unit tests",
        status: "COMPLETED",
        conclusion: "SUCCESS",
      };
      s.github.prs[0].reviewDecision = "APPROVED";
      s.github.prs[0].mergeStateStatus = "CLEAN";
    },
  },
];

export function freshDemo() {
  return {
    repo: "mi-proyecto",
    branch: "main",
    head: null,
    files: [],
    branches: [{ name: "main", hash: null }],
    remotes: [],
    commits: [],
    github: { prs: [] },
  };
}
