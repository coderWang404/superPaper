const BUILTIN_PLUGINS = [
  {
    id: 'latex-core',
    name: 'latex-core',
    version: '1.0.0',
    displayName: 'LaTeX 核心 Agent 能力包',
    description: '内置 LaTeX 编译诊断、引用修复、学术润色和项目清理 skills。',
    enabled: true,
    skills: [
      'latex-compile-debug',
      'latex-ref-bib-fix',
      'academic-polish',
      'paper-structure-review',
      'project-cleanup',
    ],
    toolPresets: ['latex-readonly', 'compile-check'],
  },
]

export function listBuiltinPlugins() {
  return BUILTIN_PLUGINS.map(plugin => ({ ...plugin }))
}
